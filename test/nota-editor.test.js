'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const raiz = path.resolve(__dirname, '..');
const modulo = pathToFileURL(path.join(raiz, 'client/assets/js/nota-editor.mjs')).href;

test('nota lateral salva com Enter e mantém Shift+Enter para nova linha', async () => {
  const { deveSalvarNota } = await import(modulo);

  assert.equal(deveSalvarNota({ key: 'Enter', shiftKey: false, isComposing: false }, 'Cliente VIP'), true);
  assert.equal(deveSalvarNota({ key: 'Enter', shiftKey: true, isComposing: false }, 'Linha 1'), false);
  assert.equal(deveSalvarNota({ key: 'Enter', shiftKey: false, isComposing: true }, 'Compondo'), false);
  assert.equal(deveSalvarNota({ key: 'Enter', shiftKey: false, isComposing: false }, '   '), false);
  assert.equal(deveSalvarNota({ key: 'a', shiftKey: false, isComposing: false }, 'Texto'), false);
});

test('editor lateral começa em uma linha, cresce ao digitar e não mostra botão de salvar', () => {
  const js = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  const inicio = js.indexOf('function renderPainel()');
  const fim = js.indexOf('/* ================================================================', inicio);
  const painel = js.slice(inicio, fim);

  assert.match(painel, /id: 'texto-nota', rows: '1'/);
  assert.match(painel, /oninput: \(\) => \{[^}]*ajustarAltura\(textareaNota\)/);
  assert.match(painel, /deveSalvarNota\(e, textareaNota\.value\)/);
  assert.doesNotMatch(painel, /'Salvar nota'/);
  assert.doesNotMatch(painel, /'Só a equipe vê\.'/);
});
