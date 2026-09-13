'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };

async function subirServidor() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: true });
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }) });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const entrar = async (email, senha) => {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };
  const cookie = await entrar(ADMIN.email, ADMIN.senha);
  const chamar = async (caminho, metodo = 'GET', corpo, cookieUsado = cookie) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { Cookie: cookieUsado, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };
  return { db, base, cookie, entrar, chamar, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('respostas rápidas: criar, listar, usar e excluir', async () => {
  const s = await subirServidor();
  try {
    assert.deepEqual((await s.chamar('/api/respostas')).dados.respostas, []);

    const criada = await s.chamar('/api/respostas', 'POST', {
      atalho: '/Estorno Duplicado', titulo: 'Estorno solicitado',
      texto: 'O estorno já está solicitado e cai em até 5 dias úteis.', escopo: 'todas',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.dados));
    const r = criada.dados.respostas[0];
    assert.equal(r.atalho, 'estorno-duplicado', 'o atalho vira um texto simples, sem barra nem acento');
    assert.equal(r.titulo, 'Estorno solicitado');
    assert.equal(r.escopo, 'todas');
    assert.equal(r.usos, 0);
    assert.equal(r.podeEditar, true);

    // atalho repetido não passa
    const repetida = await s.chamar('/api/respostas', 'POST', { atalho: 'estorno-duplicado', titulo: 'Outra', texto: 'texto', escopo: 'todas' });
    assert.equal(repetida.status, 409);

    // campos obrigatórios
    assert.equal((await s.chamar('/api/respostas', 'POST', { atalho: 'x', titulo: 'T', texto: 'M' })).status, 400);
    assert.equal((await s.chamar('/api/respostas', 'POST', { atalho: 'valido', titulo: '', texto: 'M' })).status, 400);
    assert.equal((await s.chamar('/api/respostas', 'POST', { atalho: 'valido', titulo: 'T', texto: '' })).status, 400);

    // contagem de uso
    assert.equal((await s.chamar(`/api/respostas/${r.id}/uso`, 'POST', {})).status, 200);
    assert.equal((await s.chamar('/api/respostas')).dados.respostas[0].usos, 1);

    // edição e exclusão
    const editada = await s.chamar(`/api/respostas/${r.id}`, 'PATCH', { atalho: 'estorno', titulo: 'Estorno', texto: 'Novo texto', escopo: 'todas' });
    assert.equal(editada.status, 200);
    assert.equal(editada.dados.respostas[0].atalho, 'estorno');
    assert.equal(editada.dados.respostas[0].texto, 'Novo texto');

    const apagada = await s.chamar(`/api/respostas/${r.id}`, 'DELETE');
    assert.equal(apagada.status, 200);
    assert.deepEqual(apagada.dados.respostas, []);
  } finally {
    await s.fechar();
  }
});

test('respostas rápidas: cada pessoa vê só o que lhe cabe', async () => {
  const s = await subirServidor();
  try {
    const equipes = (await s.chamar('/api/resumo')).dados.equipes;
    const reembolso = equipes.find((e) => e.nome === 'Reembolso');
    const marina = await s.entrar('marina@bigteck.com.br', ADMIN.senha);

    await s.chamar('/api/respostas', 'POST', { atalho: 'todos', titulo: 'Para todos', texto: 'texto', escopo: 'todas' });
    await s.chamar('/api/respostas', 'POST', { atalho: 'so-eu', titulo: 'Minha', texto: 'texto', escopo: 'eu' });
    await s.chamar('/api/respostas', 'POST', { atalho: 'reembolso', titulo: 'Da equipe', texto: 'texto', escopo: 'equipe', equipeId: reembolso.id });

    const doAdmin = (await s.chamar('/api/respostas')).dados.respostas.map((x) => x.atalho).sort();
    assert.deepEqual(doAdmin, ['reembolso', 'so-eu', 'todos'], 'quem criou vê tudo o que criou');

    const daMarina = (await s.chamar('/api/respostas', 'GET', null, marina)).dados.respostas.map((x) => x.atalho).sort();
    assert.deepEqual(daMarina, ['reembolso', 'todos'], 'ela vê as de todos e as da equipe dela, não a particular do admin');

    // equipe inválida é recusada
    assert.equal((await s.chamar('/api/respostas', 'POST', { atalho: 'x1', titulo: 'T', texto: 'M', escopo: 'equipe', equipeId: 9999 })).status, 400);

    // quem não criou não altera nem exclui
    const daEquipe = (await s.chamar('/api/respostas')).dados.respostas.find((x) => x.atalho === 'reembolso');
    assert.equal((await s.chamar(`/api/respostas/${daEquipe.id}`, 'PATCH', { atalho: 'reembolso', titulo: 'T', texto: 'M', escopo: 'todas' }, marina)).status, 403);
    assert.equal((await s.chamar(`/api/respostas/${daEquipe.id}`, 'DELETE', null, marina)).status, 403);
  } finally {
    await s.fechar();
  }
});

test('respostas rápidas: só quem está logado acessa', async () => {
  const s = await subirServidor();
  try {
    assert.equal((await fetch(`${s.base}/api/respostas`)).status, 401);
    const criar = await fetch(`${s.base}/api/respostas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ atalho: 'x', titulo: 'T', texto: 'M' }) });
    assert.equal(criar.status, 401);
  } finally {
    await s.fechar();
  }
});
