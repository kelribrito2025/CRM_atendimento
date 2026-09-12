'use strict';

const crypto = require('node:crypto');

// Parâmetros do scrypt (algoritmo de hash de senha embutido no Node).
const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 64;

function gerarHashSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, TAMANHO, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verificarSenha(senha, armazenado) {
  try {
    const [alg, n, r, p, saltB64, hashB64] = String(armazenado || '').split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const esperado = Buffer.from(hashB64, 'base64');
    const calculado = crypto.scryptSync(String(senha), salt, esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

// Hash "falso" usado para gastar o mesmo tempo quando o e-mail não existe
// (evita descobrir e-mails cadastrados medindo o tempo de resposta).
const HASH_FALSO = gerarHashSenha('senha-inexistente-apenas-para-tempo');

module.exports = { gerarHashSenha, verificarSenha, HASH_FALSO };
