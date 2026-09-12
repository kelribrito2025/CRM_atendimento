'use strict';

const crypto = require('node:crypto');

const NOME_COOKIE = 'crm_sessao';
const DURACAO_MS = 12 * 60 * 60 * 1000; // 12 horas
const DURACAO_LEMBRAR_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function criarSessao(db, usuarioId, lembrar = false) {
  const token = crypto.randomBytes(32).toString('base64url');
  const agora = Date.now();
  const expira = agora + (lembrar ? DURACAO_LEMBRAR_MS : DURACAO_MS);
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em, criado_em) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), usuarioId, expira, agora);
  return { token, expira };
}

function buscarUsuarioDaSessao(db, token) {
  if (!token) return null;
  const linha = db.prepare(`
    SELECT u.id, u.nome, u.email, u.papel, u.presenca, u.ativo, s.expira_em
    FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ?
  `).get(hashToken(token));
  if (!linha) return null;
  if (linha.expira_em < Date.now() || !linha.ativo) {
    encerrarSessao(db, token);
    return null;
  }
  return linha;
}

function encerrarSessao(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}

function encerrarTodasDoUsuario(db, usuarioId) {
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
}

function limparSessoesExpiradas(db) {
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
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
  criarSessao,
  buscarUsuarioDaSessao,
  encerrarSessao,
  encerrarTodasDoUsuario,
  limparSessoesExpiradas,
  lerCookies,
};
