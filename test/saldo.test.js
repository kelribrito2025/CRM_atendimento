'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco, semear } = require('../src/db');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarSaldo, normalizarPin } = require('../src/saldo');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const CHAVE = 'chave-secreta-do-agente';

const CLIENTE = {
  id: 4380402, name: 'Pedro', email: 'cliente@exemplo.com', pin: 5446,
  balance: 314.21, balanceCents: 31421, status: 'active', banned: false,
  createdAt: '2026-01-30T14:00:47.000Z',
  recharges: [{ amountCents: 5000, amount: 50, createdAt: '2026-02-01T10:00:00.000Z' }],
  totalRecharges: 12,
};

// API de mentira do Número Virtual.
function fetchFalso(registro = []) {
  return async (url, opts) => {
    registro.push({ url, headers: opts.headers, corpo: JSON.parse(opts.body) });
    const corpo = JSON.parse(opts.body);
    if (opts.headers.Authorization !== `Bearer ${CHAVE}`) {
      return new Response(JSON.stringify({ error: 'unauthorized', message: 'Invalid or inactive API key' }), { status: 401 });
    }
    if (typeof corpo.pin !== 'number') {
      return new Response(JSON.stringify({ error: 'bad_request', message: 'PIN (number) or email (string) is required' }), { status: 400 });
    }
    if (corpo.pin !== CLIENTE.pin) {
      return new Response(JSON.stringify({ error: 'not_found', message: 'Cliente nao encontrado com este PIN' }), { status: 404 });
    }
    return new Response(JSON.stringify(CLIENTE), { status: 200 });
  };
}

async function subirServidor(opcoesSaldo = {}) {
  const db = abrirBanco(':memory:');
  semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: true });
  const registro = [];
  const saldo = criarSaldo({ url: 'https://app.numero-virtual.com/api/agents/customer/lookup', token: CHAVE, fetchImpl: fetchFalso(registro), ...opcoesSaldo });
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), saldo });
  const servidor = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const chamar = async (caminho, corpo) => {
    const r = await fetch(`${base}${caminho}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };
  return { base, chamar, cookie, registro, fechar: () => new Promise((r) => servidor.close(r)) };
}

test('saldo: PIN vira número e os valores saem em centavos e em reais', () => {
  assert.equal(normalizarPin('5446'), 5446);
  assert.equal(normalizarPin(' 54 46 '), 5446);
  assert.equal(normalizarPin('abc'), null);
  assert.equal(normalizarPin(''), null);
  assert.equal(normalizarPin('1234567890123'), null);
});

test('saldo: consulta manda o PIN como número e resume a resposta', async () => {
  const registro = [];
  const saldo = criarSaldo({ token: CHAVE, fetchImpl: fetchFalso(registro) });
  const cliente = await saldo.consultarPorPin('5446');
  assert.equal(registro[0].corpo.pin, 5446);
  assert.equal(typeof registro[0].corpo.pin, 'number');
  assert.equal(registro[0].headers.Authorization, `Bearer ${CHAVE}`);
  assert.equal(cliente.saldoCentavos, 31421);
  assert.equal(cliente.saldo.replace(/ /g, ' '), 'R$ 314,21');
  assert.equal(cliente.nome, 'Pedro');
  assert.equal(cliente.bloqueada, false);
  assert.equal(cliente.totalRecargas, 12);
  assert.equal(cliente.ultimaRecarga.valorCentavos, 5000);
  assert.equal(cliente.id, undefined, 'não repassa campos que a tela não usa');
});

test('saldo: erros viram mensagens claras e a chave nunca sai do servidor', async () => {
  const semChave = criarSaldo({ token: '', fetchImpl: fetchFalso() });
  await assert.rejects(() => semChave.consultarPorPin('5446'), /não configurada/);
  const errado = criarSaldo({ token: 'chave-errada', fetchImpl: fetchFalso() });
  await assert.rejects(() => errado.consultarPorPin('5446'), /inválida ou expirou/);
  const ok = criarSaldo({ token: CHAVE, fetchImpl: fetchFalso() });
  await assert.rejects(() => ok.consultarPorPin('9999'), (e) => e.naoEncontrado && /Nenhum cliente encontrado/.test(e.message));
  await assert.rejects(() => ok.consultarPorPin('abc'), /PIN válido/);
});

test('saldo: a rota exige login e devolve só o resumo', async () => {
  const s = await subirServidor();
  try {
    const deslogado = await fetch(`${s.base}/api/suporte/saldo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '5446' }) });
    assert.equal(deslogado.status, 401);

    const ok = await s.chamar('/api/suporte/saldo', { pin: '5446' });
    assert.equal(ok.status, 200, JSON.stringify(ok.dados));
    assert.equal(ok.dados.cliente.saldoCentavos, 31421);
    assert.equal(JSON.stringify(ok.dados).includes(CHAVE), false, 'a chave não pode ir para o navegador');

    const naoAchou = await s.chamar('/api/suporte/saldo', { pin: '9999' });
    assert.equal(naoAchou.status, 404);
    assert.equal(naoAchou.dados.naoEncontrado, true);

    const vazio = await s.chamar('/api/suporte/saldo', { pin: '' });
    assert.equal(vazio.status, 400);

    const resumo = await fetch(`${s.base}/api/resumo`, { headers: { Cookie: s.cookie } }).then((r) => r.json());
    assert.equal(resumo.saldoAtivo, true);
  } finally {
    await s.fechar();
  }
});

test('saldo: consulta em massa é barrada', async () => {
  const s = await subirServidor();
  try {
    let bloqueado = null;
    for (let i = 0; i < 61 && !bloqueado; i += 1) {
      const r = await s.chamar('/api/suporte/saldo', { pin: '5446' });
      if (r.status === 429) bloqueado = r;
    }
    assert.ok(bloqueado, 'deveria bloquear depois de muitas consultas seguidas');
    assert.match(bloqueado.dados.erro, /Muitas consultas/);
  } finally {
    await s.fechar();
  }
});
