'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const javascript = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../client/assets/css/app.css'), 'utf8');

test('equipe: cada atendente tem ação para editar o nome', () => {
  assert.match(javascript, /Editar nome de \$\{u\.nome\}/);
  assert.match(javascript, /onclick: \(\) => editarNomeDe\(u\)/);
  assert.match(javascript, /function editarNomeDe\(u\)/);
  assert.match(javascript, /body: \{ nome \}/);
  assert.match(css, /\.btn-editar-nome/);
});

test('edição de nome usa modal do CRM e aceita salvar com Enter', () => {
  const trecho = javascript.slice(javascript.indexOf('function editarNomeDe'), javascript.indexOf('/* ---------------- Configurações › Auditoria'));
  assert.match(trecho, /class: 'modal editar-nome'/);
  assert.match(trecho, /aria-modal/);
  assert.match(trecho, /ev\.key === 'Enter'/);
  assert.match(trecho, /ev\.key === 'Escape'/);
  assert.match(trecho, /maxlength: '120'/);
  assert.doesNotMatch(trecho, /window\.(prompt|confirm)/);
});
