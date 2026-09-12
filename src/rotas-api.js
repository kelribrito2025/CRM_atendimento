'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { iniciais, nomeCurto } = require('./util');

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
         c.equipe_id, c.atendente_id,
         ct.id AS contato_id, ct.nome AS contato_nome, ct.empresa, ct.cnpj, ct.telefone,
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

function criarRotasApi(db) {
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
      canais: [
        { id: 'whatsapp', nome: 'WhatsApp', status: 'demo' },
        { id: 'telegram', nome: 'Telegram', status: 'demo' },
      ],
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

  r.post('/conversas/:id/mensagens', comConversa, (req, res) => {
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

    const mensagem = formatarMensagem(sql.mensagemPorId.get(Number(info.lastInsertRowid)));
    res.status(201).json({ mensagem, conversa: buscarConversa(c.id) });
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

  return r;
}

module.exports = { criarRotasApi };
