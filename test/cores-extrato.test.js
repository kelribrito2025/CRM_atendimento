'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const javascript = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'client/assets/css/app.css'), 'utf8');

test('compras: o status Cancelada recebe uma classe vermelha própria', () => {
  assert.match(javascript, /compra\.status === 'cancelled'/);
  assert.match(javascript, /statusTexto[^\n]+toLowerCase\(\) === 'cancelada'/);
  assert.match(javascript, /cancelada \? 'cancelada'/);
  assert.match(css, /\.selo-compra\.cancelada \{[^}]*background: var\(--extrato-vermelho-fundo\);[^}]*color: var\(--extrato-vermelho\);/);
});

test('transações: entrada e saída usam cores proporcionais no ícone e valor', () => {
  assert.match(css, /\.transacao-ic\.entrada \{[^}]*background: var\(--extrato-verde-fundo\);[^}]*color: var\(--extrato-verde\);/);
  assert.match(css, /\.transacao-ic\.saida \{[^}]*background: var\(--extrato-vermelho-fundo\);[^}]*color: var\(--extrato-vermelho\);/);
  assert.match(css, /\.transacao-valores \.valor\.entrada \{ color: var\(--extrato-verde\); \}/);
  assert.match(css, /\.transacao-valores \.valor\.saida \{ color: var\(--extrato-vermelho\); \}/);
});

test('cores do extrato têm versões próprias nos temas claro e escuro', () => {
  assert.equal((css.match(/--extrato-verde:/g) || []).length, 2);
  assert.equal((css.match(/--extrato-vermelho:/g) || []).length, 2);
  assert.match(css, /--extrato-verde: #008A45;/);
  assert.match(css, /--extrato-vermelho: #C62838;/);
  assert.match(css, /--extrato-verde: #39E079;/);
  assert.match(css, /--extrato-vermelho: #FF6B75;/);
});
