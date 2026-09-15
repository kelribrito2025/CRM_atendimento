'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const javascript = fs.readFileSync(
  path.join(__dirname, '..', 'client', 'assets', 'js', 'atendimento.js'),
  'utf8',
);

const inicio = javascript.indexOf('function renderChat(');
const fim = javascript.indexOf('* Render: painel do cliente', inicio);
const renderChat = javascript.slice(inicio, fim);

test('cabeçalho da conversa: oculta o protocolo e mantém o tempo de abertura', () => {
  assert.ok(inicio >= 0 && fim > inicio, 'renderChat precisa continuar identificável');
  assert.match(renderChat, /class: 'chat-sub'[\s\S]*textoAberto\(c\.criadaEm, c\.status\)/);
  assert.doesNotMatch(renderChat, /protocolo #\$\{c\.protocolo\}/);
});
