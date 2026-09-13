'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { iniciais, nomeCurto } = require('./util');
const canais = require('./canais');
const { tokenValido } = require('./telegram');
const { normalizarPin } = require('./saldo');
const { LimitadorTentativas } = require('./limitador');
const { interpretarStatus } = require('./uazapi');

const CAIXAS = new Set(['todas', 'minhas', 'sem_resposta']);
const STATUS = new Set(['aberta', 'resolvida']);
const TAMANHO_MAXIMO_MENSAGEM = 4000;
const TAMANHO_MAXIMO_ANEXO = 20 * 1024 * 1024; // 20 MB: é o limite que o Telegram aceita de um bot
const VALIDADE_LINK_ANEXO_S = 15 * 60; // o WhatsApp/Telegram busca o arquivo neste prazo

// Como o arquivo aparece na lista de conversas quando vai sem legenda.
const ROTULO_MIDIA = { imagem: '[Imagem]', video: '[Vídeo]', audio: '[Áudio]', documento: '[Documento]' };

// De que tipo é o arquivo, para o chat mostrar imagem, vídeo, áudio ou documento.
function tipoDoArquivo(mime, nome = '') {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'imagem';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(nome)) return 'imagem';
  if (/\.(mp4|mov|webm|mkv)$/i.test(nome)) return 'video';
  if (/\.(mp3|ogg|oga|m4a|wav|opus)$/i.test(nome)) return 'audio';
  return 'documento';
}

// O nome do arquivo chega codificado no cabeçalho (acentos não passam em cabeçalho puro).
function nomeDoCabecalho(valor, padrao = 'arquivo') {
  let nome = '';
  try {
    nome = decodeURIComponent(String(valor || ''));
  } catch {
    nome = String(valor || '');
  }
  nome = nome.replace(/[\r\n"\\/]+/g, ' ').trim().slice(0, 120);
  return nome || padrao;
}

function lerJson(texto, padrao = null) {
  if (!texto) return padrao;
  try {
    return JSON.parse(texto);
  } catch {
    return padrao;
  }
}

function formatarUsuario(u) {
  if (!u) return null;
  return {
    id: u.id,
    nome: u.nome,
    nomeCurto: nomeCurto(u.nome),
    iniciais: iniciais(u.nome),
    email: u.email,
    papel: u.papel,
    presenca: u.presenca,
  };
}

function formatarPrimeiraResposta(ms) {
  if (ms == null) return '—';
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}min${String(seg).padStart(2, '0')}s`;
}

const SQL_CONVERSAS = `
  SELECT c.id, c.protocolo, c.canal, c.status, c.alerta, c.nao_lidas, c.criada_em, c.atualizada_em,
         c.equipe_id, c.atendente_id, c.canal_id, c.wa_chatid,
         ct.id AS contato_id, ct.nome AS contato_nome, ct.empresa, ct.cnpj, ct.telefone, ct.tg_usuario, ct.tg_id, ct.tg_foto_id, ct.wa_foto_url,
         u.nome AS atendente_nome,
         e.nome AS equipe_nome, e.cor AS equipe_cor,
         um.tipo AS ultima_tipo, um.texto AS ultima_texto, um.criada_em AS ultima_em,
         ua.nome AS ultima_autor
  FROM conversas c
  JOIN contatos ct ON ct.id = c.contato_id
  LEFT JOIN usuarios u ON u.id = c.atendente_id
  LEFT JOIN equipes e ON e.id = c.equipe_id
  LEFT JOIN (
    SELECT m.id, m.conversa_id, m.tipo, m.autor_id, m.texto, m.criada_em,
           ROW_NUMBER() OVER (
             PARTITION BY m.conversa_id
             ORDER BY m.criada_em DESC, m.id DESC
           ) AS posicao
    FROM mensagens m
    WHERE m.tipo != 'nota'
  ) um ON um.conversa_id = c.id AND um.posicao = 1
  LEFT JOIN usuarios ua ON ua.id = um.autor_id
`;

function criarRotasApi(db, opcoes = {}) {
  const telegram = opcoes.telegram || null;
  const saldo = opcoes.saldo || null;
  const arquivos = opcoes.arquivos || null;
  const uazapi = opcoes.uazapi || null;
  const urlBase = typeof opcoes.urlBase === 'function' ? opcoes.urlBase : () => '';
  const r = express.Router();

  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const sql = {
    conversas: db.prepare(`${SQL_CONVERSAS} ORDER BY COALESCE(um.criada_em, c.atualizada_em) DESC, c.id DESC`),
    conversaPorId: db.prepare(`${SQL_CONVERSAS} WHERE c.id = ?`),
    contato: db.prepare(`
      SELECT ct.*, u.nome AS validador
      FROM contatos ct LEFT JOIN usuarios u ON u.id = ct.pin_validado_por
      WHERE ct.id = ?`),
    mensagens: db.prepare(`
      SELECT m.*, u.nome AS autor_nome
      FROM mensagens m LEFT JOIN usuarios u ON u.id = m.autor_id
      WHERE m.conversa_id = ? ORDER BY m.criada_em, m.id`),
    mensagemPorId: db.prepare(`
      SELECT m.*, u.nome AS autor_nome
      FROM mensagens m LEFT JOIN usuarios u ON u.id = m.autor_id
      WHERE m.id = ?`),
    usuariosAtivos: db.prepare('SELECT id, nome, email, papel, presenca FROM usuarios WHERE ativo = 1 ORDER BY nome'),
    membros: db.prepare('SELECT equipe_id, usuario_id FROM equipe_membros'),
    equipes: db.prepare('SELECT id, nome, cor FROM equipes ORDER BY ordem, nome'),
    temposResposta: db.prepare(`
      SELECT
        (SELECT MIN(criada_em) FROM mensagens m WHERE m.conversa_id = c.id AND m.tipo = 'cliente') AS pc,
        (SELECT MIN(criada_em) FROM mensagens m WHERE m.conversa_id = c.id AND m.tipo = 'atendente') AS pa
      FROM conversas c`),
    marcarLida: db.prepare('UPDATE conversas SET nao_lidas = 0 WHERE id = ?'),
    inserirMensagem: db.prepare(`
      INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, entrega, criada_em)
      VALUES (?, ?, ?, ?, ?, ?)`),
    inserirAnexo: db.prepare(`
      INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, entrega, criada_em, midia_tipo, midia_nome, midia_mime, midia_chave, midia_tamanho)
      VALUES (?, 'atendente', ?, ?, 'enviada', ?, ?, ?, ?, ?, ?)`),
    equipeExiste: db.prepare('SELECT 1 FROM equipes WHERE id = ?'),
    usuarioExiste: db.prepare('SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1'),
  };

  function formatarConversa(row, agora = Date.now()) {
    const semResposta = row.status === 'aberta' && row.ultima_tipo === 'cliente';
    return {
      id: row.id,
      protocolo: row.protocolo,
      canal: row.canal,
      status: row.status,
      naoLidas: row.nao_lidas,
      criadaEm: row.criada_em,
      atualizadaEm: row.atualizada_em,
      canalId: row.canal_id,
      waChatid: row.wa_chatid,
      ultimaEm: row.ultima_em,
      ultimaTexto: row.ultima_texto,
      ultimaTipo: row.ultima_tipo,
      ultimaAutor: row.ultima_autor ? nomeCurto(row.ultima_autor) : null,
      semResposta,
      semRespostaMin: semResposta ? Math.max(0, Math.round((agora - row.ultima_em) / 60000)) : null,
      alerta: lerJson(row.alerta),
      contato: {
        id: row.contato_id,
        nome: row.contato_nome,
        empresa: row.empresa,
        cnpj: row.cnpj,
        telefone: row.telefone,
        telegramUsuario: row.tg_usuario || null,
        telegramId: row.tg_id || null,
        foto: (row.tg_foto_id || row.wa_foto_url) ? `/api/contatos/${row.contato_id}/foto` : null,
        iniciais: iniciais(row.contato_nome),
      },
      equipe: row.equipe_id ? { id: row.equipe_id, nome: row.equipe_nome, cor: row.equipe_cor } : null,
      atendente: row.atendente_id
        ? { id: row.atendente_id, nome: row.atendente_nome, nomeCurto: nomeCurto(row.atendente_nome), iniciais: iniciais(row.atendente_nome) }
        : null,
    };
  }

  function formatarMensagem(m) {
    return {
      id: m.id,
      tipo: m.tipo,
      texto: m.texto,
      midia: (m.midia_id || m.midia_chave) ? { tipo: m.midia_tipo || 'documento', nome: m.midia_nome || null, mime: m.midia_mime || null, url: `/api/midia/${m.id}` } : null,
      entrega: m.entrega,
      criadaEm: m.criada_em,
      autor: m.autor_id ? { id: m.autor_id, nome: m.autor_nome, nomeCurto: nomeCurto(m.autor_nome) } : null,
    };
  }

  async function todasConversas() {
    const agora = Date.now();
    return (await sql.conversas.all()).map((row) => formatarConversa(row, agora));
  }

  async function buscarConversa(id) {
    const row = await sql.conversaPorId.get(id);
    return row ? formatarConversa(row) : null;
  }

  async function detalharConversa(c) {
    const ct = await sql.contato.get(c.contato.id);
    const mensagens = (await sql.mensagens.all(c.id)).map(formatarMensagem);
    return {
      ...c,
      contato: {
        ...c.contato,
        dados: lerJson(ct.dados_conta, []),
        pin: ct.pin,
        pinValidadoEm: ct.pin_validado_em,
        pinValidadoPor: ct.validador ? nomeCurto(ct.validador) : null,
      },
      mensagens,
    };
  }

  function idDaRota(req) {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  // Carrega a conversa da rota ou responde 404
  async function comConversa(req, res, next) {
    try {
      const id = idDaRota(req);
      const conversa = id ? await buscarConversa(id) : null;
      if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });
      req.conversa = conversa;
      next();
    } catch (erro) {
      next(erro);
    }
  }

  /* -------------------- rotas -------------------- */

  r.get('/me', (req, res) => res.json({ usuario: formatarUsuario(req.usuario) }));

  r.get('/resumo', async (req, res) => {
    const todas = await todasConversas();
    const abertas = todas.filter((c) => c.status === 'aberta');

    const ativasPor = {};
    for (const c of abertas) if (c.atendente) ativasPor[c.atendente.id] = (ativasPor[c.atendente.id] || 0) + 1;

    const atendentes = (await sql.usuariosAtivos.all()).map((u) => ({ ...formatarUsuario(u), ativas: ativasPor[u.id] || 0 }));
    const membros = await sql.membros.all();
    const equipes = (await sql.equipes.all()).map((e) => ({
      ...e,
      abertas: abertas.filter((c) => c.equipe?.id === e.id).length,
      semResposta: abertas.filter((c) => c.equipe?.id === e.id && c.semResposta).length,
      membros: membros
        .filter((m) => m.equipe_id === e.id)
        .map((m) => atendentes.find((a) => a.id === m.usuario_id))
        .filter(Boolean),
    }));

    const tempos = (await sql.temposResposta.all())
      .filter((t) => t.pc != null && t.pa != null && t.pa >= t.pc)
      .map((t) => t.pa - t.pc);
    const media = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

    res.json({
      usuario: formatarUsuario(req.usuario),
      caixas: {
        todas: abertas.length,
        minhas: abertas.filter((c) => c.atendente?.id === req.usuario.id).length,
        semResposta: abertas.filter((c) => c.semResposta).length,
      },
      equipes,
      atendentes,
      primeiraResposta: formatarPrimeiraResposta(media),
      canais: await resumoCanais(req),
      saldoAtivo: Boolean(saldo && saldo.configurado),
      anexosAtivos: Boolean(arquivos && arquivos.configurado),
    });
  });

  r.get('/conversas', async (req, res) => {
    const caixa = CAIXAS.has(req.query.caixa) ? req.query.caixa : 'todas';
    const equipeId = req.query.equipe ? Number(req.query.equipe) : null;
    const busca = String(req.query.q || '').trim().toLowerCase();
    const limiteResolvidas = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let lista = (await todasConversas()).filter((c) => c.status === 'aberta' || c.atualizadaEm >= limiteResolvidas);
    if (equipeId) lista = lista.filter((c) => c.equipe?.id === equipeId);
    if (caixa === 'minhas') lista = lista.filter((c) => c.atendente?.id === req.usuario.id);
    if (caixa === 'sem_resposta') lista = lista.filter((c) => c.semResposta);
    if (busca) {
      lista = lista.filter((c) => [
        c.contato.nome, c.contato.empresa, c.contato.cnpj, c.contato.telefone, c.protocolo, c.ultimaTexto,
      ].some((v) => v && String(v).toLowerCase().includes(busca)));
    }
    res.json({ conversas: lista });
  });

  r.get('/conversas/:id', comConversa, async (req, res) => {
    await sql.marcarLida.run(req.conversa.id);
    req.conversa.naoLidas = 0;
    res.json({ conversa: await detalharConversa(req.conversa) });
  });

  r.post('/conversas/:id/mensagens', comConversa, async (req, res) => {
    const c = req.conversa;
    const texto = String(req.body?.texto ?? '').trim();
    const tipo = req.body?.tipo === 'nota' ? 'nota' : 'atendente';

    if (!texto) return res.status(400).json({ erro: 'Escreva uma mensagem antes de enviar.' });
    if (texto.length > TAMANHO_MAXIMO_MENSAGEM) {
      return res.status(400).json({ erro: `Mensagem muito longa (máximo ${TAMANHO_MAXIMO_MENSAGEM} caracteres).` });
    }

    const agora = Date.now();
    const info = await sql.inserirMensagem.run(c.id, tipo, req.usuario.id, texto, tipo === 'atendente' ? 'enviada' : null, agora);

    const campos = ['atualizada_em = ?'];
    const valores = [agora];
    if (tipo === 'atendente') {
      // Quem respondeu por último passa a ser o atendente da conversa: é o nome que
      // aparece no selo da lista, porque é quem está atendendo agora.
      if (c.atendente?.id !== req.usuario.id) { campos.push('atendente_id = ?'); valores.push(req.usuario.id); }
      if (c.status === 'resolvida') { campos.push("status = 'aberta'"); }
    }
    valores.push(c.id);
    await db.prepare(`UPDATE conversas SET ${campos.join(', ')} WHERE id = ?`).run(...valores);

    // Conversa vinda de um canal (WhatsApp ou Telegram): envia a resposta por ele
    let erroEnvio = null;
    if (tipo === 'atendente' && c.canalId) {
      const mensagemId = Number(info.lastInsertRowid);
      const canalRow = await db.prepare('SELECT * FROM canais WHERE id = ?').get(c.canalId);
      try {
        if (!canalRow) throw new Error('O canal desta conversa não existe mais.');
        let idExterno = null;
        if (canalRow.tipo === 'telegram') {
          if (!telegram) throw new Error('Integração com Telegram indisponível.');
          if (!c.waChatid) throw new Error('Conversa sem identificação do chat no Telegram.');
          const r2 = await telegram.enviarTexto(canalRow.instancia_token, c.waChatid, texto);
          idExterno = r2?.messageId != null ? `tg:${c.waChatid}:${r2.messageId}` : null;
        } else {
          const numero = c.waChatid ? canais.numeroDoChat(c.waChatid) : canais.somenteDigitos(c.contato.telefone);
          if (!uazapi || !uazapi.configurado) throw new Error('Servidor do WhatsApp não configurado.');
          if (!numero) throw new Error('Conversa sem canal ou número de WhatsApp.');
          const r2 = await uazapi.enviarTexto(canalRow.instancia_token, numero, texto);
          idExterno = r2?.messageid || r2?.id || r2?.key?.id || r2?.message?.messageid || null;
        }
        await db.prepare("UPDATE mensagens SET entrega = 'enviada', externo_id = COALESCE(?, externo_id) WHERE id = ?")
          .run(idExterno ? String(idExterno) : null, mensagemId);
      } catch (erro) {
        erroEnvio = erro.message;
      }
      if (erroEnvio) await db.prepare("UPDATE mensagens SET entrega = 'falhou' WHERE id = ?").run(mensagemId);
    }

    const mensagem = formatarMensagem(await sql.mensagemPorId.get(Number(info.lastInsertRowid)));
    res.status(201).json({ mensagem, conversa: await buscarConversa(c.id), erroEnvio });
  });

  // Anexo enviado pelo atendente: o arquivo vai para o S3 e o canal do cliente
  // recebe um endereço assinado (de poucos minutos) para buscar o arquivo lá.
  r.post('/conversas/:id/anexos', express.raw({ type: () => true, limit: '20mb' }), comConversa, async (req, res) => {
    const c = req.conversa;
    if (!arquivos?.configurado) {
      return res.status(400).json({ erro: 'Envio de anexos indisponível: configure o S3 no servidor (S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY).' });
    }
    const bytes = Buffer.isBuffer(req.body) ? req.body : null;
    if (!bytes?.length) return res.status(400).json({ erro: 'Nenhum arquivo recebido.' });
    if (bytes.length > TAMANHO_MAXIMO_ANEXO) {
      return res.status(413).json({ erro: 'Arquivo muito grande (o limite é 20 MB).' });
    }

    const nome = nomeDoCabecalho(req.get('x-nome-arquivo'));
    const mime = String(req.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    const legenda = nomeDoCabecalho(req.get('x-legenda'), '').slice(0, 1024);
    const tipo = tipoDoArquivo(mime, nome);

    let guardado;
    try {
      guardado = await arquivos.enviar(bytes, { nome, tipo: mime, pasta: `conversa-${c.id}` });
    } catch (erro) {
      console.error('Não foi possível guardar o anexo:', erro.message);
      return res.status(502).json({ erro: 'Não foi possível guardar o arquivo. Tente de novo.' });
    }

    const agora = Date.now();
    const texto = legenda || ROTULO_MIDIA[tipo] || '[Arquivo]';
    const info = await sql.inserirAnexo.run(c.id, req.usuario.id, texto, agora, tipo, nome, mime, guardado.chave, guardado.tamanho);
    const mensagemId = Number(info.lastInsertRowid);

    const campos = ['atualizada_em = ?'];
    const valores = [agora];
    if (c.atendente?.id !== req.usuario.id) { campos.push('atendente_id = ?'); valores.push(req.usuario.id); }
    if (c.status === 'resolvida') campos.push("status = 'aberta'");
    valores.push(c.id);
    await db.prepare(`UPDATE conversas SET ${campos.join(', ')} WHERE id = ?`).run(...valores);

    // Entrega no canal do cliente (a conversa do chat do site não tem canal externo).
    let erroEnvio = null;
    if (c.canalId) {
      const canalRow = await db.prepare('SELECT * FROM canais WHERE id = ?').get(c.canalId);
      try {
        if (!canalRow) throw new Error('O canal desta conversa não existe mais.');
        const url = arquivos.urlAssinada(guardado.chave, VALIDADE_LINK_ANEXO_S);
        let idExterno = null;
        if (canalRow.tipo === 'telegram') {
          if (!telegram?.enviarArquivo) throw new Error('Integração com Telegram indisponível.');
          if (!c.waChatid) throw new Error('Conversa sem identificação do chat no Telegram.');
          const r2 = await telegram.enviarArquivo(canalRow.instancia_token, c.waChatid, { url, tipo, legenda });
          idExterno = r2?.messageId != null ? `tg:${c.waChatid}:${r2.messageId}` : null;
        } else {
          const numero = c.waChatid ? canais.numeroDoChat(c.waChatid) : canais.somenteDigitos(c.contato.telefone);
          if (!uazapi?.configurado) throw new Error('Servidor do WhatsApp não configurado.');
          if (!numero) throw new Error('Conversa sem canal ou número de WhatsApp.');
          const r2 = await uazapi.enviarMidia(canalRow.instancia_token, numero, {
            url, nome, legenda, tipo: { imagem: 'image', video: 'video', audio: 'audio', documento: 'document' }[tipo],
          });
          idExterno = r2?.messageid || r2?.id || r2?.key?.id || null;
        }
        if (idExterno) await db.prepare('UPDATE mensagens SET externo_id = ? WHERE id = ?').run(String(idExterno), mensagemId);
      } catch (erro) {
        erroEnvio = erro.message;
        await db.prepare("UPDATE mensagens SET entrega = 'falhou' WHERE id = ?").run(mensagemId);
      }
    }

    const mensagem = formatarMensagem(await sql.mensagemPorId.get(mensagemId));
    res.status(201).json({ mensagem, conversa: await buscarConversa(c.id), erroEnvio });
  });

  r.patch('/conversas/:id', comConversa, async (req, res) => {
    const corpo = req.body || {};
    const campos = [];
    const valores = [];

    if ('equipeId' in corpo) {
      const v = corpo.equipeId === null || corpo.equipeId === '' ? null : Number(corpo.equipeId);
      if (v !== null && (!Number.isInteger(v) || !await sql.equipeExiste.get(v))) {
        return res.status(400).json({ erro: 'Equipe não encontrada.' });
      }
      campos.push('equipe_id = ?');
      valores.push(v);
    }
    if ('atendenteId' in corpo) {
      const v = corpo.atendenteId === null || corpo.atendenteId === '' ? null : Number(corpo.atendenteId);
      if (v !== null && (!Number.isInteger(v) || !await sql.usuarioExiste.get(v))) {
        return res.status(400).json({ erro: 'Atendente não encontrado.' });
      }
      campos.push('atendente_id = ?');
      valores.push(v);
    }
    if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

    campos.push('atualizada_em = ?');
    valores.push(Date.now(), req.conversa.id);
    await db.prepare(`UPDATE conversas SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
    res.json({ conversa: await buscarConversa(req.conversa.id) });
  });

  r.post('/conversas/:id/status', comConversa, async (req, res) => {
    const status = req.body?.status;
    if (!STATUS.has(status)) return res.status(400).json({ erro: 'Status inválido.' });
    await db.prepare('UPDATE conversas SET status = ?, atualizada_em = ? WHERE id = ?').run(status, Date.now(), req.conversa.id);
    res.json({ conversa: await buscarConversa(req.conversa.id) });
  });

  r.post('/conversas/:id/pin', comConversa, async (req, res) => {
    const acao = req.body?.acao;
    const contatoId = req.conversa.contato.id;
    if (acao === 'validar') {
      const ct = await sql.contato.get(contatoId);
      if (!ct.pin) return res.status(400).json({ erro: 'Este cliente ainda não tem PIN gerado.' });
      await db.prepare('UPDATE contatos SET pin_validado_em = ?, pin_validado_por = ? WHERE id = ?')
        .run(Date.now(), req.usuario.id, contatoId);
    } else if (acao === 'novo') {
      const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await db.prepare('UPDATE contatos SET pin = ?, pin_validado_em = NULL, pin_validado_por = NULL WHERE id = ?')
        .run(pin, contatoId);
    } else {
      return res.status(400).json({ erro: 'Ação inválida.' });
    }
    res.json({ conversa: await detalharConversa(await buscarConversa(req.conversa.id)) });
  });

  /* -------------------- arquivos recebidos (imagens, áudios, documentos) -------------------- */

  const EXTENSAO_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf: 'application/pdf' };

  // O navegador nunca recebe o token do bot: o CRM baixa o arquivo e repassa.
  r.get('/midia/:id', async (req, res) => {
    const id = idDaRota(req);
    const m = id ? await db.prepare('SELECT m.*, c.canal_id FROM mensagens m JOIN conversas c ON c.id = m.conversa_id WHERE m.id = ?').get(id) : null;
    if (!m || (!m.midia_id && !m.midia_chave)) return res.status(404).json({ erro: 'Arquivo não encontrado.' });

    // Guardado no S3: o CRM busca lá e repassa. O endereço do bucket nunca vai para a tela.
    if (m.midia_chave && arquivos?.configurado) {
      try {
        const { bytes, tipo } = await arquivos.baixar(m.midia_chave);
        res.setHeader('Content-Type', m.midia_mime || tipo || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=600');
        if (req.query.baixar === '1') {
          const nome = String(m.midia_nome || `arquivo-${m.id}`).replace(/[\r\n"]/g, '');
          res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
        }
        return res.send(bytes);
      } catch (erro) {
        console.error('Arquivo no S3 indisponível, tentando o canal:', erro.message);
      }
    }

    const canal = m.canal_id ? await db.prepare('SELECT * FROM canais WHERE id = ?').get(m.canal_id) : null;
    if (!canal || canal.tipo !== 'telegram') return res.status(400).json({ erro: 'Este canal ainda não entrega arquivos no CRM.' });
    if (!telegram) return res.status(400).json({ erro: 'Integração com Telegram indisponível.' });

    try {
      const { bytes, tipo, caminho } = await telegram.baixarArquivo(canal.instancia_token, m.midia_id);
      const extensao = String(caminho || '').split('.').pop().toLowerCase();
      res.setHeader('Content-Type', m.midia_mime || tipo || EXTENSAO_MIME[extensao] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=600');
      if (req.query.baixar === '1') {
        const nome = (m.midia_nome || `arquivo-${m.id}.${extensao || 'bin'}`).replace(/[\r\n"]/g, '');
        res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      }
      res.send(bytes);
    } catch (erro) {
      res.status(502).json({ erro: erro.message });
    }
  });

  // Foto de perfil do cliente no Telegram, buscada no momento em que a tela pede.
  r.get('/contatos/:id/foto', async (req, res) => {
    const id = idDaRota(req);
    const ct = id ? await db.prepare('SELECT id, tg_foto_id, wa_foto_url FROM contatos WHERE id = ?').get(id) : null;
    if (!ct || (!ct.tg_foto_id && !ct.wa_foto_url)) return res.status(404).json({ erro: 'Este cliente não tem foto.' });
    try {
      if (ct.tg_foto_id) {
        const canal = await db.prepare("SELECT * FROM canais WHERE tipo = 'telegram' ORDER BY id LIMIT 1").get();
        if (!canal || !telegram) return res.status(400).json({ erro: 'Telegram não está conectado.' });
        const { bytes, tipo } = await telegram.baixarArquivo(canal.instancia_token, ct.tg_foto_id);
        res.setHeader('Content-Type', tipo || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.send(bytes);
      }
      // WhatsApp: o servidor manda o endereço da foto; o CRM busca e repassa.
      const r2 = await fetch(ct.wa_foto_url, { signal: AbortSignal.timeout(15_000) });
      if (!r2.ok) return res.status(502).json({ erro: 'Não foi possível baixar a foto do cliente.' });
      res.setHeader('Content-Type', r2.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(Buffer.from(await r2.arrayBuffer()));
    } catch (erro) {
      res.status(502).json({ erro: erro.message });
    }
  });

  /* -------------------- respostas rápidas -------------------- */

  const ESCOPOS = new Set(['todas', 'equipe', 'eu']);

  function formatarResposta(r, usuarioId) {
    return {
      id: r.id,
      atalho: r.atalho,
      titulo: r.titulo,
      texto: r.texto,
      escopo: r.escopo,
      equipeId: r.equipe_id || null,
      equipeNome: r.equipe_nome || null,
      usos: Number(r.usos || 0),
      minha: Number(r.criado_por) === Number(usuarioId),
      podeEditar: Number(r.criado_por) === Number(usuarioId) || usuarioId === null,
    };
  }

  // Cada pessoa vê: as de todas as equipes, as das equipes dela e as que ela criou só para si.
  async function respostasVisiveis(usuario) {
    const lista = await db.prepare(`
      SELECT r.*, e.nome AS equipe_nome
      FROM respostas_rapidas r
      LEFT JOIN equipes e ON e.id = r.equipe_id
      WHERE r.escopo = 'todas'
         OR (r.escopo = 'eu' AND r.usuario_id = ?)
         OR (r.escopo = 'equipe' AND r.equipe_id IN (SELECT equipe_id FROM equipe_membros WHERE usuario_id = ?))
      ORDER BY r.usos DESC, r.atalho`).all(usuario.id, usuario.id);
    return lista.map((r) => ({ ...formatarResposta(r, usuario.id), podeEditar: Number(r.criado_por) === Number(usuario.id) || usuario.papel === 'admin' }));
  }

  function limparAtalho(valor) {
    return String(valor || '').trim().toLowerCase().replace(/^\/+/, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  r.get('/respostas', async (req, res) => {
    res.json({ respostas: await respostasVisiveis(req.usuario) });
  });

  async function lerCorpoResposta(req, res) {
    const atalho = limparAtalho(req.body?.atalho);
    const titulo = String(req.body?.titulo || '').trim().slice(0, 120);
    const texto = String(req.body?.texto || '').trim().slice(0, 4000);
    const escopo = ESCOPOS.has(req.body?.escopo) ? req.body.escopo : 'todas';
    let equipeId = escopo === 'equipe' ? Number(req.body?.equipeId) : null;

    if (atalho.length < 2) { res.status(400).json({ erro: 'O atalho precisa ter pelo menos 2 letras (exemplo: /estorno).' }); return null; }
    if (!titulo) { res.status(400).json({ erro: 'Dê um título para a resposta.' }); return null; }
    if (!texto) { res.status(400).json({ erro: 'Escreva a mensagem da resposta.' }); return null; }
    if (escopo === 'equipe') {
      if (!Number.isInteger(equipeId) || !await sql.equipeExiste.get(equipeId)) { res.status(400).json({ erro: 'Escolha uma equipe válida.' }); return null; }
    } else {
      equipeId = null;
    }
    return { atalho, titulo, texto, escopo, equipeId };
  }

  r.post('/respostas', async (req, res) => {
    const dados = await lerCorpoResposta(req, res);
    if (!dados) return;
    const repetido = await db.prepare('SELECT id FROM respostas_rapidas WHERE atalho = ? AND (escopo != ? OR usuario_id = ?)')
      .get(dados.atalho, 'eu', req.usuario.id);
    if (repetido) return res.status(409).json({ erro: `O atalho /${dados.atalho} já está em uso.` });

    const agora = Date.now();
    const info = await db.prepare(`INSERT INTO respostas_rapidas (atalho, titulo, texto, escopo, equipe_id, usuario_id, criado_por, usos, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(dados.atalho, dados.titulo, dados.texto, dados.escopo, dados.equipeId,
        dados.escopo === 'eu' ? req.usuario.id : null, req.usuario.id, agora, agora);
    res.status(201).json({ respostas: await respostasVisiveis(req.usuario), id: Number(info.lastInsertRowid) });
  });

  r.patch('/respostas/:id', async (req, res) => {
    const id = idDaRota(req);
    const atual = id ? await db.prepare('SELECT * FROM respostas_rapidas WHERE id = ?').get(id) : null;
    if (!atual) return res.status(404).json({ erro: 'Resposta rápida não encontrada.' });
    if (Number(atual.criado_por) !== Number(req.usuario.id) && req.usuario.papel !== 'admin') {
      return res.status(403).json({ erro: 'Só quem criou a resposta (ou um administrador) pode alterá-la.' });
    }
    const dados = await lerCorpoResposta(req, res);
    if (!dados) return;
    const repetido = await db.prepare('SELECT id FROM respostas_rapidas WHERE atalho = ? AND id != ?').get(dados.atalho, id);
    if (repetido) return res.status(409).json({ erro: `O atalho /${dados.atalho} já está em uso.` });

    await db.prepare('UPDATE respostas_rapidas SET atalho = ?, titulo = ?, texto = ?, escopo = ?, equipe_id = ?, usuario_id = ?, atualizado_em = ? WHERE id = ?')
      .run(dados.atalho, dados.titulo, dados.texto, dados.escopo, dados.equipeId,
        dados.escopo === 'eu' ? req.usuario.id : null, Date.now(), id);
    res.json({ respostas: await respostasVisiveis(req.usuario) });
  });

  r.delete('/respostas/:id', async (req, res) => {
    const id = idDaRota(req);
    const atual = id ? await db.prepare('SELECT * FROM respostas_rapidas WHERE id = ?').get(id) : null;
    if (!atual) return res.status(404).json({ erro: 'Resposta rápida não encontrada.' });
    if (Number(atual.criado_por) !== Number(req.usuario.id) && req.usuario.papel !== 'admin') {
      return res.status(403).json({ erro: 'Só quem criou a resposta (ou um administrador) pode excluí-la.' });
    }
    await db.prepare('DELETE FROM respostas_rapidas WHERE id = ?').run(id);
    res.json({ respostas: await respostasVisiveis(req.usuario) });
  });

  // Conta quantas vezes cada atalho foi usado, para as mais usadas ficarem no topo.
  r.post('/respostas/:id/uso', async (req, res) => {
    const id = idDaRota(req);
    if (!id) return res.status(404).json({ erro: 'Resposta rápida não encontrada.' });
    await db.prepare('UPDATE respostas_rapidas SET usos = usos + 1 WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  /* -------------------- consulta de saldo pelo PIN -------------------- */

  // A chave do agente fica só aqui no servidor. O navegador manda apenas o PIN.
  // Limite por atendente para evitar consulta em massa (tudo fica registrado do outro lado).
  const limitadorSaldo = new LimitadorTentativas({ maximo: 60, janelaMs: 5 * 60 * 1000 });

  r.post('/suporte/saldo', async (req, res) => {
    if (!saldo || !saldo.configurado) {
      return res.status(400).json({ erro: 'Consulta de saldo não configurada. Preencha SALDO_TOKEN no arquivo .env e reinicie o sistema.' });
    }
    const pin = normalizarPin(req.body?.pin);
    if (pin === null) return res.status(400).json({ erro: 'Digite o PIN do cliente (só números).' });

    const chave = `saldo:${req.usuario.id}`;
    const bloqueio = limitadorSaldo.bloqueadoPor(chave);
    if (bloqueio > 0) {
      return res.status(429).json({ erro: `Muitas consultas seguidas. Tente de novo em ${Math.ceil(bloqueio / 60000)} minuto(s).` });
    }
    limitadorSaldo.registrarFalha(chave);

    try {
      const cliente = await saldo.consultarPorPin(pin);
      // Consulta que deu certo confere o PIN: guarda no cliente da conversa.
      let conversa = null;
      const id = Number(req.body?.conversaId);
      const linha = Number.isInteger(id) && id > 0 ? await buscarConversa(id) : null;
      if (linha) {
        await db.prepare('UPDATE contatos SET pin = ?, pin_validado_em = ?, pin_validado_por = ? WHERE id = ?')
          .run(String(pin), Date.now(), req.usuario.id, linha.contato.id);
        conversa = await detalharConversa(await buscarConversa(id));
      }
      res.json({ cliente, conversa });
    } catch (erro) {
      const status = erro.naoEncontrado ? 404 : (erro.status === 400 ? 400 : 502);
      res.status(status).json({ erro: erro.message, naoEncontrado: Boolean(erro.naoEncontrado) });
    }
  });

  /* -------------------- canais (WhatsApp via uazapi e Telegram) -------------------- */

  function exigirAdmin(req, res, next) {
    if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas administradores podem gerenciar canais.' });
    next();
  }

  function exigirUazapi(req, res, next) {
    if (!uazapi || !uazapi.configurado) {
      return res.status(400).json({ erro: 'Servidor do WhatsApp não configurado. Preencha UAZAPI_URL e UAZAPI_ADMIN_TOKEN no arquivo .env e reinicie o sistema.' });
    }
    next();
  }

  // Canais do Telegram não dependem do servidor do WhatsApp.
  async function exigirUazapiParaWhatsapp(req, res, next) {
    const id = idDaRota(req);
    const row = id ? await sqlCanal.get(id) : null;
    if (row && row.tipo === 'telegram') return next();
    return exigirUazapi(req, res, next);
  }

  function urlWebhook(req, row) {
    return `${urlBase(req)}/webhook/uazapi/${row.webhook_segredo}`;
  }

  function avisoWebhook(url) {
    let host = '';
    try { host = new URL(url).hostname; } catch { return 'Endereço do webhook inválido.'; }
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0)/.test(host) || !host.includes('.');
    return local
      ? 'O servidor do WhatsApp não consegue chegar neste endereço. Publique o CRM na internet e configure BASE_URL no .env para receber mensagens.'
      : null;
  }

  function formatarCanal(req, row) {
    const ehTelegram = row.tipo === 'telegram';
    const url = ehTelegram ? null : urlWebhook(req, row);
    return {
      id: row.id,
      tipo: row.tipo,
      nome: row.nome,
      status: row.status,
      numero: row.numero,
      numeroFormatado: row.numero ? (ehTelegram ? `@${row.numero}` : canais.formatarNumero(row.numero)) : null,
      perfil: row.perfil_nome,
      webhookUrl: url,
      webhookAviso: url ? avisoWebhook(url) : null,
      recebendo: ehTelegram ? Boolean(telegram?.sondagem?.ativo(row.id)) : null,
      ultimoErro: row.ultimo_erro,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
    };
  }

  async function resumoCanais(req) {
    const lista = (await db.prepare('SELECT * FROM canais ORDER BY id').all()).map((c) => formatarCanal(req, c));
    const whats = lista.filter((c) => c.tipo !== 'telegram');
    const tg = lista.filter((c) => c.tipo === 'telegram');
    return [
      { id: 'whatsapp', nome: 'WhatsApp', conectado: whats.some((c) => c.status === 'connected'), configurado: Boolean(uazapi && uazapi.configurado), canais: whats },
      { id: 'telegram', nome: 'Telegram', conectado: tg.some((c) => c.status === 'connected'), configurado: Boolean(telegram), canais: tg },
    ];
  }

  const sqlCanal = db.prepare('SELECT * FROM canais WHERE id = ?');

  async function canalDaRota(req, res) {
    const id = idDaRota(req);
    const row = id ? await sqlCanal.get(id) : null;
    if (!row) res.status(404).json({ erro: 'Canal não encontrado.' });
    return row;
  }

  async function aplicarStatus(row, st) {
    await db.prepare(`UPDATE canais SET status = ?, numero = COALESCE(?, numero), perfil_nome = COALESCE(?, perfil_nome),
      instancia_id = COALESCE(?, instancia_id), ultimo_erro = NULL, atualizado_em = ? WHERE id = ?`)
      .run(st.status, st.numero, st.perfil, st.instanciaId, Date.now(), row.id);
  }

  async function registrarErro(row, erro) {
    await db.prepare('UPDATE canais SET ultimo_erro = ?, atualizado_em = ? WHERE id = ?')
      .run(String(erro.message || erro).slice(0, 500), Date.now(), row.id);
  }

  async function configurarWebhookDoCanal(req, row) {
    const url = urlWebhook(req, row);
    await uazapi.configurarWebhook(row.instancia_token, {
      url,
      events: ['messages', 'messages_update', 'connection'],
      enabled: true,
      excludeMessages: ['wasSentByApi'],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    });
    return url;
  }

  r.get('/canais', exigirAdmin, async (req, res) => {
    const lista = (await db.prepare('SELECT * FROM canais ORDER BY id').all()).map((c) => formatarCanal(req, c));
    res.json({ configurado: Boolean(uazapi && uazapi.configurado), telegram: Boolean(telegram), servidor: uazapi ? uazapi.base : '', canais: lista });
  });

  r.post('/canais', exigirAdmin, exigirUazapi, async (req, res) => {
    const nome = String(req.body?.nome || '').trim().slice(0, 60) || 'WhatsApp';
    let resposta;
    try {
      resposta = await uazapi.criarInstancia(nome);
    } catch (erro) {
      return res.status(502).json({ erro: erro.message });
    }
    const inst = resposta?.instance && typeof resposta.instance === 'object' ? resposta.instance : (resposta || {});
    const token = inst.token || resposta?.token;
    if (!token) return res.status(502).json({ erro: 'O servidor do WhatsApp não devolveu o token da instância.' });

    const agora = Date.now();
    const id = Number((await db.prepare(`
      INSERT INTO canais (tipo, nome, instancia_id, instancia_token, webhook_segredo, status, criado_em, atualizado_em)
      VALUES ('whatsapp', ?, ?, ?, ?, 'disconnected', ?, ?)`)
      .run(nome, inst.id || null, String(token), canais.novoSegredo(), agora, agora)).lastInsertRowid);
    const row = await sqlCanal.get(id);
    try {
      await configurarWebhookDoCanal(req, row);
    } catch (erro) {
      await registrarErro(row, new Error(`Webhook não configurado: ${erro.message}`));
    }
    res.status(201).json({ canal: formatarCanal(req, await sqlCanal.get(id)) });
  });

  r.post('/canais/telegram', exigirAdmin, async (req, res) => {
    if (!telegram) return res.status(400).json({ erro: 'Integração com Telegram indisponível.' });
    const token = String(req.body?.token || '').trim();
    if (!tokenValido(token)) {
      return res.status(400).json({ erro: 'Token do bot inválido. Ele tem o formato 123456789:AAAA… e é fornecido pelo @BotFather no Telegram.' });
    }
    let bot;
    try {
      bot = await telegram.validarToken(token);
    } catch (erro) {
      return res.status(erro.status === 401 || erro.status === 404 || erro.status === 400 ? 400 : 502).json({ erro: erro.message });
    }
    const existente = await db.prepare("SELECT id FROM canais WHERE tipo = 'telegram' AND (instancia_id = ? OR instancia_token = ?)").get(bot.id, token);
    if (existente) return res.status(409).json({ erro: `Este bot (@${bot.usuario || bot.id}) já está conectado.` });

    const agora = Date.now();
    const nome = String(req.body?.nome || '').trim().slice(0, 60) || bot.nome || 'Telegram';
    const id = Number((await db.prepare(`
      INSERT INTO canais (tipo, nome, instancia_id, instancia_token, webhook_segredo, numero, perfil_nome, status, criado_em, atualizado_em)
      VALUES ('telegram', ?, ?, ?, ?, ?, ?, 'connected', ?, ?)`)
      .run(nome, bot.id, token, canais.novoSegredo(), bot.usuario, bot.nome, agora, agora)).lastInsertRowid);
    try { await telegram.removerWebhook(token); } catch { /* segue com a consulta contínua */ }
    await canais.ligarTelegram(db, telegram, await sqlCanal.get(id));
    res.status(201).json({ canal: formatarCanal(req, await sqlCanal.get(id)) });
  });

  r.post('/canais/:id/conectar', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = await canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') {
      if (!telegram) return res.status(400).json({ erro: 'Integração com Telegram indisponível.' });
      try {
        const bot = await telegram.validarToken(row.instancia_token);
        await db.prepare("UPDATE canais SET status = 'connected', numero = ?, perfil_nome = ?, ultimo_erro = NULL, atualizado_em = ? WHERE id = ?")
          .run(bot.usuario, bot.nome, Date.now(), row.id);
        try { await telegram.removerWebhook(row.instancia_token); } catch { /* segue */ }
        await canais.ligarTelegram(db, telegram, await sqlCanal.get(row.id));
        return res.json({ status: 'connected', canal: formatarCanal(req, await sqlCanal.get(row.id)) });
      } catch (erro) {
        await registrarErro(row, erro);
        await db.prepare("UPDATE canais SET status = 'disconnected' WHERE id = ?").run(row.id);
        return res.status(502).json({ erro: erro.message });
      }
    }
    const telefone = canais.somenteDigitos(req.body?.telefone);
    if (req.body?.telefone && (telefone.length < 10 || telefone.length > 15)) {
      return res.status(400).json({ erro: 'Digite o número com o código do país e o DDD. Exemplo: 55 31 99999-0000.' });
    }
    try {
      const st = interpretarStatus(await uazapi.conectar(row.instancia_token, telefone || undefined));
      await aplicarStatus(row, st);
      res.json({ status: st.status, qrcode: st.qrcode, paircode: st.paircode, canal: formatarCanal(req, await sqlCanal.get(row.id)) });
    } catch (erro) {
      await registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.get('/canais/:id/status', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = await canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') return res.json({ status: row.status, canal: formatarCanal(req, row) });
    try {
      const st = interpretarStatus(await uazapi.status(row.instancia_token));
      await aplicarStatus(row, st);
      res.json({ status: st.status, qrcode: st.qrcode, paircode: st.paircode, canal: formatarCanal(req, await sqlCanal.get(row.id)) });
    } catch (erro) {
      await registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.post('/canais/:id/desconectar', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = await canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') {
      telegram?.sondagem?.parar(row.id);
      await db.prepare("UPDATE canais SET status = 'disconnected', ultimo_erro = NULL, atualizado_em = ? WHERE id = ?").run(Date.now(), row.id);
      return res.json({ canal: formatarCanal(req, await sqlCanal.get(row.id)) });
    }
    try {
      await uazapi.desconectar(row.instancia_token);
      await db.prepare("UPDATE canais SET status = 'disconnected', ultimo_erro = NULL, atualizado_em = ? WHERE id = ?").run(Date.now(), row.id);
      res.json({ canal: formatarCanal(req, await sqlCanal.get(row.id)) });
    } catch (erro) {
      await registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.post('/canais/:id/webhook', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = await canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') return res.status(400).json({ erro: 'O Telegram não usa webhook neste CRM: as mensagens são buscadas automaticamente.' });
    try {
      const url = await configurarWebhookDoCanal(req, row);
      await db.prepare('UPDATE canais SET ultimo_erro = NULL, atualizado_em = ? WHERE id = ?').run(Date.now(), row.id);
      res.json({ url, canal: formatarCanal(req, await sqlCanal.get(row.id)) });
    } catch (erro) {
      await registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.get('/canais/:id/eventos', exigirAdmin, async (req, res) => {
    const row = await canalDaRota(req, res);
    if (!row) return;
    const eventos = (await db.prepare('SELECT id, tipo, corpo, recebido_em FROM canal_eventos WHERE canal_id = ? ORDER BY id DESC LIMIT 50')
      .all(row.id))
      .map((e) => {
        let corpo = e.corpo;
        try { corpo = JSON.parse(e.corpo); } catch { /* mantém o texto */ }
        return { id: e.id, tipo: e.tipo, corpo, recebidoEm: e.recebido_em };
      });
    res.json({ eventos });
  });

  r.delete('/canais/:id', exigirAdmin, async (req, res) => {
    const row = await canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') {
      telegram?.sondagem?.parar(row.id);
    } else if (uazapi && uazapi.configurado) {
      try { await uazapi.excluir(row.instancia_token); } catch { /* remove do CRM mesmo assim */ }
    }
    await db.prepare('UPDATE conversas SET canal_id = NULL WHERE canal_id = ?').run(row.id);
    await db.prepare('DELETE FROM canais WHERE id = ?').run(row.id);
    res.json({ ok: true });
  });

  return r;
}

module.exports = { criarRotasApi };
