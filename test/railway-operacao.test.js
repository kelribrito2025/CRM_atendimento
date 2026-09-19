'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.join(__dirname, '..');
const proximoTurno = () => new Promise((resolve) => setImmediate(resolve));

async function processoFalso({ poolPendente = false } = {}) {
  const eventos = [], sinais = {}, handlers = {}, saidas = [], prazos = [];
  const servidor = {
    on(nome, fn) { handlers[nome] = fn; },
    close(fn) { eventos.push('http-fechado'); fn(); },
    closeAllConnections() { eventos.push('forcar-conexoes'); },
  };
  const sistema = {
    config: { porta: 43210 },
    app: { listen(porta, host, fn) { eventos.push({ porta, host }); fn(); return servidor; } },
    pararAutomacoes() { eventos.push('automacoes-paradas'); },
    async fechar() { eventos.push('pool-fechado'); if (poolPendente) await new Promise(() => {}); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(raiz, 'server.js'), 'utf8'), {
    process: { removeAllListeners() {}, on(nome, fn) { sinais[nome] = fn; }, exit(codigo) { saidas.push(codigo); } },
    require(nome) { assert.equal(nome, './src/sistema'); return { montarSistema: async () => sistema, mostrarBoasVindas() {} }; },
    console: { log() {}, error() {}, warn() {} },
    setTimeout(fn) { const timer = { fn, limpo: false, unref() {} }; prazos.push(timer); return timer; },
    clearTimeout(timer) { timer.limpo = true; },
  }, { filename: 'server-falso.js' });
  await proximoTurno();
  return { eventos, sinais, handlers, saidas, prazos };
}

test('Railway: listen usa porta configurada e 0.0.0.0; SIGTERM drena e fecha uma vez', async () => {
  const p = await processoFalso();
  assert.equal(p.eventos[0].porta, 43210);
  assert.equal(p.eventos[0].host, '0.0.0.0');
  p.sinais.SIGTERM();
  p.sinais.SIGINT();
  await proximoTurno();
  assert.deepEqual(p.eventos.slice(1), ['automacoes-paradas', 'http-fechado', 'pool-fechado']);
  assert.deepEqual(p.saidas, [0]);
  assert.equal(p.prazos[0].limpo, true);
});

test('Railway: falha de listen encerra com código de erro sem imprimir detalhes', async () => {
  const p = await processoFalso();
  p.handlers.error(new Error('detalhe-nao-registravel'));
  await proximoTurno();
  assert.deepEqual(p.saidas, [1]);
});

test('Railway: prazo máximo também cobre pool que não termina de fechar', async () => {
  const p = await processoFalso({ poolPendente: true });
  p.sinais.SIGTERM();
  await proximoTurno();
  assert.equal(p.prazos[0].limpo, false);
  p.prazos[0].fn();
  assert.deepEqual(p.saidas, [1]);
  assert.ok(p.eventos.includes('forcar-conexoes'));
});

test('Railway: e-mail de teste não imprime destinatário, códigos ou links', async () => {
  const logs = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(raiz, 'src/email.js'), 'utf8'), {
    module, exports: module.exports, Date,
    console: { log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')) },
  });
  const marcador = 'conteudo-ficticio-protegido';
  const email = module.exports.criarEnviador();
  await email.enviar({ para: marcador, assunto: marcador, texto: marcador });
  assert.equal(email.enviados[0].texto, marcador);
  assert.equal(logs.length, 1);
  assert.ok(!logs.join('\n').includes(marcador));
  await module.exports.criarEnviador({ modo: 'silencioso' }).enviar({ para: marcador, assunto: marcador, texto: marcador });
  assert.equal(logs.length, 1);
});

test('Railway: executa handler público de heartbeat sem sessão ou SQL', () => {
  const registros = [];
  const app = {
    disable() {}, set() {},
    get(caminho, ...handlers) { registros.push({ tipo: 'get', caminho, handlers }); },
    post() {}, use(...handlers) { registros.push({ tipo: 'use', handlers }); },
  };
  const express = Object.assign(() => app, { json: () => () => {}, urlencoded: () => () => {}, static: () => () => {} });
  const vazio = () => ({});
  const modulos = {
    express, 'node:fs': {}, 'node:path': path, 'node:crypto': require('node:crypto'),
    './senha': {}, './sessoes': {}, './acesso': {}, './limitador': { LimitadorTentativas: function () {} },
    './email': { criarEnviador: () => ({ modo: 'silencioso' }) },
    './rotas-api': { criarRotasApi: vazio }, './canais': {}, './util': {},
    './eventos': { criarAvisos: vazio }, './presenca': {},
    './fundo-login': { CAMINHO_FUNDO_LOGIN: '/imagem-ficticia', criarFundoLogin: () => () => {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(raiz, 'src/app.js'), 'utf8'), {
    module, exports: module.exports, __dirname: path.join(raiz, 'src'),
    require(nome) { if (!(nome in modulos)) throw Error('Import não previsto'); return modulos[nome]; },
  });
  const db = new Proxy({}, { get() { throw Error('Acesso a banco proibido'); } });
  module.exports.criarApp(db, { semEstaticos: true });
  const indice = registros.findIndex((r) => r.caminho === '/api/heartbeat');
  const indiceSessao = registros.findIndex((r) => r.handlers.some((fn) => typeof fn === 'function' && fn.toString().includes('buscarContextoDaSessao')));
  assert.ok(indice >= 0 && indice < indiceSessao);
  const rota = registros[indice];
  assert.equal(rota.handlers.length, 1);
  let resposta;
  rota.handlers[0]({ headers: { cookie: 'cookie-ficticio' } }, { json(valor) { resposta = valor; } });
  assert.equal(JSON.stringify(resposta), '{"ok":true}');
});
