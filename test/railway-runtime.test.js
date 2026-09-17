'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.join(__dirname, '..');

function sistemaIsolado(env = {}) {
  const chamadas = { abrir: [], seed: 0, telegram: 0, parar: 0, fechar: 0, intervalos: 0, limpar: 0, logs: [] };
  const db = { prepare() { throw Error('SQL proibido neste teste'); }, exec() { throw Error('SQL proibido neste teste'); }, async fechar() { chamadas.fechar++; } };
  const vazio = () => ({});
  const modulos = {
    'node:fs': { existsSync: () => false }, 'node:path': path,
    './env': { carregarEnv() {} },
    './db': { async abrirBanco(destino, opcoes) { chamadas.abrir.push({ destino, opcoes }); return db; }, async semear() { chamadas.seed++; return { adminCriado: true }; } },
    './app': { criarApp: vazio }, './email': { criarEnviador: vazio },
    './sessoes': { limparSessoesExpiradas: vazio }, './acesso': { limparAcessosExpirados: vazio },
    './uazapi': { criarUazapi: vazio }, './telegram': { criarTelegram: () => ({ sondagem: { pararTodas() { chamadas.parar++; } } }) },
    './saldo': { criarSaldo: vazio }, './s3': { criarS3: vazio },
    './widget': { criarWidget: () => ({ limparSessoesExpiradas: vazio }) },
    './eventos': { criarAvisos: vazio }, './abrir-conta': { criarAbrirConta: vazio },
    './canais': { async ligarTelegramTodos() { chamadas.telegram++; return 1; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(raiz, 'src/sistema.js'), 'utf8'), {
    module, exports: module.exports, __dirname: path.join(raiz, 'src'), URL,
    process: { env: { ...env } },
    require(nome) { if (!(nome in modulos)) throw Error('Import não previsto'); return modulos[nome]; },
    console: { log: (...args) => chamadas.logs.push(args.join(' ')), error: (...args) => chamadas.logs.push(args.join(' ')) },
    setInterval() { chamadas.intervalos++; return { unref() {} }; }, clearInterval() { chamadas.limpar++; },
  }, { filename: 'sistema-isolado.js' });
  return { api: module.exports, chamadas };
}

const ambienteTeste = () => ({ NODE_ENV: 'production', DATABASE_URL: 'mysql://banco.invalid/crm_ficticio' });

test('Railway: produção e presença da plataforma desativam migrations e automações', () => {
  for (const env of [ambienteTeste(), { DATABASE_URL: ambienteTeste().DATABASE_URL, RAILWAY_ENVIRONMENT_ID: 'ambiente-ficticio' }]) {
    const { api } = sistemaIsolado(env);
    const config = api.lerConfig();
    assert.equal(config.migracoesAutomaticas, false);
    assert.equal(config.integracoesAutomaticas, false);
    assert.equal(config.ambienteProducao, true);
  }
  const configLocal = sistemaIsolado().api.lerConfig();
  assert.equal(configLocal.migracoesAutomaticas, true);
  assert.equal(configLocal.integracoesAutomaticas, true);
});

test('Railway: produção sem destino MySQL válido falha antes de abrir banco', async () => {
  for (const destino of ['', ':memory:', 'mysql://banco.invalid', 'postgres://banco.invalid/crm']) {
    const { api, chamadas } = sistemaIsolado({ NODE_ENV: 'production', DATABASE_URL: destino });
    await assert.rejects(api.montarSistema(), /DATABASE_URL/);
    assert.equal(chamadas.abrir.length, 0);
  }
});

test('Railway: flags inválidas são recusadas sem revelar seus conteúdos', () => {
  for (const nome of ['MIGRACOES_AUTOMATICAS', 'INTEGRACOES_AUTOMATICAS']) {
    const marcador = 'conteudo-que-nao-pode-ser-registrado';
    const { api } = sistemaIsolado({ ...ambienteTeste(), [nome]: marcador });
    assert.throws(() => api.lerConfig(), (erro) => erro.message.includes(nome) && !erro.message.includes(marcador));
  }
});

test('Railway: boot bloqueado não faz seed, polling, limpeza nem consultas', async () => {
  const { api, chamadas } = sistemaIsolado(ambienteTeste());
  const montado = await api.montarSistema();
  assert.equal(chamadas.abrir[0].opcoes.inicializar, false);
  assert.equal(chamadas.seed, 0);
  assert.equal(chamadas.telegram, 0);
  assert.equal(chamadas.intervalos, 0);
  await montado.fechar();
  await montado.fechar();
  assert.equal(chamadas.fechar, 1);
  assert.equal(chamadas.parar, 1);
});

test('Railway: bootstrap explícito exige senha fornecida e segue desativado por padrão', async () => {
  const negado = sistemaIsolado({ ...ambienteTeste(), MIGRACOES_AUTOMATICAS: 'true' });
  await assert.rejects(negado.api.montarSistema(), /ADMIN_SENHA/);
  assert.equal(negado.chamadas.abrir.length, 0);
  const permitido = sistemaIsolado({ ...ambienteTeste(), MIGRACOES_AUTOMATICAS: 'true', ADMIN_SENHA: 'somente-fixture-local' });
  await permitido.api.montarSistema();
  assert.equal(permitido.chamadas.abrir[0].opcoes.inicializar, true);
  assert.equal(permitido.chamadas.seed, 1); // apenas fake, nenhum driver/SQL.
  assert.equal(permitido.chamadas.telegram, 0);
});

test('Railway: parar automações precede fechamento do pool e é idempotente', async () => {
  const { api, chamadas } = sistemaIsolado({ ...ambienteTeste(), INTEGRACOES_AUTOMATICAS: 'true' });
  const montado = await api.montarSistema();
  assert.equal(chamadas.telegram, 1);
  assert.equal(chamadas.intervalos, 1);
  montado.pararAutomacoes();
  montado.pararAutomacoes();
  assert.equal(chamadas.fechar, 0);
  assert.equal(chamadas.parar, 1);
  assert.equal(chamadas.limpar, 1);
  assert.equal(montado.fechar(), montado.fechar());
  await montado.fechar();
  assert.equal(chamadas.fechar, 1);
});

test('Railway: boas-vindas não registra credenciais, destinos ou dados de bootstrap', () => {
  const marcador = 'valor-ficticio-nao-registravel';
  const { api, chamadas } = sistemaIsolado({ ...ambienteTeste(), ADMIN_SENHA: marcador, ADMIN_EMAIL: marcador, UAZAPI_ADMIN_TOKEN: marcador, DATABASE_URL: `mysql://banco.invalid/${marcador}` });
  api.mostrarBoasVindas({ config: api.lerConfig(), resultado: { adminCriado: true } }, 'endereco-local-de-teste');
  assert.ok(!chamadas.logs.join('\n').includes(marcador));
});

test('Railway: heartbeat é público, anterior à sessão e não consulta banco', () => {
  const fonte = fs.readFileSync(path.join(raiz, 'src/app.js'), 'utf8');
  const inicio = fonte.indexOf("app.get('/api/heartbeat'");
  assert.ok(inicio > 0);
  assert.ok(inicio < fonte.indexOf('sessoes.buscarContextoDaSessao'));
  const trecho = fonte.slice(inicio, fonte.indexOf('\n', inicio));
  assert.doesNotMatch(trecho, /prepare|exec|exigirLogin/);
  assert.match(trecho, /ok: true/);
});
