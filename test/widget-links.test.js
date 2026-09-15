'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const raiz = path.join(__dirname, '..');
const modulo = pathToFileURL(path.join(raiz, 'client/assets/js/link-texto.mjs')).href;

async function parser() {
  return import(`${modulo}?t=${Date.now()}-${Math.random()}`);
}

test('widget: transforma URL HTTPS em link e preserva texto e pontuação', async () => {
  const { partesDoTextoComLinks } = await parser();
  const partes = partesDoTextoComLinks('Acesse https://app.numero-virtual.com/history, por favor.');
  assert.deepEqual(partes, [
    { tipo: 'texto', texto: 'Acesse ' },
    { tipo: 'link', texto: 'https://app.numero-virtual.com/history', href: 'https://app.numero-virtual.com/history' },
    { tipo: 'texto', texto: ', por favor.' },
  ]);
});

test('widget: aceita domínio Unicode e mantém parêntese externo fora do link', async () => {
  const { partesDoTextoComLinks } = await parser();
  const partes = partesDoTextoComLinks('(https://app.número-virtual.com/history)');
  assert.equal(partes[0].texto, '(');
  assert.equal(partes[1].tipo, 'link');
  assert.equal(partes[1].texto, 'https://app.número-virtual.com/history');
  assert.match(partes[1].href, /^https:\/\//);
  assert.equal(partes[2].texto, ')');
});

test('widget: não transforma javascript ou HTML em conteúdo executável', async () => {
  const { partesDoTextoComLinks } = await parser();
  assert.deepEqual(partesDoTextoComLinks('<img src=x onerror=alert(1)> javascript:alert(1)'), [
    { tipo: 'texto', texto: '<img src=x onerror=alert(1)> javascript:alert(1)' },
  ]);

  const tela = fs.readFileSync(path.join(raiz, 'client/assets/js/widget-chat.js'), 'utf8');
  assert.match(tela, /document\.createTextNode\(parte\.texto\)/);
  assert.match(tela, /link\.rel = 'noopener noreferrer'/);
  assert.match(tela, /link\.target = '_blank'/);
  assert.doesNotMatch(tela, /balao\.innerHTML\s*=\s*m\.texto/);
});
