'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulo = pathToFileURL(path.join(__dirname, '../client/assets/js/data-compra.mjs')).href;
const javascript = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../client/assets/css/app.css'), 'utf8');

test('compras: formata data e hora no padrão brasileiro', async () => {
  const { formatarDataHoraCompra } = await import(modulo);
  assert.equal(formatarDataHoraCompra('2026-09-14T11:05:00'), '14/09/2026 às 11:05');
  assert.equal(formatarDataHoraCompra(null), '');
  assert.equal(formatarDataHoraCompra('data inválida'), '');
});

test('compras: card mostra a data recebida da API sem inventar valor ausente', () => {
  assert.match(javascript, /const dataHora = formatarDataHoraCompra\(compra\.data\)/);
  assert.match(javascript, /`Comprada em \$\{dataHora\}`/);
  assert.match(javascript, /dataHora \? el\('span', \{ class: 'data-compra' \}/);
  assert.match(css, /\.compra-item \.data-compra/);
});

test('compras: número comprado e data usam texto maior', () => {
  assert.match(css, /\.compra-item \.numero \{[^}]*font-size: 12px;[^}]*font-weight: 700;[^}]*color: var\(--extrato-verde\);/);
  assert.match(css, /\.compra-item \.data-compra \{ font-size: 12px;/);
});

test('compras: número tem botão de copiar com feedback', () => {
  assert.match(javascript, /class: 'numero-compra'/);
  assert.match(javascript, /class: 'copiar-numero hov'/);
  assert.match(javascript, /navigator\.clipboard\.writeText\(String\(compra\.numero\)\)/);
  assert.match(javascript, /toast\('Número copiado\.'\)/);
  assert.match(css, /\.copiar-numero \{[^}]*width: 24px;/);
});
