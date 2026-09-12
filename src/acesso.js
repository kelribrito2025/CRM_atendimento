'use strict';

// Convites, recuperação de senha e verificação em duas etapas.

const crypto = require('node:crypto');
const { gerarHashSenha } = require('./senha');
const { hashToken, encerrarTodasDoUsuario } = require('./sessoes');

const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const VALIDADE_REDEFINICAO_MS = 30 * 60 * 1000; // 30 minutos
const VALIDADE_CODIGO_MS = 5 * 60 * 1000; // 5 minutos
const INTERVALO_REENVIO_MS = 30 * 1000; // 30 segundos
const MAX_TENTATIVAS_CODIGO = 5;

function novoToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function novoCodigo() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Regras para senhas escolhidas pelo próprio usuário (convite e nova senha).
function validarSenhaNova(senha) {
  const s = String(senha || '');
  const problemas = [];
  if (s.length < 10) problemas.push('Pelo menos 10 caracteres');
  if (!/[A-ZÀ-Ý]/.test(s) || !/\d/.test(s)) problemas.push('Uma letra maiúscula e um número');
  return problemas;
}

// "marina@empresa.com" -> "m•••@empresa.com"
function mascararEmail(email) {
  const [usuario, dominio] = String(email || '').split('@');
  if (!dominio) return email;
  return `${usuario.slice(0, 1)}•••@${dominio}`;
}

/* ---------------------------- Convites ---------------------------- */

function criarConvite(db, { email, papel = 'atendente', equipeIds = [], criadoPor = null, validadeMs = VALIDADE_CONVITE_MS }) {
  const token = novoToken();
  const agora = Date.now();
  const expira = agora + validadeMs;
  db.prepare(`
    INSERT INTO convites (token_hash, email, papel, equipes, criado_por, criado_em, expira_em)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(hashToken(token), String(email).trim().toLowerCase(), papel, JSON.stringify(equipeIds), criadoPor, agora, expira);
  return { token, expira };
}

function buscarConvite(db, token) {
  if (!token) return { erro: 'Este link de convite está incompleto.' };
  const c = db.prepare(`
    SELECT c.*, u.nome AS convidante
    FROM convites c LEFT JOIN usuarios u ON u.id = c.criado_por
    WHERE c.token_hash = ?`).get(hashToken(token));
  if (!c) return { erro: 'Este convite não existe ou o link está incompleto.' };
  if (c.usado_em) return { erro: 'Este convite já foi usado. Entre com seu e-mail e senha.' };
  if (c.expira_em < Date.now()) return { erro: 'Este convite expirou. Peça um novo ao administrador.' };

  let ids = [];
  try { ids = JSON.parse(c.equipes || '[]'); } catch { ids = []; }
  const equipes = ids.length
    ? db.prepare(`SELECT id, nome, cor FROM equipes WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY ordem, nome`).all(...ids)
    : [];

  return {
    convite: {
      email: c.email,
      papel: c.papel,
      convidante: c.convidante,
      equipes,
      criadoEm: c.criado_em,
      expiraEm: c.expira_em,
    },
  };
}

function usarConvite(db, token, { nome, senha }) {
  const r = buscarConvite(db, token);
  if (r.erro) return r;
  const existente = db.prepare('SELECT id, ativo FROM usuarios WHERE email = ?').get(r.convite.email);
  if (existente && existente.ativo) {
    return { erro: 'Já existe uma conta com este e-mail. Entre com sua senha ou recupere o acesso.' };
  }
  const hash = gerarHashSenha(senha);
  let usuarioId;
  db.exec('BEGIN');
  try {
    if (existente) {
      db.prepare('UPDATE usuarios SET nome = ?, senha_hash = ?, papel = ?, ativo = 1 WHERE id = ?')
        .run(nome, hash, r.convite.papel, existente.id);
      usuarioId = existente.id;
    } else {
      usuarioId = Number(db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)')
        .run(nome, r.convite.email, hash, r.convite.papel).lastInsertRowid);
    }
    const insMembro = db.prepare('INSERT OR IGNORE INTO equipe_membros (equipe_id, usuario_id) VALUES (?, ?)');
    for (const e of r.convite.equipes) insMembro.run(e.id, usuarioId);
    db.prepare('UPDATE convites SET usado_em = ? WHERE token_hash = ?').run(Date.now(), hashToken(token));
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
  return { usuarioId };
}

function listarConvitesPendentes(db) {
  return db.prepare(`
    SELECT c.email, c.papel, c.equipes, c.criado_em, c.expira_em, u.nome AS convidante
    FROM convites c LEFT JOIN usuarios u ON u.id = c.criado_por
    WHERE c.usado_em IS NULL AND c.expira_em > ?
    ORDER BY c.criado_em DESC`).all(Date.now());
}

/* ------------------------ Redefinição de senha ------------------------ */

function criarRedefinicao(db, usuarioId) {
  const token = novoToken();
  const agora = Date.now();
  const expira = agora + VALIDADE_REDEFINICAO_MS;
  db.prepare('DELETE FROM redefinicoes WHERE usuario_id = ? AND usado_em IS NULL').run(usuarioId);
  db.prepare('INSERT INTO redefinicoes (token_hash, usuario_id, criado_em, expira_em) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), usuarioId, agora, expira);
  return { token, expira };
}

function buscarRedefinicao(db, token) {
  if (!token) return { erro: 'Este link está incompleto. Abra o link exatamente como veio no e-mail.' };
  const r = db.prepare(`
    SELECT r.*, u.email, u.nome, u.ativo
    FROM redefinicoes r JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.token_hash = ?`).get(hashToken(token));
  if (!r || !r.ativo) return { erro: 'Este link não é válido. Peça um novo link de recuperação.' };
  if (r.usado_em) return { erro: 'Este link já foi usado. Se precisar, peça um novo.' };
  if (r.expira_em < Date.now()) return { erro: 'Este link expirou (ele vale 30 minutos). Peça um novo.' };
  return { redefinicao: { usuarioId: r.usuario_id, email: r.email, nome: r.nome, expiraEm: r.expira_em } };
}

function usarRedefinicao(db, token, novaSenha) {
  const r = buscarRedefinicao(db, token);
  if (r.erro) return r;
  const hash = gerarHashSenha(novaSenha);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, r.redefinicao.usuarioId);
    db.prepare('UPDATE redefinicoes SET usado_em = ? WHERE token_hash = ?').run(Date.now(), hashToken(token));
    encerrarTodasDoUsuario(db, r.redefinicao.usuarioId);
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
  return { usuarioId: r.redefinicao.usuarioId };
}

/* --------------------- Verificação em duas etapas --------------------- */

function criarVerificacao(db, usuarioId, lembrar = false) {
  const token = novoToken();
  const codigo = novoCodigo();
  const agora = Date.now();
  const expira = agora + VALIDADE_CODIGO_MS;
  db.prepare('DELETE FROM verificacoes WHERE usuario_id = ?').run(usuarioId);
  db.prepare(`
    INSERT INTO verificacoes (token_hash, usuario_id, codigo_hash, lembrar, tentativas, reenviado_em, criado_em, expira_em)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)`)
    .run(hashToken(token), usuarioId, hashToken(codigo), lembrar ? 1 : 0, agora, agora, expira);
  return { token, codigo, expira };
}

function buscarVerificacao(db, token) {
  if (!token) return null;
  const v = db.prepare(`
    SELECT v.*, u.email, u.nome
    FROM verificacoes v JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.token_hash = ?`).get(hashToken(token));
  if (!v) return null;
  if (v.expira_em < Date.now()) {
    db.prepare('DELETE FROM verificacoes WHERE token_hash = ?').run(hashToken(token));
    return null;
  }
  return v;
}

function reenviarCodigo(db, token) {
  const v = buscarVerificacao(db, token);
  if (!v) return { erro: 'A verificação expirou. Entre novamente.', reiniciar: true };
  const agora = Date.now();
  const espera = v.reenviado_em + INTERVALO_REENVIO_MS - agora;
  if (espera > 0) return { erro: `Aguarde ${Math.ceil(espera / 1000)}s para reenviar.`, espera };
  const codigo = novoCodigo();
  const expira = agora + VALIDADE_CODIGO_MS;
  db.prepare('UPDATE verificacoes SET codigo_hash = ?, tentativas = 0, reenviado_em = ?, expira_em = ? WHERE token_hash = ?')
    .run(hashToken(codigo), agora, expira, hashToken(token));
  return { codigo, expira, email: v.email, nome: v.nome, reenvioEm: agora + INTERVALO_REENVIO_MS };
}

function confirmarVerificacao(db, token, codigo) {
  const v = buscarVerificacao(db, token);
  if (!v) return { erro: 'A verificação expirou. Entre novamente.', reiniciar: true };
  if (v.tentativas >= MAX_TENTATIVAS_CODIGO) {
    db.prepare('DELETE FROM verificacoes WHERE token_hash = ?').run(hashToken(token));
    return { erro: 'Muitas tentativas. Entre novamente para receber um novo código.', reiniciar: true };
  }
  const digitado = String(codigo || '').replace(/\D/g, '');
  const confere = digitado.length === 6
    && crypto.timingSafeEqual(Buffer.from(hashToken(digitado)), Buffer.from(v.codigo_hash));
  if (!confere) {
    db.prepare('UPDATE verificacoes SET tentativas = tentativas + 1 WHERE token_hash = ?').run(hashToken(token));
    const restantes = MAX_TENTATIVAS_CODIGO - v.tentativas - 1;
    if (restantes <= 0) {
      db.prepare('DELETE FROM verificacoes WHERE token_hash = ?').run(hashToken(token));
      return { erro: 'Muitas tentativas. Entre novamente para receber um novo código.', reiniciar: true };
    }
    return { erro: `Código incorreto. Você ainda tem ${restantes} tentativa${restantes === 1 ? '' : 's'}.` };
  }
  db.prepare('DELETE FROM verificacoes WHERE token_hash = ?').run(hashToken(token));
  return { usuarioId: v.usuario_id, lembrar: Boolean(v.lembrar) };
}

function cancelarVerificacao(db, token) {
  if (token) db.prepare('DELETE FROM verificacoes WHERE token_hash = ?').run(hashToken(token));
}

function limparAcessosExpirados(db) {
  const agora = Date.now();
  db.prepare('DELETE FROM verificacoes WHERE expira_em < ?').run(agora);
  db.prepare('DELETE FROM redefinicoes WHERE expira_em < ? OR usado_em IS NOT NULL').run(agora - 24 * 60 * 60 * 1000);
}

module.exports = {
  VALIDADE_CONVITE_MS,
  VALIDADE_REDEFINICAO_MS,
  VALIDADE_CODIGO_MS,
  INTERVALO_REENVIO_MS,
  validarSenhaNova,
  mascararEmail,
  criarConvite,
  buscarConvite,
  usarConvite,
  listarConvitesPendentes,
  criarRedefinicao,
  buscarRedefinicao,
  usarRedefinicao,
  criarVerificacao,
  buscarVerificacao,
  reenviarCodigo,
  confirmarVerificacao,
  cancelarVerificacao,
  limparAcessosExpirados,
};
