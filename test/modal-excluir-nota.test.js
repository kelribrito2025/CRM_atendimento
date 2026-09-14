'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');

test('exclusão de nota usa modal do CRM em vez de confirm do navegador', () => {
  const js = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  const inicio = js.indexOf('function confirmarNoSite');
  const fim = js.indexOf('/* ---------------------------- anexos', inicio);
  const trecho = js.slice(inicio, fim);

  assert.ok(inicio >= 0, 'o modal de confirmação deve existir');
  assert.match(trecho, /role: 'dialog'/);
  assert.match(trecho, /'aria-modal': 'true'/);
  assert.match(trecho, /titulo: 'Apagar nota\?'/);
  assert.match(trecho, /rotuloConfirmar: 'Apagar nota'/);
  assert.match(trecho, /if \(e\.key === 'Escape'\) encerrar\(false\)/);
  assert.doesNotMatch(trecho, /window\.confirm|\bconfirm\(/);
});

test('modal de exclusão segue os estilos visuais do CRM', () => {
  const css = fs.readFileSync(path.join(raiz, 'client/assets/css/app.css'), 'utf8');

  assert.match(css, /\.modal\.confirmacao\s*\{/);
  assert.match(css, /\.modal-confirmacao-icone\s*\{/);
  assert.match(css, /\.modal-acoes\s*\{/);
  assert.match(css, /\.btn-perigo\s*\{/);
});
