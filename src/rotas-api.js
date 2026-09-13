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
         ct.id AS contato_id, ct.nome AS contato_nome, ct.empresa, ct.cnpj, ct.telefone, ct.tg_usuario, ct.tg_id,
         u.nome AS atendente_nome,
         e.nome AS equipe_nome, e.cor AS equipe_cor,
         um.tipo AS ultima_tipo, um.texto AS ultima_texto, um.criada_em AS ultima_em,
         ua.nome AS ultima_autor
  FROM conversas c
  JOIN contatos ct ON ct.id = c.contato_id
  LEFT JOIN usuarios u ON u.id = c.atendente_id
  LEFT JOIN equipes e ON e.id = c.equipe_id
  LEFT JOIN mensagens um ON um.id = (
    SELECT m.id FROM mensagens m
    WHERE m.conversa_id = c.id AND m.tipo != 'nota'
    ORDER BY m.criada_em DESC, m.id DESC LIMIT 1)
  LEFT JOIN usuarios ua ON ua.id = um.autor_id
`;

function criarRotasApi(db, opcoes = {}) {
  const telegram = opcoes.telegram || null;
  const saldo = opcoes.saldo || null;
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
      entrega: m.entrega,
      criadaEm: m.criada_em,
      autor: m.autor_id ? { id: m.autor_id, nome: m.autor_nome, nomeCurto: nomeCurto(m.autor_nome) } : null,
    };
  }

  function todasConversas() {
    const agora = Date.now();
    return sql.conversas.all().map((row) => formatarConversa(row, agora));
  }

  function buscarConversa(id) {
    const row = sql.conversaPorId.get(id);
    return row ? formatarConversa(row) : null;
  }

  function detalharConversa(c) {
    const ct = sql.contato.get(c.contato.id);
    const mensagens = sql.mensagens.all(c.id).map(formatarMensagem);
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
  function comConversa(req, res, next) {
    const id = idDaRota(req);
    const conversa = id ? buscarConversa(id) : null;
    if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });
    req.conversa = conversa;
    next();
  }

  /* -------------------- rotas -------------------- */

  r.get('/me', (req, res) => res.json({ usuario: formatarUsuario(req.usuario) }));

  r.get('/resumo', (req, res) => {
    const todas = todasConversas();
    const abertas = todas.filter((c) => c.status === 'aberta');

    const ativasPor = {};
    for (const c of abertas) if (c.atendente) ativasPor[c.atendente.id] = (ativasPor[c.atendente.id] || 0) + 1;

    const atendentes = sql.usuariosAtivos.all().map((u) => ({ ...formatarUsuario(u), ativas: ativasPor[u.id] || 0 }));
    const membros = sql.membros.all();
    const equipes = sql.equipes.all().map((e) => ({
      ...e,
      abertas: abertas.filter((c) => c.equipe?.id === e.id).length,
      semResposta: abertas.filter((c) => c.equipe?.id === e.id && c.semResposta).length,
      membros: membros
        .filter((m) => m.equipe_id === e.id)
        .map((m) => atendentes.find((a) => a.id === m.usuario_id))
        .filter(Boolean),
    }));

    const tempos = sql.temposResposta.all()
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
      canais: resumoCanais(req),
      saldoAtivo: Boolean(saldo && saldo.configurado),
    });
  });

  r.get('/conversas', (req, res) => {
    const caixa = CAIXAS.has(req.query.caixa) ? req.query.caixa : 'todas';
    const equipeId = req.query.equipe ? Number(req.query.equipe) : null;
    const busca = String(req.query.q || '').trim().toLowerCase();
    const limiteResolvidas = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let lista = todasConversas().filter((c) => c.status === 'aberta' || c.atualizadaEm >= limiteResolvidas);
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

  r.get('/conversas/:id', comConversa, (req, res) => {
    sql.marcarLida.run(req.conversa.id);
    req.conversa.naoLidas = 0;
    res.json({ conversa: detalharConversa(req.conversa) });
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
    const info = sql.inserirMensagem.run(c.id, tipo, req.usuario.id, texto, tipo === 'atendente' ? 'enviada' : null, agora);

    const campos = ['atualizada_em = ?'];
    const valores = [agora];
    if (tipo === 'atendente') {
      if (!c.atendente) { campos.push('atendente_id = ?'); valores.push(req.usuario.id); }
      if (c.status === 'resolvida') { campos.push("status = 'aberta'"); }
    }
    valores.push(c.id);
    db.prepare(`UPDATE conversas SET ${campos.join(', ')} WHERE id = ?`).run(...valores);

    // Conversa vinda de um canal (WhatsApp ou Telegram): envia a resposta por ele
    let erroEnvio = null;
    if (tipo === 'atendente' && c.canalId) {
      const mensagemId = Number(info.lastInsertRowid);
      const canalRow = db.prepare('SELECT * FROM canais WHERE id = ?').get(c.canalId);
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
        db.prepare("UPDATE mensagens SET entrega = 'enviada', externo_id = COALESCE(?, externo_id) WHERE id = ?")
          .run(idExterno ? String(idExterno) : null, mensagemId);
      } catch (erro) {
        erroEnvio = erro.message;
      }
      if (erroEnvio) db.prepare("UPDATE mensagens SET entrega = 'falhou' WHERE id = ?").run(mensagemId);
    }

    const mensagem = formatarMensagem(sql.mensagemPorId.get(Number(info.lastInsertRowid)));
    res.status(201).json({ mensagem, conversa: buscarConversa(c.id), erroEnvio });
  });

  r.patch('/conversas/:id', comConversa, (req, res) => {
    const corpo = req.body || {};
    const campos = [];
    const valores = [];

    if ('equipeId' in corpo) {
      const v = corpo.equipeId === null || corpo.equipeId === '' ? null : Number(corpo.equipeId);
      if (v !== null && (!Number.isInteger(v) || !sql.equipeExiste.get(v))) {
        return res.status(400).json({ erro: 'Equipe não encontrada.' });
      }
      campos.push('equipe_id = ?');
      valores.push(v);
    }
    if ('atendenteId' in corpo) {
      const v = corpo.atendenteId === null || corpo.atendenteId === '' ? null : Number(corpo.atendenteId);
      if (v !== null && (!Number.isInteger(v) || !sql.usuarioExiste.get(v))) {
        return res.status(400).json({ erro: 'Atendente não encontrado.' });
      }
      campos.push('atendente_id = ?');
      valores.push(v);
    }
    if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

    campos.push('atualizada_em = ?');
    valores.push(Date.now(), req.conversa.id);
    db.prepare(`UPDATE conversas SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
    res.json({ conversa: buscarConversa(req.conversa.id) });
  });

  r.post('/conversas/:id/status', comConversa, (req, res) => {
    const status = req.body?.status;
    if (!STATUS.has(status)) return res.status(400).json({ erro: 'Status inválido.' });
    db.prepare('UPDATE conversas SET status = ?, atualizada_em = ? WHERE id = ?').run(status, Date.now(), req.conversa.id);
    res.json({ conversa: buscarConversa(req.conversa.id) });
  });

  r.post('/conversas/:id/pin', comConversa, (req, res) => {
    const acao = req.body?.acao;
    const contatoId = req.conversa.contato.id;
    if (acao === 'validar') {
      const ct = sql.contato.get(contatoId);
      if (!ct.pin) return res.status(400).json({ erro: 'Este cliente ainda não tem PIN gerado.' });
      db.prepare('UPDATE contatos SET pin_validado_em = ?, pin_validado_por = ? WHERE id = ?')
        .run(Date.now(), req.usuario.id, contatoId);
    } else if (acao === 'novo') {
      const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      db.prepare('UPDATE contatos SET pin = ?, pin_validado_em = NULL, pin_validado_por = NULL WHERE id = ?')
        .run(pin, contatoId);
    } else {
      return res.status(400).json({ erro: 'Ação inválida.' });
    }
    res.json({ conversa: detalharConversa(buscarConversa(req.conversa.id)) });
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
      const linha = Number.isInteger(id) && id > 0 ? buscarConversa(id) : null;
      if (linha) {
        db.prepare('UPDATE contatos SET pin = ?, pin_validado_em = ?, pin_validado_por = ? WHERE id = ?')
          .run(String(pin), Date.now(), req.usuario.id, linha.contato.id);
        conversa = detalharConversa(buscarConversa(id));
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
  function exigirUazapiParaWhatsapp(req, res, next) {
    const id = idDaRota(req);
    const row = id ? sqlCanal.get(id) : null;
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

  function resumoCanais(req) {
    const lista = db.prepare('SELECT * FROM canais ORDER BY id').all().map((c) => formatarCanal(req, c));
    const whats = lista.filter((c) => c.tipo !== 'telegram');
    const tg = lista.filter((c) => c.tipo === 'telegram');
    return [
      { id: 'whatsapp', nome: 'WhatsApp', conectado: whats.some((c) => c.status === 'connected'), configurado: Boolean(uazapi && uazapi.configurado), canais: whats },
      { id: 'telegram', nome: 'Telegram', conectado: tg.some((c) => c.status === 'connected'), configurado: Boolean(telegram), canais: tg },
    ];
  }

  const sqlCanal = db.prepare('SELECT * FROM canais WHERE id = ?');

  function canalDaRota(req, res) {
    const id = idDaRota(req);
    const row = id ? sqlCanal.get(id) : null;
    if (!row) res.status(404).json({ erro: 'Canal não encontrado.' });
    return row;
  }

  function aplicarStatus(row, st) {
    db.prepare(`UPDATE canais SET status = ?, numero = COALESCE(?, numero), perfil_nome = COALESCE(?, perfil_nome),
      instancia_id = COALESCE(?, instancia_id), ultimo_erro = NULL, atualizado_em = ? WHERE id = ?`)
      .run(st.status, st.numero, st.perfil, st.instanciaId, Date.now(), row.id);
  }

  function registrarErro(row, erro) {
    db.prepare('UPDATE canais SET ultimo_erro = ?, atualizado_em = ? WHERE id = ?')
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

  r.get('/canais', exigirAdmin, (req, res) => {
    const lista = db.prepare('SELECT * FROM canais ORDER BY id').all().map((c) => formatarCanal(req, c));
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
    const id = Number(db.prepare(`
      INSERT INTO canais (tipo, nome, instancia_id, instancia_token, webhook_segredo, status, criado_em, atualizado_em)
      VALUES ('whatsapp', ?, ?, ?, ?, 'disconnected', ?, ?)`)
      .run(nome, inst.id || null, String(token), canais.novoSegredo(), agora, agora).lastInsertRowid);
    const row = sqlCanal.get(id);
    try {
      await configurarWebhookDoCanal(req, row);
    } catch (erro) {
      registrarErro(row, new Error(`Webhook não configurado: ${erro.message}`));
    }
    res.status(201).json({ canal: formatarCanal(req, sqlCanal.get(id)) });
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
    const existente = db.prepare("SELECT id FROM canais WHERE tipo = 'telegram' AND (instancia_id = ? OR instancia_token = ?)").get(bot.id, token);
    if (existente) return res.status(409).json({ erro: `Este bot (@${bot.usuario || bot.id}) já está conectado.` });

    const agora = Date.now();
    const nome = String(req.body?.nome || '').trim().slice(0, 60) || bot.nome || 'Telegram';
    const id = Number(db.prepare(`
      INSERT INTO canais (tipo, nome, instancia_id, instancia_token, webhook_segredo, numero, perfil_nome, status, criado_em, atualizado_em)
      VALUES ('telegram', ?, ?, ?, ?, ?, ?, 'connected', ?, ?)`)
      .run(nome, bot.id, token, canais.novoSegredo(), bot.usuario, bot.nome, agora, agora).lastInsertRowid);
    try { await telegram.removerWebhook(token); } catch { /* segue com a consulta contínua */ }
    canais.ligarTelegram(db, telegram, sqlCanal.get(id));
    res.status(201).json({ canal: formatarCanal(req, sqlCanal.get(id)) });
  });

  r.post('/canais/:id/conectar', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') {
      if (!telegram) return res.status(400).json({ erro: 'Integração com Telegram indisponível.' });
      try {
        const bot = await telegram.validarToken(row.instancia_token);
        db.prepare("UPDATE canais SET status = 'connected', numero = ?, perfil_nome = ?, ultimo_erro = NULL, atualizado_em = ? WHERE id = ?")
          .run(bot.usuario, bot.nome, Date.now(), row.id);
        try { await telegram.removerWebhook(row.instancia_token); } catch { /* segue */ }
        canais.ligarTelegram(db, telegram, sqlCanal.get(row.id));
        return res.json({ status: 'connected', canal: formatarCanal(req, sqlCanal.get(row.id)) });
      } catch (erro) {
        registrarErro(row, erro);
        db.prepare("UPDATE canais SET status = 'disconnected' WHERE id = ?").run(row.id);
        return res.status(502).json({ erro: erro.message });
      }
    }
    const telefone = canais.somenteDigitos(req.body?.telefone);
    if (req.body?.telefone && (telefone.length < 10 || telefone.length > 15)) {
      return res.status(400).json({ erro: 'Digite o número com o código do país e o DDD. Exemplo: 55 31 99999-0000.' });
    }
    try {
      const st = interpretarStatus(await uazapi.conectar(row.instancia_token, telefone || undefined));
      aplicarStatus(row, st);
      res.json({ status: st.status, qrcode: st.qrcode, paircode: st.paircode, canal: formatarCanal(req, sqlCanal.get(row.id)) });
    } catch (erro) {
      registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.get('/canais/:id/status', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') return res.json({ status: row.status, canal: formatarCanal(req, row) });
    try {
      const st = interpretarStatus(await uazapi.status(row.instancia_token));
      aplicarStatus(row, st);
      res.json({ status: st.status, qrcode: st.qrcode, paircode: st.paircode, canal: formatarCanal(req, sqlCanal.get(row.id)) });
    } catch (erro) {
      registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.post('/canais/:id/desconectar', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') {
      telegram?.sondagem?.parar(row.id);
      db.prepare("UPDATE canais SET status = 'disconnected', ultimo_erro = NULL, atualizado_em = ? WHERE id = ?").run(Date.now(), row.id);
      return res.json({ canal: formatarCanal(req, sqlCanal.get(row.id)) });
    }
    try {
      await uazapi.desconectar(row.instancia_token);
      db.prepare("UPDATE canais SET status = 'disconnected', ultimo_erro = NULL, atualizado_em = ? WHERE id = ?").run(Date.now(), row.id);
      res.json({ canal: formatarCanal(req, sqlCanal.get(row.id)) });
    } catch (erro) {
      registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.post('/canais/:id/webhook', exigirAdmin, exigirUazapiParaWhatsapp, async (req, res) => {
    const row = canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') return res.status(400).json({ erro: 'O Telegram não usa webhook neste CRM: as mensagens são buscadas automaticamente.' });
    try {
      const url = await configurarWebhookDoCanal(req, row);
      db.prepare('UPDATE canais SET ultimo_erro = NULL, atualizado_em = ? WHERE id = ?').run(Date.now(), row.id);
      res.json({ url, canal: formatarCanal(req, sqlCanal.get(row.id)) });
    } catch (erro) {
      registrarErro(row, erro);
      res.status(502).json({ erro: erro.message });
    }
  });

  r.get('/canais/:id/eventos', exigirAdmin, (req, res) => {
    const row = canalDaRota(req, res);
    if (!row) return;
    const eventos = db.prepare('SELECT id, tipo, corpo, recebido_em FROM canal_eventos WHERE canal_id = ? ORDER BY id DESC LIMIT 50')
      .all(row.id)
      .map((e) => {
        let corpo = e.corpo;
        try { corpo = JSON.parse(e.corpo); } catch { /* mantém o texto */ }
        return { id: e.id, tipo: e.tipo, corpo, recebidoEm: e.recebido_em };
      });
    res.json({ eventos });
  });

  r.delete('/canais/:id', exigirAdmin, async (req, res) => {
    const row = canalDaRota(req, res);
    if (!row) return;
    if (row.tipo === 'telegram') {
      telegram?.sondagem?.parar(row.id);
    } else if (uazapi && uazapi.configurado) {
      try { await uazapi.excluir(row.instancia_token); } catch { /* remove do CRM mesmo assim */ }
    }
    db.prepare('UPDATE conversas SET canal_id = NULL WHERE canal_id = ?').run(row.id);
    db.prepare('DELETE FROM canais WHERE id = ?').run(row.id);
    res.json({ ok: true });
  });

  return r;
}

module.exports = { criarRotasApi };
