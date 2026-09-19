'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const javascript = fs.readFileSync(path.join(raiz, 'client', 'assets', 'js', 'atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'client', 'assets', 'css', 'app.css'), 'utf8');

test('inbox da equipe: cada inbox da barra lateral tem lápis para o administrador editar', () => {
  assert.match(javascript, /if \(\(r\.conta \|\| r\.usuario\)\.papel !== 'admin'\) return item;/);
  assert.match(javascript, /title: `Editar inbox \$\{e\.nome\}`/);
  assert.match(javascript, /onclick: \(\) => editarInbox\(e\)/);
  assert.match(css, /\.nav-linha:hover \.btn-editar-nome/);
  assert.match(css, /@media \(hover: none\) \{ \.nav-linha \.btn-editar-nome \{ opacity: 1; \} \}/);
});

test('inbox da equipe: edição usa modal do CRM com nome e cor, salva pela API e atualiza a tela', () => {
  const trecho = javascript.slice(javascript.indexOf('function editarInbox(e)'), javascript.indexOf('* Render: lista de conversas'));
  assert.match(trecho, /class: 'modal criar-inbox editar-inbox'/);
  assert.match(trecho, /'aria-modal': 'true'/);
  assert.match(trecho, /type: 'text', maxlength: '60', autocomplete: 'off', value: e\.nome/);
  assert.match(trecho, /type: 'color', value: e\.cor \|\| '#12B85C'/);
  assert.match(trecho, /api\(`\/equipe\/inboxes\/\$\{e\.id\}`, \{ method: 'PATCH', body: \{ nome: nomeLimpo, cor: cor\.value \} \}\)/);
  assert.match(trecho, /await Promise\.all\(\[carregarResumo\(\), carregarConversas\(\)\]\);/);
  assert.match(trecho, /ev\.key === 'Enter'/);
  assert.match(trecho, /ev\.key === 'Escape'/);
  assert.doesNotMatch(trecho, /window\.(prompt|confirm)/);
});
