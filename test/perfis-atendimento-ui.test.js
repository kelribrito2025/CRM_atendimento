'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const tela = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
const acesso = fs.readFileSync(path.join(raiz, 'client/assets/js/acesso.js'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'client/escolher-atendente.html'), 'utf8');
const atendimento = fs.readFileSync(path.join(raiz, 'client/atendimento.html'), 'utf8');
const vite = fs.readFileSync(path.join(raiz, 'vite.config.mjs'), 'utf8');

test('perfis UI: escolha identifica conta, lista atendentes e exige seleção', () => {
  assert.match(html, /data-pagina="escolher-atendente"/);
  assert.match(html, /Escolha seu atendente/);
  assert.match(html, /id="lista-atendentes"/);
  assert.match(html, /id="conta-email"/);
  assert.match(acesso, /chamar\('\/acesso\/atendentes'\)/);
  assert.match(acesso, /chamar\('\/acesso\/atendente'/);
  assert.match(acesso, /aria-pressed/);
  assert.doesNotMatch(acesso, /dados\.selecionadoId \|\| dados\.atendentes\[0\]\.id/);
  assert.match(html, /id="btn"[^>]*disabled/);
  assert.match(vite, /'escolher-atendente'/);
});

test('perfis UI: atendente pode ser adicionado e trocado sem criar senha', () => {
  assert.match(tela, /function adicionarAtendente\(\)/);
  assert.match(tela, /api\('\/equipe\/usuarios'/);
  assert.match(tela, /Não é necessário criar outra senha/);
  assert.match(tela, /onclick: adicionarAtendente/);
  assert.match(atendimento, /href="\/escolher-atendente">Trocar atendente/);
});

test('perfis UI: conta autenticada continua controlando permissões administrativas', () => {
  assert.match(tela, /\(r\.conta \|\| r\.usuario\)\.papel === 'admin'/);
  assert.match(tela, /\(estado\.resumo\?\.conta \|\| estado\.resumo\?\.usuario\)\?\.papel === 'admin'/);
  assert.match(tela, /r\.conta\?\.email \|\| r\.usuario\.email/);
});
