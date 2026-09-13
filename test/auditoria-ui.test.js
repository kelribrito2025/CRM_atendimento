'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const javascript = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../client/assets/css/app.css'), 'utf8');

test('configurações: auditoria é administrativa, somente leitura e mostra atendente, cliente e data', () => {
  assert.match(javascript, /id: 'auditoria', nome: 'Auditoria', icone: 'olho', soAdmin: true/);
  assert.match(javascript, /api\('\/auditoria'\)/);
  assert.match(javascript, /evento\.usuario\?\.nome/);
  assert.match(javascript, /evento\.contato\?\.nome/);
  assert.match(javascript, /evento\.conversa\?\.protocolo/);
  assert.match(javascript, /toLocaleString\('pt-BR'/);
  assert.match(javascript, /Histórico automático e somente para leitura/);
  assert.match(css, /\.auditoria-lista/);
  assert.match(css, /\.auditoria-item/);
});

test('ficha do cliente não cria nem exibe log de abertura como nota', () => {
  const renderPainel = javascript.slice(javascript.indexOf('function renderPainel'), javascript.indexOf('/* ================================================================\n   * Aparência'));
  assert.doesNotMatch(renderPainel, /Abriu a conta do cliente no site/);
});
