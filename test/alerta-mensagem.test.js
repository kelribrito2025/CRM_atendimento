'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function modulo() {
  return import(pathToFileURL(path.join(__dirname, '../client/assets/js/alerta-mensagem.mjs')).href);
}

test('alerta: não avisa no carregamento inicial', async () => {
  const { detectarNovasMensagens } = await modulo();
  const conversas = [{ id: 1, ultimaEm: 100, ultimaTipo: 'cliente', ultimaTexto: 'Olá', naoLidas: 1 }];
  const resultado = detectarNovasMensagens(conversas, new Map(), false);
  assert.equal(resultado.recebeuMensagem, false);
  assert.equal(resultado.referencias.size, 1);
});

test('alerta: avisa quando chega uma nova mensagem do cliente', async () => {
  const { detectarNovasMensagens } = await modulo();
  const referencias = new Map([[1, '100:cliente:Olá']]);
  const resultado = detectarNovasMensagens(
    [{ id: 1, ultimaEm: 200, ultimaTipo: 'cliente', ultimaTexto: 'Preciso de ajuda', naoLidas: 2 }],
    referencias,
    true,
  );
  assert.equal(resultado.recebeuMensagem, true);
});

test('alerta: não avisa para resposta do atendente', async () => {
  const { detectarNovasMensagens } = await modulo();
  const referencias = new Map([[1, '100:cliente:Olá']]);
  const resultado = detectarNovasMensagens(
    [{ id: 1, ultimaEm: 200, ultimaTipo: 'atendente', ultimaTexto: 'Como posso ajudar?', naoLidas: 0 }],
    referencias,
    true,
  );
  assert.equal(resultado.recebeuMensagem, false);
});

test('alerta: não repete o som para a mesma mensagem recebida', async () => {
  const { detectarNovasMensagens } = await modulo();
  const conversa = { id: 1, ultimaEm: 200, ultimaTipo: 'cliente', ultimaTexto: 'Preciso de ajuda', naoLidas: 2 };
  const primeira = detectarNovasMensagens([conversa], new Map([[1, '100:cliente:Olá']]), true);
  const segunda = detectarNovasMensagens([conversa], primeira.referencias, true);
  assert.equal(primeira.recebeuMensagem, true);
  assert.equal(segunda.recebeuMensagem, false);
});

test('alerta: avisa para uma conversa nova que chega não lida', async () => {
  const { detectarNovasMensagens } = await modulo();
  const resultado = detectarNovasMensagens(
    [{ id: 9, ultimaEm: 300, ultimaTipo: 'cliente', ultimaTexto: 'Novo atendimento', naoLidas: 1 }],
    new Map(),
    true,
  );
  assert.equal(resultado.recebeuMensagem, true);
});

test('alerta: o arquivo de áudio configurado existe', () => {
  const fs = require('node:fs');
  const arquivo = path.join(__dirname, '../client/assets/sons/sound4-soft.mp3');
  assert.ok(fs.existsSync(arquivo));
  assert.ok(fs.statSync(arquivo).size > 0);
});
