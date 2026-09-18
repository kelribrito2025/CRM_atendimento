'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aplicarSandbox, carregarTokensProtegidos, gravarTokensProtegidos, ErroSandbox, CHAVE_TOKENS_PROTEGIDOS } = require('../src/sandbox');
const { criarUazapi } = require('../src/uazapi');
const { criarTelegram } = require('../src/telegram');
const { criarAbrirConta } = require('../src/abrir-conta');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { abrirBancoDeTeste } = require('./apoio');

const PROD = 'token-de-producao';
const TESTE = 'token-criado-no-dev';

function fetchQueRegistra(chamadas) {
  return async (url) => { chamadas.push(String(url)); throw new Error(`fetch: ${url}`); };
}

test('sandbox: WhatsApp de produção não envia, não exclui e não conecta; instância criada no dev funciona', async () => {
  const chamadas = [];
  const real = criarUazapi({ url: 'https://wa.exemplo.com', adminToken: 'admin', fetchImpl: fetchQueRegistra(chamadas) });
  const { uazapi } = aplicarSandbox({ uazapi: real, protegidos: new Set([PROD]) });

  assert.equal(uazapi.configurado, true, 'continua "configurado" para as telas funcionarem');
  assert.equal(uazapi.sandbox, true);
  assert.match((await uazapi.enviarTexto(PROD, '5511999999999', 'oi')).messageid, /^sandbox:wa:/);
  assert.match((await uazapi.enviarMidia(PROD, '5511999999999', { url: 'https://x/y.png' })).messageid, /^sandbox:wa:/);
  assert.deepEqual(await uazapi.excluir(PROD), { sandbox: true });
  assert.deepEqual(await uazapi.desconectar(PROD), { sandbox: true });
  assert.deepEqual(await uazapi.configurarWebhook(PROD, { url: 'https://dev' }), { sandbox: true });
  await assert.rejects(uazapi.conectar(PROD), ErroSandbox);
  assert.deepEqual(chamadas, [], 'nada do canal de produção saiu para o servidor do WhatsApp');

  // Instância que não é de produção: as chamadas vão de verdade (aqui o fetch falso registra e falha).
  await assert.rejects(uazapi.enviarTexto(TESTE, '5511999999999', 'oi'), /Não foi possível falar/);
  await assert.rejects(uazapi.conectar(TESTE), /Não foi possível falar/);
  await assert.rejects(uazapi.criarInstancia('nova-de-teste'), /Não foi possível falar/);
  await assert.rejects(uazapi.status(PROD), /Não foi possível falar/, 'consultar status é leitura e passa sempre');
  assert.equal(chamadas.length, 4);
});

test('sandbox: bot do Telegram de produção não recebe nem envia; bot criado no dev funciona', async () => {
  const chamadas = [];
  const real = criarTelegram({ fetchImpl: fetchQueRegistra(chamadas) });
  const { telegram } = aplicarSandbox({ telegram: real, protegidos: new Set([PROD]) });

  assert.equal(telegram.sandbox, true);
  assert.equal(telegram.sondagem.iniciar({ id: 7, instancia_token: PROD }, {}), null, 'bot de produção não liga');
  assert.equal(telegram.sondagem.ativo(7), false);
  assert.match((await telegram.enviarTexto(PROD, 42, 'oi')).messageId, /^sandbox:tg:/);
  assert.deepEqual(await telegram.editarTexto(PROD, 42, 77, 'novo'), { messageId: 77, chatId: 42, editado: true });
  assert.match((await telegram.enviarArquivo(PROD, 42, { url: 'https://x/y.png' })).messageId, /^sandbox:tg:/);
  assert.deepEqual(await telegram.removerWebhook(PROD), { ok: true, sandbox: true });
  assert.deepEqual(chamadas, [], 'nada do bot de produção saiu para o Telegram');

  // Bot criado no dev: a consulta contínua liga de verdade e os envios saem.
  const item = telegram.sondagem.iniciar({ id: 9, instancia_token: TESTE }, {});
  assert.ok(item, 'bot de teste liga');
  assert.equal(telegram.sondagem.ativo(9), true);
  assert.equal(telegram.sondagem.parar(9), true);
  assert.equal(telegram.sondagem.ativo(9), false);
  await assert.rejects(telegram.enviarTexto(TESTE, 42, 'oi'), /Não foi possível falar/);
  assert.ok(chamadas.some((u) => u.includes(`/bot${TESTE}/sendMessage`)));
  assert.ok(chamadas.some((u) => u.includes(`/bot${TESTE}/getUpdates`)), 'a consulta contínua do bot de teste chegou a chamar o Telegram');
  telegram.sondagem.pararTodas();
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

test('sandbox: lista de canais de produção vem do banco; sem lista, tudo o que existe vira produção', async () => {
  const db = await abrirBancoDeTeste();
  try {
    const agora = Date.now();
    let n = 0;
    const gravar = db.prepare("INSERT INTO canais (tipo, nome, instancia_token, webhook_segredo, status, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 'connected', ?, ?)");
    const inserir = (tipo, nome, token) => gravar.run(tipo, nome, token, `segredo-${n += 1}`, agora, agora);
    await inserir('telegram', 'Bot antigo', PROD);
    await inserir('whatsapp', 'Zap antigo', 'wa-prod');
    await inserir('whatsapp', 'Sem token', null);

    const primeira = await carregarTokensProtegidos(db);
    assert.deepEqual([...primeira].sort(), [PROD, 'wa-prod'].sort());
    const gravado = await db.prepare('SELECT valor FROM ajustes WHERE chave = ?').get(CHAVE_TOKENS_PROTEGIDOS);
    assert.deepEqual(JSON.parse(gravado.valor).sort(), [PROD, 'wa-prod'].sort());

    // Bot criado depois não entra na lista já gravada.
    await inserir('telegram', 'Bot de teste', TESTE);
    const segunda = await carregarTokensProtegidos(db);
    assert.equal(segunda.has(TESTE), false);
    assert.equal(segunda.has(PROD), true);

    // O script de cópia grava a lista com a mesma chave; a regravação substitui.
    await gravarTokensProtegidos(db, ['x', 'x', 'y']);
    assert.deepEqual([...await carregarTokensProtegidos(db)], ['x', 'y']);
  } finally {
    await db.fechar();
  }
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
