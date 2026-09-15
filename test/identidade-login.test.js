'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(raiz, 'client', 'assets', 'css', 'acesso.css'), 'utf8');
const paginas = ['login.html', 'convite.html', 'verificar.html', 'recuperar.html', 'nova-senha.html', 'escolher-atendente.html'];

test('identidade: Atendimento mantém somente a inicial maiúscula no logotipo', () => {
  for (const pagina of paginas) {
    const html = fs.readFileSync(path.join(raiz, 'client', pagina), 'utf8');
    assert.match(html, /<span class="sub">Atendimento<\/span>/, pagina);
  }
  const regra = css.match(/\.marca \.sub \{[^}]+\}/)?.[0] || '';
  assert.doesNotMatch(regra, /text-transform:\s*uppercase/);
});
