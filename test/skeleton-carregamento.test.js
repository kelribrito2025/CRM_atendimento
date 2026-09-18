'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

test('skeleton: as quatro colunas do atendimento nascem com placeholders até os dados chegarem', () => {
  const html = ler('client/atendimento.html');
  for (const coluna of ['esq-sidebar', 'esq-conversas', 'esq-chat', 'esq-painel']) {
    assert.match(html, new RegExp(`<div class="esqueleto ${coluna}" aria-hidden="true">`), coluna);
  }
  assert.ok((html.match(/class="esq-conversa"/g) || []).length >= 5, 'lista com vários itens fantasmas');
  assert.ok((html.match(/class="esq balao-esq/g) || []).length >= 5, 'chat com vários balões fantasmas');
  assert.match(html, /<span class="somente-leitor" role="status">Carregando conversas…<\/span>/, 'leitor de tela ainda sabe que está carregando');
  assert.doesNotMatch(html, /<div class="chat-vazio"><strong>Carregando conversas…<\/strong><\/div>/, 'o texto solto saiu do chat');
});

test('skeleton: brilho animado respeita prefers-reduced-motion e some se o carregamento falhar', () => {
  const css = ler('client/assets/css/app.css');
  assert.match(css, /\.esq \{[^}]*animation: esq-brilho/);
  assert.match(css, /@keyframes esq-brilho/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.esq \{ animation: none; \} \}/);
  assert.match(css, /\.somente-leitor \{ position: absolute; width: 1px; height: 1px;/);

  const js = ler('client/assets/js/atendimento.js');
  assert.match(js, /document\.querySelectorAll\('\.esqueleto, \.somente-leitor'\)\.forEach\(\(no\) => no\.remove\(\)\);/);
  // As colunas reais são desenhadas com replaceChildren, o que descarta o skeleton.
  for (const alvo of ["$('#sidebar').replaceChildren(", "cont.replaceChildren(", "chat.replaceChildren(", "painel.replaceChildren("]) {
    assert.ok(js.includes(alvo), alvo);
  }
});
