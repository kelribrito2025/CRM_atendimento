'use strict';

const { registrarTempo } = require('./metricas-jornada');

// Uma aba visível do CRM renova o sinal a cada 20 segundos. Se o navegador
// fechar ou perder a conexão, o atendente deixa de ser considerado online após
// este prazo, mesmo que a sessão de login continue válida por horas ou dias.
const VALIDADE_PRESENCA_MS = 60 * 1000;
const INTERVALO_HEARTBEAT_MS = 20 * 1000;
const ABA_ID_VALIDO = /^[A-Za-z0-9_-]{10,100}$/;

function validarAbaId(valor) {
  const id = String(valor || '').trim();
  return ABA_ID_VALIDO.test(id) ? id : null;
}

function consultaAtivos(agora) {
  return { corte: agora - VALIDADE_PRESENCA_MS, agora };
}

async function estaOnline(db, atendenteId, agora = Date.now()) {
  const { corte } = consultaAtivos(agora);
  const linha = await db.prepare(`SELECT 1 AS online
    FROM presencas_atendimento p
    JOIN sessoes s ON s.token_hash = p.token_hash
    WHERE p.atendente_id = ? AND p.ultima_atividade_em >= ? AND s.expira_em >= ?
    LIMIT 1`).get(atendenteId, corte, agora);
  return Boolean(linha);
}

async function atendentesOnline(db, agora = Date.now()) {
  const { corte } = consultaAtivos(agora);
  const linhas = await db.prepare(`SELECT DISTINCT p.atendente_id
    FROM presencas_atendimento p
    JOIN sessoes s ON s.token_hash = p.token_hash
    WHERE p.ultima_atividade_em >= ? AND s.expira_em >= ?`).all(corte, agora);
  return new Set(linhas.map((linha) => Number(linha.atendente_id)));
}

async function sinalizar(db, { token, abaId, atendenteId, agora = Date.now() }) {
  const id = validarAbaId(abaId);
  if (!token || !id || !Number.isInteger(Number(atendenteId))) return { ok: false, mudou: false };

  const tokenHash = require('./sessoes').hashToken(token);
  const sessao = await db.prepare('SELECT atendente_id, expira_em FROM sessoes WHERE token_hash = ?').get(tokenHash);
  if (!sessao || Number(sessao.expira_em) < agora || Number(sessao.atendente_id) !== Number(atendenteId)) {
    return { ok: false, mudou: false };
  }

  await db.prepare('DELETE FROM presencas_atendimento WHERE ultima_atividade_em < ?')
    .run(agora - VALIDADE_PRESENCA_MS);
  const jaOnline = await estaOnline(db, atendenteId, agora);
  const existente = await db.prepare('SELECT 1 AS existe FROM presencas_atendimento WHERE token_hash = ? AND aba_id = ?')
    .get(tokenHash, id);
  if (existente) {
    await db.prepare('UPDATE presencas_atendimento SET atendente_id = ?, ultima_atividade_em = ? WHERE token_hash = ? AND aba_id = ?')
      .run(atendenteId, agora, tokenHash, id);
  } else {
    await db.prepare('INSERT INTO presencas_atendimento (token_hash, aba_id, atendente_id, ultima_atividade_em) VALUES (?, ?, ?, ?)')
      .run(tokenHash, id, atendenteId, agora);
  }
  const usuario = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(atendenteId);
  if (usuario) await registrarTempo(db, usuario, agora, jaOnline);
  return { ok: true, mudou: !jaOnline };
}

async function encerrar(db, { token, abaId, atendenteId, agora = Date.now() }) {
  const id = validarAbaId(abaId);
  if (!token || !id || !Number.isInteger(Number(atendenteId))) return { ok: false, mudou: false };
  const tokenHash = require('./sessoes').hashToken(token);
  const info = await db.prepare('DELETE FROM presencas_atendimento WHERE token_hash = ? AND aba_id = ? AND atendente_id = ?')
    .run(tokenHash, id, atendenteId);
  if (!Number(info.changes)) return { ok: true, mudou: false };
  const usuario = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(atendenteId);
  if (usuario) await registrarTempo(db, usuario, agora, true);
  return { ok: true, mudou: !await estaOnline(db, atendenteId, agora) };
}

module.exports = {
  VALIDADE_PRESENCA_MS,
  INTERVALO_HEARTBEAT_MS,
  validarAbaId,
  estaOnline,
  atendentesOnline,
  sinalizar,
  encerrar,
};
