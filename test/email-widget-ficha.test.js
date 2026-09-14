'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');

test('ficha mostra e-mail abaixo do título somente no Chat do site', () => {
  const js = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  const inicio = js.indexOf('function renderPainel()');
  const fim = js.indexOf('/* ================================================================', inicio);
  const renderPainel = js.slice(inicio, fim);

  assert.ok(inicio >= 0, 'renderPainel deve existir');
  assert.match(renderPainel, /c\.canal === 'widget' && \(ct\.email \|\| \(saldo\.conversaId === c\.id/);
  assert.match(renderPainel, /class: 'painel-sub'/);
});

test('migração mantém coluna de e-mail nos contatos existentes', () => {
  const db = fs.readFileSync(path.join(raiz, 'src/db.js'), 'utf8');

  assert.match(db, /email VARCHAR\(191\)/);
  assert.match(db, /garantirColuna\(db, 'contatos', 'email', 'VARCHAR\(191\)'\)/);
});
