'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const javascript = fs.readFileSync(path.join(raiz, 'client', 'assets', 'js', 'atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'client', 'assets', 'css', 'app.css'), 'utf8');
const api = fs.readFileSync(path.join(raiz, 'src', 'rotas-api.js'), 'utf8');

test('inbox da equipe: botão mais abre cadastro administrativo com nome e cor', () => {
  assert.match(javascript, /title: 'Criar inbox da equipe'/);
  assert.match(javascript, /onclick: abrirCriacaoInbox/);
  assert.match(javascript, /function abrirCriacaoInbox\(\)/);
  assert.match(javascript, /type: 'text', maxlength: '60'/);
  assert.match(javascript, /type: 'color', value: '#12B85C'/);
  assert.match(javascript, /'aria-modal': 'true'/);
  assert.match(css, /\.modal\.criar-inbox \{ max-width: 500px; \}/);
});

test('inbox da equipe: salva pela API e atualiza a barra lateral imediatamente', () => {
  assert.match(javascript, /api\('\/equipe\/inboxes', \{ method: 'POST', body: \{ nome: nomeLimpo, cor: cor\.value \} \}\)/);
  assert.match(javascript, /await carregarResumo\(\);/);
  assert.match(javascript, /Inbox \$\{equipe\.nome\} criada\./);
  assert.match(api, /r\.post\('\/equipe\/inboxes', soAdmin/);
  assert.match(api, /avisos\?\.avisar\(\{ origem: 'equipe_criada', equipeId:/);
});

test('inbox da equipe: Admin continua reservado e oculto', () => {
  assert.match(javascript, /nomeLimpo\.toLocaleLowerCase\('pt-BR'\) === 'admin'/);
  assert.match(javascript, /toLocaleLowerCase\('pt-BR'\) !== 'admin'/);
  assert.match(api, /nome\.toLocaleLowerCase\('pt-BR'\) === 'admin'/);
});
