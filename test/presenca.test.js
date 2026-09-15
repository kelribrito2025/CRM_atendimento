'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { VALIDADE_PRESENCA_MS } = require('../src/presenca');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };

async function subirServidor() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Kely Ribeiro', comDadosExemplo: false });
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }) });
  const servidor = await new Promise((resolve) => { const instancia = app.listen(0, () => resolve(instancia)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const chamar = async (caminho, metodo = 'GET', corpo) => {
    const resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { resposta, dados: await resposta.json().catch(() => ({})) };
  };
  return { db, base, cookie, chamar, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

function atendente(dados, id) {
  return dados.atendentes.find((a) => Number(a.id) === Number(id));
}

test('presença: só fica online após heartbeat real da tela e expira sem novos sinais', async () => {
  const s = await subirServidor();
  try {
    const me = (await s.chamar('/api/me')).dados.usuario;
    assert.equal(atendente((await s.chamar('/api/resumo')).dados, me.id).presenca, 'offline');

    const sinal = await s.chamar('/api/presenca', 'POST', { abaId: 'aba-presenca-0001' });
    assert.equal(sinal.resposta.status, 200, JSON.stringify(sinal.dados));
    assert.equal(atendente((await s.chamar('/api/resumo')).dados, me.id).presenca, 'online');

    await s.db.prepare('UPDATE presencas_atendimento SET ultima_atividade_em = ?').run(Date.now() - VALIDADE_PRESENCA_MS - 1);
    assert.equal(atendente((await s.chamar('/api/resumo')).dados, me.id).presenca, 'offline');
  } finally { await s.fechar(); }
});

test('presença: fechar uma aba não deixa offline enquanto outra aba estiver aberta', async () => {
  const s = await subirServidor();
  try {
    const me = (await s.chamar('/api/me')).dados.usuario;
    await s.chamar('/api/presenca', 'POST', { abaId: 'aba-presenca-0001' });
    await s.chamar('/api/presenca', 'POST', { abaId: 'aba-presenca-0002' });

    await s.chamar('/api/presenca', 'DELETE', { abaId: 'aba-presenca-0001' });
    assert.equal(atendente((await s.chamar('/api/resumo')).dados, me.id).presenca, 'online');

    await s.chamar('/api/presenca', 'DELETE', { abaId: 'aba-presenca-0002' });
    assert.equal(atendente((await s.chamar('/api/resumo')).dados, me.id).presenca, 'offline');
  } finally { await s.fechar(); }
});

test('presença: logout remove os sinais da sessão e ids inválidos são recusados', async () => {
  const s = await subirServidor();
  try {
    assert.equal((await s.chamar('/api/presenca', 'POST', { abaId: 'curta' })).resposta.status, 400);
    assert.equal((await s.chamar('/api/presenca', 'POST', { abaId: 'aba-presenca-0001' })).resposta.status, 200);
    assert.equal(Number((await s.db.prepare('SELECT COUNT(*) AS n FROM presencas_atendimento').get()).n), 1);

    assert.equal((await s.chamar('/logout', 'POST')).resposta.status, 200);
    assert.equal(Number((await s.db.prepare('SELECT COUNT(*) AS n FROM presencas_atendimento').get()).n), 0);
  } finally { await s.fechar(); }
});

test('presença: frontend envia heartbeat por aba e não mostra livre para offline', () => {
  const javascript = fs.readFileSync(path.join(__dirname, '..', 'client', 'assets', 'js', 'atendimento.js'), 'utf8');
  assert.match(javascript, /const abaPresencaId = globalThis\.crypto\?\.randomUUID/);
  assert.match(javascript, /api\('\/presenca', \{ method: 'POST'/);
  assert.match(javascript, /setInterval\(\(\) => sinalizarPresenca\(\).*20_000\)/s);
  assert.match(javascript, /window\.addEventListener\('pagehide', encerrarPresenca\)/);
  assert.match(javascript, /: 'offline';/);
});
