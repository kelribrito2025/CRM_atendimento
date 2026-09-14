'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const javascript = fs.readFileSync(path.join(raiz, 'client', 'assets', 'js', 'atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'client', 'assets', 'css', 'app.css'), 'utf8');

test('lista: Sem resposta fica como texto vermelho no final da última mensagem', () => {
  assert.match(javascript, /c\.semResposta && tag[\s\S]*class: 'conversa-previa-linha'[\s\S]*class: 'conversa-previa'[\s\S]*class: 'tag vermelho tag-sem-resposta'/);
  assert.match(css, /\.conversa-previa-linha\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/);
  assert.match(css, /\.tag-sem-resposta\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*top:\s*50%;[^}]*translateY\(-50%\)/);
  assert.match(css, /\.tag-sem-resposta\s*\{[^}]*padding:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*var\(--superficie\);/);
  assert.doesNotMatch(css, /\.conversa-previa[^\n]*padding-right/);
});

test('lista: card pulsa somente depois de cinco minutos sem resposta', () => {
  assert.match(javascript, /const semRespostaAtrasada = c\.semResposta && Number\(c\.semRespostaMin\) > 5;/);
  assert.match(javascript, /semRespostaAtrasada \? ' sem-resposta-atrasada' : ''/);
  assert.match(css, /\.conversa\.sem-resposta-atrasada\s*\{[^}]*animation:\s*conversa-sem-resposta-pulso 1\.8s ease-in-out infinite;/);
  assert.match(css, /@keyframes conversa-sem-resposta-pulso\s*\{[\s\S]*box-shadow:\s*inset/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.conversa\.sem-resposta-atrasada\s*\{[^}]*animation:\s*none;/);
});
