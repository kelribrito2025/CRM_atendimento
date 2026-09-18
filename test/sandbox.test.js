'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aplicarSandbox, ErroSandbox } = require('../src/sandbox');
const { criarUazapi } = require('../src/uazapi');
const { criarTelegram } = require('../src/telegram');
const { criarAbrirConta } = require('../src/abrir-conta');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { abrirBancoDeTeste } = require('./apoio');

function fetchQueNaoPodeSerChamado(chamadas) {
  return async (url) => { chamadas.push(String(url)); throw new Error(`fetch não deveria ser chamado: ${url}`); };
}

test('sandbox: WhatsApp não envia, não exclui e não conecta de verdade; leitura continua', async () => {
  const chamadas = [];
  const real = criarUazapi({ url: 'https://wa.exemplo.com', adminToken: 'admin', fetchImpl: fetchQueNaoPodeSerChamado(chamadas) });
  const { uazapi } = aplicarSandbox({ uazapi: real });

  assert.equal(uazapi.configurado, true, 'continua "configurado" para as telas funcionarem');
  assert.equal(uazapi.sandbox, true);
  const envio = await uazapi.enviarTexto('tok', '5511999999999', 'oi');
  assert.match(envio.messageid, /^sandbox:wa:/);
  const midia = await uazapi.enviarMidia('tok', '5511999999999', { url: 'https://x/y.png' });
  assert.match(midia.messageid, /^sandbox:wa:/);
  assert.deepEqual(await uazapi.excluir('tok'), { sandbox: true });
  assert.deepEqual(await uazapi.desconectar('tok'), { sandbox: true });
  assert.deepEqual(await uazapi.configurarWebhook('tok', { url: 'https://dev' }), { sandbox: true });
  await assert.rejects(uazapi.conectar('tok'), ErroSandbox);
  await assert.rejects(uazapi.criarInstancia('nova'), ErroSandbox);
  assert.deepEqual(chamadas, [], 'nenhuma chamada saiu para o servidor do WhatsApp');

  // Leitura passa para o cliente real (que aqui tenta o fetch e falha).
  await assert.rejects(uazapi.status('tok'), /Não foi possível falar com o servidor/);
  assert.equal(chamadas.length, 1);
});

test('sandbox: Telegram não recebe (sondagem desligada) e não envia de verdade', async () => {
  const chamadas = [];
  const real = criarTelegram({ fetchImpl: fetchQueNaoPodeSerChamado(chamadas) });
  const { telegram } = aplicarSandbox({ telegram: real });

  assert.equal(telegram.sandbox, true);
  const item = telegram.sondagem.iniciar({ id: 7, instancia_token: '123:abc' }, {});
  assert.equal(item, null);
  assert.equal(telegram.sondagem.ativo(7), false);
  assert.equal(telegram.sondagem.parar(7), false);
  telegram.sondagem.pararTodas();

  const r = await telegram.enviarTexto('123:abc', 42, 'oi');
  assert.match(r.messageId, /^sandbox:tg:/);
  const a = await telegram.enviarArquivo('123:abc', 42, { url: 'https://x/y.png' });
  assert.match(a.messageId, /^sandbox:tg:/);
  assert.deepEqual(await telegram.removerWebhook('123:abc'), { ok: true, sandbox: true });
  assert.deepEqual(chamadas, [], 'nenhuma chamada saiu para o Telegram');

  assert.equal(typeof telegram.validarToken, 'function', 'validar token e baixar arquivos continuam disponíveis');
  assert.equal(typeof telegram.baixarArquivo, 'function');
});

test('sandbox: abrir conta do cliente fica desligado', async () => {
  const real = criarAbrirConta({ url: 'https://site.exemplo.com/impersonar', token: 'chave' });
  const { abrirConta } = aplicarSandbox({ abrirConta: real });
  assert.equal(abrirConta.configurado, false);
  await assert.rejects(abrirConta.pedirLink({ clienteId: 1 }), ErroSandbox);
});

test('sandbox: clientes ausentes continuam ausentes', () => {
  const r = aplicarSandbox({ uazapi: null, telegram: undefined, abrirConta: null });
  assert.equal(r.uazapi, null);
  assert.equal(r.telegram, undefined);
  assert.equal(r.abrirConta, null);
});

test('sandbox: /ambiente informa se o modo de teste está ligado (sem precisar de login)', async () => {
  for (const sandbox of [true, false]) {
    const db = await abrirBancoDeTeste();
    const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), sandbox });
    const servidor = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
      const r = await fetch(`http://127.0.0.1:${servidor.address().port}/ambiente`);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { sandbox });
    } finally {
      await new Promise((r) => servidor.close(r));
      await db.fechar();
    }
  }
});
