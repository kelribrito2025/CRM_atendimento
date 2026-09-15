'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { semear, migrar } = require('../src/db');
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
    const iniciais = (await s.chamar('/api/respostas')).dados.respostas;
    assert.equal(iniciais.length, 1);
    assert.deepEqual(
      { atalho: iniciais[0].atalho, titulo: iniciais[0].titulo, dinamica: iniciais[0].dinamica, podeEditar: iniciais[0].podeEditar },
      { atalho: 'saudacao', titulo: 'Saudação', dinamica: 'saudacao', podeEditar: false },
    );

    const criada = await s.chamar('/api/respostas', 'POST', {
      atalho: '/Estorno Duplicado', titulo: 'Estorno solicitado',
      texto: 'O estorno já está solicitado e cai em até 5 dias úteis.', escopo: 'todas',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.dados));
    const r = criada.dados.respostas.find((resposta) => resposta.atalho === 'estorno-duplicado');
    assert.equal(r.atalho, 'estorno-duplicado', 'o atalho vira um texto simples, sem barra nem acento');
    assert.equal(r.titulo, 'Estorno solicitado');
    assert.equal(r.escopo, 'todas');
    assert.equal(r.usos, 0);
    assert.equal(r.podeEditar, true);

    // atalho repetido não passa
    const repetida = await s.chamar('/api/respostas', 'POST', { atalho: 'estorno-duplicado', titulo: 'Outra', texto: 'texto', escopo: 'todas' });
    assert.equal(repetida.status, 409);
    for (const atalho of ['saudacao', 'bom-dia', 'boa-tarde', 'boa-noite']) {
      assert.equal((await s.chamar('/api/respostas', 'POST', { atalho, titulo: 'Outra', texto: 'texto', escopo: 'todas' })).status, 409);
    }

    // campos obrigatórios
    assert.equal((await s.chamar('/api/respostas', 'POST', { atalho: 'x', titulo: 'T', texto: 'M' })).status, 400);
    assert.equal((await s.chamar('/api/respostas', 'POST', { atalho: 'valido', titulo: '', texto: 'M' })).status, 400);
    assert.equal((await s.chamar('/api/respostas', 'POST', { atalho: 'valido', titulo: 'T', texto: '' })).status, 400);

    // contagem de uso
    assert.equal((await s.chamar(`/api/respostas/${r.id}/uso`, 'POST', {})).status, 200);
    assert.equal((await s.chamar('/api/respostas')).dados.respostas.find((x) => x.id === r.id).usos, 1);

    // edição e exclusão
    const editada = await s.chamar(`/api/respostas/${r.id}`, 'PATCH', { atalho: 'estorno', titulo: 'Estorno', texto: 'Novo texto', escopo: 'todas' });
    assert.equal(editada.status, 200);
    assert.equal(editada.dados.respostas.find((x) => x.id === r.id).atalho, 'estorno');
    assert.equal(editada.dados.respostas.find((x) => x.id === r.id).texto, 'Novo texto');

    const apagada = await s.chamar(`/api/respostas/${r.id}`, 'DELETE');
    assert.equal(apagada.status, 200);
    assert.deepEqual(apagada.dados.respostas.map((x) => x.atalho), ['saudacao']);

    const saudacao = apagada.dados.respostas[0];
    assert.equal((await s.chamar(`/api/respostas/${saudacao.id}`, 'PATCH', { atalho: 'saudacao', titulo: 'Outra', texto: 'Outro texto' })).status, 403);
    assert.equal((await s.chamar(`/api/respostas/${saudacao.id}`, 'DELETE')).status, 403);
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
    assert.deepEqual(doAdmin, ['reembolso', 'saudacao', 'so-eu', 'todos'], 'quem criou vê tudo o que criou e a saudação fixa');

    const daMarina = (await s.chamar('/api/respostas', 'GET', null, marina)).dados.respostas.map((x) => x.atalho).sort();
    assert.deepEqual(daMarina, ['reembolso', 'saudacao', 'todos'], 'ela vê as de todos, a saudação fixa e as da equipe dela, não a particular do admin');

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

test('respostas rápidas: migração une bom dia, boa tarde e boa noite em uma Saudação', async () => {
  const s = await subirServidor();
  try {
    await s.db.prepare("DELETE FROM respostas_rapidas WHERE atalho = 'saudacao'").run();
    const agora = Date.now();
    const inserir = s.db.prepare(`INSERT INTO respostas_rapidas
      (atalho, titulo, texto, escopo, equipe_id, usuario_id, criado_por, usos, criado_em, atualizado_em)
      VALUES (?, ?, ?, 'todas', NULL, NULL, NULL, ?, ?, ?)`);
    await inserir.run('bom-dia', 'Mensagem de bom dia', 'Bom dia', 4, agora, agora);
    await inserir.run('boa-tarde', 'Mensagem de boa tarde', 'Boa tarde', 2, agora, agora);
    await inserir.run('boa-noite', 'Mensagem de boa noite', 'Boa noite', 1, agora, agora);

    await migrar(s.db);
    await migrar(s.db);

    const respostas = (await s.db.prepare('SELECT atalho, titulo, texto, escopo, usos FROM respostas_rapidas ORDER BY id').all())
      .map((r) => ({ atalho: r.atalho, titulo: r.titulo, texto: r.texto, escopo: r.escopo, usos: Number(r.usos) }));
    assert.deepEqual(respostas, [{
      atalho: 'saudacao', titulo: 'Saudação', texto: 'A saudação muda automaticamente conforme o horário.', escopo: 'todas', usos: 7,
    }]);
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
