'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');

test('PIN preenchido: o card inteiro copia e o número não é um campo editável', () => {
  const js = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  const css = fs.readFileSync(path.join(raiz, 'client/assets/css/app.css'), 'utf8');
  const inicio = js.indexOf('// Já tem PIN:');
  const fim = js.indexOf("const { caixas, pinAtual }", inicio);
  const bloco = js.slice(inicio, fim);

  assert.ok(inicio >= 0 && fim > inicio, 'bloco do PIN preenchido deve existir');
  assert.match(bloco, /el\('span', \{ class: 'pin-valor' \}, valorInicial\)/);
  assert.doesNotMatch(bloco, /el\('input'/);
  assert.match(bloco, /role: 'button', tabindex: '0'/);
  assert.match(bloco, /onclick: copiar/);
  assert.match(css, /\.pin-pronto\.copiavel \{ cursor: pointer; user-select: none; \}/);
});
