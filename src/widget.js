'use strict';

// Chat do site: o cliente conversa pelo painel dele (estilo Intercom) e a
// conversa cai na mesma caixa de entrada do CRM, junto com WhatsApp e Telegram.
//
// Como o visitante entra: o site do cliente chama `identificar()` com os dados
// da pessoa logada e uma assinatura feita no servidor dele, com o mesmo segredo
// do WIDGET_SEGREDO. É ela que impede alguém de trocar o id no navegador e ler a
// conversa de outra pessoa. Sem o segredo configurado, o chat não abre para
// ninguém.

const crypto = require('node:crypto');
const { proximoProtocolo } = require('./canais');
const { TAMANHO_MAXIMO_ANEXO, ROTULO_MIDIA, tipoDoArquivo } = require('./util');
const { disponibilidadeDaEquipe } = require('./horarios');
const { REABRIR_INBOX_DO_CLIENTE } = require('./inbox-equipe');

const VALIDADE_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const TAMANHO_MAXIMO_MENSAGEM = 4000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Assinatura que o site do cliente calcula no servidor dele:
// HMAC-SHA256 do id do usuário, com o segredo combinado.
function assinar(segredo, id) {
  return crypto.createHmac('sha256', String(segredo)).update(String(id)).digest('hex');
}

// Sem WIDGET_SEGREDO configurado, ninguém entra. O chat do site fica desligado
// em vez de aceitar qualquer pessoa: liberar sem conferir a assinatura deixaria
// a conversa de qualquer cliente à mão de quem soubesse o id dele.
function conferirAssinatura(segredo, id, assinatura) {
  if (!segredo) return false;
  const esperado = assinar(segredo, id);
  const recebido = String(assinatura || '');
  if (recebido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
}

function limpar(valor, tamanho = 191) {
  return String(valor ?? '').trim().slice(0, tamanho);
}

function criarWidget(db, { segredo = '', equipePadraoId = null, arquivos = null, avisos = null, agora: relogio = Date.now } = {}) {
  // Quem avisa o chat aberto que chegou resposta. Pode vir montado aqui ou ser
  // ligado pelo app depois — assim ninguém monta o sistema sem ele por engano.
  let canal = avisos;
  // Encontra (ou cria) o cliente e a conversa dele, e devolve uma chave de acesso.
  async function abrirSessao({ id, nome, email, empresa, pin }) {
    const externo = limpar(id, 120);
    if (!externo) throw new Error('O site precisa informar o id do usuário logado.');
    const emailNovo = limpar(email, 191).toLowerCase();

    let contato = await db.prepare('SELECT * FROM contatos WHERE site_id = ?').get(externo);
    if (!contato) {
      const novo = await db.prepare('INSERT INTO contatos (nome, empresa, email, site_id, pin) VALUES (?, ?, ?, ?, ?)')
        .run(limpar(nome) || `Visitante ${externo}`, limpar(empresa) || null, emailNovo || null, externo, limpar(pin, 32) || null);
      contato = await db.prepare('SELECT * FROM contatos WHERE id = ?').get(Number(novo.lastInsertRowid));
    } else {
      // O site é a fonte da verdade sobre quem está logado: atualiza o que mudou lá.
      const nomeNovo = limpar(nome);
      if (nomeNovo && nomeNovo !== contato.nome) {
        await db.prepare('UPDATE contatos SET nome = ? WHERE id = ?').run(nomeNovo, contato.id);
        contato.nome = nomeNovo;
      }
      const empresaNova = limpar(empresa);
      if (empresaNova && empresaNova !== contato.empresa) await db.prepare('UPDATE contatos SET empresa = ? WHERE id = ?').run(empresaNova, contato.id);
      if (emailNovo && emailNovo !== contato.email) await db.prepare('UPDATE contatos SET email = ? WHERE id = ?').run(emailNovo, contato.id);
      const pinNovo = limpar(pin, 32);
      if (pinNovo && pinNovo !== contato.pin && !contato.pin_validado_em) await db.prepare('UPDATE contatos SET pin = ? WHERE id = ?').run(pinNovo, contato.id);
    }

    // A conversa NÃO nasce aqui. Abrir a dashboard não é pedir atendimento: se
    // criasse agora, a caixa de entrada encheria de linhas "Sem mensagens" de
    // gente que só entrou no painel. Ela nasce na primeira mensagem.
    // Se este cliente já conversou antes, a sessão volta para a mesma conversa
    // — inclusive se estava resolvida, que reabre com o histórico.
    const conversa = await db.prepare("SELECT * FROM conversas WHERE contato_id = ? AND canal = 'widget' ORDER BY id DESC LIMIT 1").get(contato.id);

    const token = crypto.randomBytes(32).toString('base64url');
    const agora = Date.now();
    await db.prepare('INSERT INTO widget_sessoes (token_hash, contato_id, conversa_id, criado_em, expira_em) VALUES (?, ?, ?, ?, ?)')
      .run(hashToken(token), contato.id, conversa ? conversa.id : null, agora, agora + VALIDADE_SESSAO_MS);

    return {
      token,
      conversaId: conversa ? conversa.id : null,
      contato: { id: contato.id, nome: contato.nome, email: emailNovo || contato.email || null },
      protocolo: conversa ? conversa.protocolo : null,
      atendimento: await disponibilidadeDaEquipe(db, relogio()),
    };
  }

  // Chamada no momento em que o cliente realmente fala alguma coisa.
  async function garantirConversa(sessao) {
    if (sessao.conversa_id) return Number(sessao.conversa_id);
    const agora = Date.now();
    const nova = await db.prepare(`
      INSERT INTO conversas (protocolo, contato_id, equipe_id, atendente_id, canal, status, nao_lidas, criada_em, atualizada_em)
      VALUES (?, ?, ?, NULL, 'widget', 'aberta', 0, ?, ?)`)
      .run(await proximoProtocolo(db), sessao.contato_id, equipePadraoId, agora, agora);
    const id = Number(nova.lastInsertRowid);
    // As outras abas do mesmo cliente passam a apontar para esta conversa.
    await db.prepare('UPDATE widget_sessoes SET conversa_id = ? WHERE contato_id = ? AND conversa_id IS NULL')
      .run(id, sessao.contato_id);
    sessao.conversa_id = id;
    return id;
  }

  async function sessaoDoToken(token) {
    if (!token) return null;
    const linha = await db.prepare(`
      SELECT s.*, c.status AS conversa_status
      FROM widget_sessoes s LEFT JOIN conversas c ON c.id = s.conversa_id
      WHERE s.token_hash = ?`).get(hashToken(token));
    if (!linha) return null;
    if (Number(linha.expira_em) < Date.now()) {
      await db.prepare('DELETE FROM widget_sessoes WHERE token_hash = ?').run(hashToken(token));
      return null;
    }
    return linha;
  }

  // Só as mensagens daquela conversa, sem as notas internas da equipe.
  // O arquivo vai como um endereço do próprio CRM (/widget/midia/123): assim o
  // link do S3 nunca aparece no navegador do cliente.
  async function listarMensagens(sessao, desde = 0) {
    const atendimento = await disponibilidadeDaEquipe(db, relogio());
    if (!sessao.conversa_id) return { mensagens: [], total: 0, atendimento };
    const linhas = await db.prepare(`
      SELECT m.id, m.tipo, m.texto, m.criada_em, m.entrega, m.midia_tipo, m.midia_nome, m.midia_mime, m.midia_chave, m.midia_id,
             u.nome AS autor_nome
      FROM mensagens m LEFT JOIN usuarios u ON u.id = m.autor_id
      WHERE m.conversa_id = ? AND m.tipo != 'nota' AND m.id > ?
      ORDER BY m.id`).all(sessao.conversa_id, Number(desde) || 0);
    const total = await db.prepare("SELECT COUNT(*) AS n FROM mensagens WHERE conversa_id = ? AND tipo != 'nota'").get(sessao.conversa_id);
    const mensagens = linhas.map((m) => ({
      id: m.id,
      de: m.tipo === 'cliente' ? 'voce' : 'atendimento',
      texto: m.texto,
      criadaEm: m.criada_em,
      autor: m.tipo === 'cliente' ? null : (m.autor_nome ? String(m.autor_nome).split(' ')[0] : 'Atendimento'),
      midia: (m.midia_chave || m.midia_id)
        ? { tipo: m.midia_tipo || 'documento', nome: m.midia_nome || null, mime: m.midia_mime || null, url: `/widget/midia/${m.id}` }
        : null,
    }));
    return { mensagens, total: Number(total?.n) || 0, atendimento };
  }

  // O arquivo que o cliente anexa no chat do site. Ele vai direto do navegador
  // do cliente para o nosso servidor, e daqui para o nosso S3 — o site onde o
  // chat está embutido não vê o arquivo nem guarda nada.
  async function enviarArquivo(sessao, { bytes, nome, mime }) {
    if (!arquivos?.configurado) throw new Error('Envio de arquivos indisponível no momento.');
    if (!bytes?.length) throw new Error('Nenhum arquivo recebido.');
    if (bytes.length > TAMANHO_MAXIMO_ANEXO) throw new Error('Arquivo muito grande (o limite é 20 MB).');

    const tipo = tipoDoArquivo(mime, nome);
    const conversaId = await garantirConversa(sessao);
    const guardado = await arquivos.enviar(bytes, { nome, tipo: mime, pasta: `conversa-${conversaId}` });

    const agora = Date.now();
    const texto = ROTULO_MIDIA[tipo] || '[Arquivo]';
    const info = await db.prepare(`
      INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, criada_em, midia_tipo, midia_nome, midia_mime, midia_chave, midia_tamanho)
      VALUES (?, 'cliente', NULL, ?, ?, ?, ?, ?, ?, ?)`)
      .run(conversaId, texto, agora, tipo, nome, mime, guardado.chave, guardado.tamanho);
    await db.prepare(`UPDATE conversas SET atualizada_em = ?, nao_lidas = nao_lidas + 1, ${REABRIR_INBOX_DO_CLIENTE} WHERE id = ?`)
      .run(agora, conversaId);

    const id = Number(info.lastInsertRowid);
    canal?.avisar({ origem: 'cliente', conversaId, contatoId: Number(sessao.contato_id) });
    return {
      id, de: 'voce', texto, criadaEm: agora, autor: null,
      midia: { tipo, nome, mime, url: `/widget/midia/${id}` },
    };
  }

  // Só devolve o arquivo se ele for mesmo da conversa daquele visitante.
  async function arquivoDaSessao(sessao, mensagemId) {
    if (!sessao.conversa_id) return null;
    const m = await db.prepare('SELECT * FROM mensagens WHERE id = ? AND conversa_id = ? AND tipo != ?')
      .get(Number(mensagemId) || 0, sessao.conversa_id, 'nota');
    return m && (m.midia_chave || m.midia_id) ? m : null;
  }

  async function enviarMensagem(sessao, texto) {
    const conteudo = String(texto || '').trim().slice(0, TAMANHO_MAXIMO_MENSAGEM);
    if (!conteudo) throw new Error('Escreva a mensagem antes de enviar.');
    const conversaId = await garantirConversa(sessao);
    const agora = Date.now();
    const info = await db.prepare('INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, criada_em) VALUES (?, ?, NULL, ?, ?)')
      .run(conversaId, 'cliente', conteudo, agora);
    await db.prepare(`UPDATE conversas SET atualizada_em = ?, nao_lidas = nao_lidas + 1, ${REABRIR_INBOX_DO_CLIENTE} WHERE id = ?`)
      .run(agora, conversaId);
    canal?.avisar({ origem: 'cliente', conversaId, contatoId: Number(sessao.contato_id) });
    return { id: Number(info.lastInsertRowid), de: 'voce', texto: conteudo, criadaEm: agora, autor: null };
  }

  async function limparSessoesExpiradas() {
    await db.prepare('DELETE FROM widget_sessoes WHERE expira_em < ?').run(Date.now());
  }

  return {
    configurado: Boolean(segredo),
    conferirAssinatura: (id, assinatura) => conferirAssinatura(segredo, id, assinatura),
    abrirSessao,
    sessaoDoToken,
    listarMensagens,
    enviarMensagem,
    enviarArquivo,
    arquivoDaSessao,
    disponibilidade: () => disponibilidadeDaEquipe(db, relogio()),
    usarAvisos: (novo) => { canal = canal || novo; },
    assinarAvisos: (ouvinte) => canal?.assinar(ouvinte),
    anexosAtivos: Boolean(arquivos?.configurado),
    limparSessoesExpiradas,
  };
}

module.exports = { criarWidget, assinar, hashToken, VALIDADE_SESSAO_MS };
