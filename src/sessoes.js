'use strict';

const crypto = require('node:crypto');

const NOME_COOKIE = 'crm_sessao';
const DURACAO_MS = 12 * 60 * 60 * 1000; // 12 horas
const DURACAO_LEMBRAR_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function criarSessao(db, usuarioId, lembrar = false) {
  const token = crypto.randomBytes(32).toString('base64url');
  const agora = Date.now();
  const expira = agora + (lembrar ? DURACAO_LEMBRAR_MS : DURACAO_MS);
  const perfis = Number((await db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE ativo = 1 AND pode_logar = 0').get()).n);
  const atendenteId = perfis === 0 ? usuarioId : null;
  await db.prepare('INSERT INTO sessoes (token_hash, usuario_id, atendente_id, expira_em, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), usuarioId, atendenteId, expira, agora);
  return { token, expira, precisaEscolher: atendenteId == null };
}

async function buscarContextoDaSessao(db, token) {
  if (!token) return null;
  const linha = await db.prepare(`
    SELECT s.usuario_id AS conta_id, s.atendente_id, s.expira_em,
           conta.nome AS conta_nome, conta.email AS conta_email,
           conta.papel AS conta_papel, conta.presenca AS conta_presenca,
           conta.ativo AS conta_ativa, conta.pode_logar AS conta_pode_logar,
           atendente.nome AS atendente_nome, atendente.email AS atendente_email,
           atendente.presenca AS atendente_presenca, atendente.ativo AS atendente_ativo,
           atendente.pode_logar AS atendente_pode_logar
    FROM sessoes s
    JOIN usuarios conta ON conta.id = s.usuario_id
    LEFT JOIN usuarios atendente ON atendente.id = s.atendente_id
    WHERE s.token_hash = ?
  `).get(hashToken(token));
  if (!linha) return null;
  if (linha.expira_em < Date.now() || !linha.conta_ativa || !linha.conta_pode_logar) {
    await encerrarSessao(db, token);
    return null;
  }
  const conta = {
    id: Number(linha.conta_id), nome: linha.conta_nome, email: linha.conta_email,
    papel: linha.conta_papel, presenca: linha.conta_presenca, ativo: linha.conta_ativa,
    pode_logar: linha.conta_pode_logar,
  };
  const atendente = linha.atendente_id && linha.atendente_ativo
    ? {
      id: Number(linha.atendente_id), nome: linha.atendente_nome,
      email: linha.atendente_pode_logar ? linha.atendente_email : null, papel: conta.papel,
      presenca: linha.atendente_presenca, ativo: linha.atendente_ativo,
      pode_logar: linha.atendente_pode_logar,
    }
    : null;
  return { conta, atendente };
}

async function buscarUsuarioDaSessao(db, token) {
  return (await buscarContextoDaSessao(db, token))?.atendente || null;
}

async function escolherAtendente(db, token, atendenteId) {
  if (!token) return false;
  const sessao = await db.prepare('SELECT usuario_id FROM sessoes WHERE token_hash = ? AND expira_em >= ?')
    .get(hashToken(token), Date.now());
  if (!sessao) return false;
  const atendente = await db.prepare('SELECT id FROM usuarios WHERE id = ? AND ativo = 1 AND (pode_logar = 0 OR id = ?)')
    .get(atendenteId, sessao.usuario_id);
  if (!atendente) return false;
  const info = await db.prepare('UPDATE sessoes SET atendente_id = ? WHERE token_hash = ? AND expira_em >= ?')
    .run(atendente.id, hashToken(token), Date.now());
  return Number(info.changes) > 0;
}

async function encerrarSessao(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}

async function encerrarTodasDoUsuario(db, usuarioId) {
  await db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
}

async function limparSessoesExpiradas(db) {
  await db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
}

function lerCookies(req) {
  const cabecalho = req.headers.cookie;
  const cookies = {};
  if (!cabecalho) return cookies;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const chave = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    try {
      cookies[chave] = decodeURIComponent(valor);
    } catch {
      cookies[chave] = valor;
    }
  }
  return cookies;
}

module.exports = {
  NOME_COOKIE,
  hashToken,
  criarSessao,
  buscarContextoDaSessao,
  buscarUsuarioDaSessao,
  escolherAtendente,
  encerrarSessao,
  encerrarTodasDoUsuario,
  limparSessoesExpiradas,
  lerCookies,
};
