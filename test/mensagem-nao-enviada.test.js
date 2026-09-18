'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const tela = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'client/assets/css/app.css'), 'utf8');

test('mensagem falhou: não enviada aparece isolado em badge vermelho', () => {
  assert.match(tela, /m\.entrega === 'falhou'[\s\S]*el\('span', \{ class: 'msg-entrega-falhou' \}, 'não enviada'\)/);
  assert.doesNotMatch(tela, /não enviada ⚠/);
  assert.match(css, /\.msg-entrega-falhou \{[\s\S]*background: var\(--vermelho-claro\); color: var\(--vermelho\); font-weight: 700/);
});

test('mensagem falhou: horário e atendente permanecem fora do badge', () => {
  assert.match(tela, /`\$\{horaCurta\(m\.criadaEm\)\} · \$\{autor\}\$\{m\.editadaEm \? ' · editada' : ''\}`/);
  assert.match(tela, /entrega \? ' · ' : null/);
});
