'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const javascript = fs.readFileSync(path.join(raiz, 'client', 'assets', 'js', 'atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'client', 'assets', 'css', 'app.css'), 'utf8');

test('lista: prévia termina com três pontos antes do texto Sem resposta', () => {
  assert.match(javascript, /c\.semResposta && tag[\s\S]*class: 'conversa-previa-linha'[\s\S]*class: 'conversa-previa'[\s\S]*class: 'conversa-reticencias'[\s\S]*'\.\.\.'[\s\S]*class: 'sem-resposta-texto'/);
  assert.doesNotMatch(javascript, /class: 'tag vermelho tag-sem-resposta'/);
  assert.match(css, /\.conversa-previa-linha\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/);
  assert.match(css, /\.conversa-previa-linha \.conversa-previa\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*0;[^}]*text-overflow:\s*clip;/);
  assert.match(css, /\.conversa-reticencias\s*\{[^}]*flex-shrink:\s*0;/);
  assert.doesNotMatch(css, /\.sem-resposta-texto\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.sem-resposta-texto\s*\{[^}]*color:\s*var\(--vermelho\);[^}]*background:\s*none;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/);
  assert.doesNotMatch(css, /\.conversa-previa[^\n]*padding-right/);
});

test('lista: card pulsa somente depois de cinco minutos sem resposta', () => {
  assert.match(javascript, /const semRespostaAtrasada = c\.semResposta && Number\(c\.semRespostaMin\) > 5;/);
  assert.match(javascript, /semRespostaAtrasada \? ' sem-resposta-atrasada' : ''/);
  assert.match(css, /\.conversa\.sem-resposta-atrasada\s*\{[^}]*animation:\s*conversa-sem-resposta-pulso 1\.8s ease-in-out infinite;/);
  assert.match(css, /@keyframes conversa-sem-resposta-pulso\s*\{[\s\S]*box-shadow:\s*inset/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.conversa\.sem-resposta-atrasada\s*\{[^}]*animation:\s*none;/);
});

test('menu: badge lateral mostra somente a quantidade sem resposta e some no zero', () => {
  assert.match(javascript, /\$\('#rail-badge'\)\.textContent = r\.caixas\.semResposta;/);
  assert.match(javascript, /\$\('#rail-badge'\)\.hidden = r\.caixas\.semResposta === 0;/);
  assert.doesNotMatch(javascript, /\$\('#rail-badge'\)\.textContent = r\.caixas\.todas;/);
});
