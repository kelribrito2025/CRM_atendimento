'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function modulo() {
  return import(`${pathToFileURL(path.join(__dirname, '../client/assets/js/cache-saldo.mjs')).href}?t=${Date.now()}`);
}

test('cache de saldo: reutiliza o cliente por cinco minutos na mesma conversa e PIN', async () => {
  const { criarEntradaCacheSaldo, cacheSaldoValido, DURACAO_CACHE_SALDO } = await modulo();
  const em = 1_000_000;
  const entrada = criarEntradaCacheSaldo({ conversaId: 42, pin: '01234', cliente: { saldo: 'R$ 10,00' }, em });

  assert.equal(cacheSaldoValido(entrada, { conversaId: 42, pin: '01234', agora: em + DURACAO_CACHE_SALDO - 1 }), true);
  assert.equal(cacheSaldoValido(entrada, { conversaId: 42, pin: '01234', agora: em + DURACAO_CACHE_SALDO }), false);
  assert.equal(cacheSaldoValido(entrada, { conversaId: 43, pin: '01234', agora: em + 1 }), false);
  assert.equal(cacheSaldoValido(entrada, { conversaId: 42, pin: '99999', agora: em + 1 }), false);
});

test('cache de saldo: erro tem pausa curta e não impede nova tentativa depois', async () => {
  const { criarEntradaCacheSaldo, cacheSaldoValido, DURACAO_CACHE_ERRO_SALDO } = await modulo();
  const em = 2_000_000;
  const entrada = criarEntradaCacheSaldo({ conversaId: 7, pin: '12345', erro: 'Indisponível', em });

  assert.equal(cacheSaldoValido(entrada, { conversaId: 7, pin: '12345', agora: em + DURACAO_CACHE_ERRO_SALDO - 1 }), true);
  assert.equal(cacheSaldoValido(entrada, { conversaId: 7, pin: '12345', agora: em + DURACAO_CACHE_ERRO_SALDO }), false);
});
