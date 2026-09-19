'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { gerarHashSenha } = require('../src/senha');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const SENHA_PADRAO = '37590064@2908';

async function subirServidor(opcoes = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Conta da Equipe', comDadosExemplo: false });
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), cadastroAtendenteAtivo: true, ...opcoes });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const entrar = async (email, senha) => {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };
  const cookie = await entrar(ADMIN.email, ADMIN.senha);
  const chamar = async (caminho, metodo = 'GET', corpo, ck = cookie) => {
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };
  // Perfis internos criados pelo administrador; um deles vira "Administrador".
  const perfil = async (nome, papel = 'atendente') => {
    const criado = await chamar('/api/equipe/usuarios', 'POST', { nome, equipeIds: [] });
    assert.equal(criado.status, 201, JSON.stringify(criado.dados));
    if (papel === 'admin') assert.equal((await chamar(`/api/equipe/usuarios/${criado.dados.usuario.id}`, 'PATCH', { papel: 'admin' })).status, 200);
    return criado.dados.usuario.id;
  };
  return { db, base, cookie, entrar, chamar, perfil, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('perfil administrador: escolher pede a senha do administrador; os outros perfis não', async () => {
  const s = await subirServidor();
  try {
    const adminId = await s.perfil('Administrador', 'admin');
    const grazieleId = await s.perfil('Graziele');

    const lista = await s.chamar('/acesso/atendentes');
    const porId = Object.fromEntries(lista.dados.atendentes.map((a) => [a.id, a]));
    assert.equal(porId[adminId].pedeSenha, true);
    assert.equal(porId[grazieleId].pedeSenha, false);

    const semSenha = await s.chamar('/acesso/atendente', 'POST', { atendenteId: adminId });
    assert.equal(semSenha.status, 401);
    assert.equal(semSenha.dados.pedeSenha, true);
    const errada = await s.chamar('/acesso/atendente', 'POST', { atendenteId: adminId, senha: 'errada' });
    assert.equal(errada.status, 401);
    assert.match(errada.dados.erro, /incorreta/);
    assert.notEqual((await s.chamar('/api/me')).dados.usuario.id, adminId, 'nada escolhido ainda');

    const certa = await s.chamar('/acesso/atendente', 'POST', { atendenteId: adminId, senha: SENHA_PADRAO });
    assert.equal(certa.status, 200, JSON.stringify(certa.dados));
    assert.equal((await s.chamar('/api/me')).dados.usuario.id, adminId);

    const normal = await s.chamar('/acesso/atendente', 'POST', { atendenteId: grazieleId });
    assert.equal(normal.status, 200, 'perfil comum entra sem senha');
    assert.equal((await s.chamar('/api/me')).dados.usuario.id, grazieleId);
  } finally { await s.fechar(); }
});

test('perfil administrador: senha configurada no servidor substitui a padrão e tentativas seguidas bloqueiam', async () => {
  const s = await subirServidor({ senhaPerfilAdmin: 'minha-senha-propria' });
  try {
    const adminId = await s.perfil('Administrador', 'admin');
    assert.equal((await s.chamar('/acesso/atendente', 'POST', { atendenteId: adminId, senha: SENHA_PADRAO })).status, 401, 'a padrão deixa de valer');
    assert.equal((await s.chamar('/acesso/atendente', 'POST', { atendenteId: adminId, senha: 'minha-senha-propria' })).status, 200);

    for (let i = 0; i < 5; i += 1) await s.chamar('/acesso/atendente', 'POST', { atendenteId: adminId, senha: 'x' });
    const bloqueado = await s.chamar('/acesso/atendente', 'POST', { atendenteId: adminId, senha: 'minha-senha-propria' });
    assert.equal(bloqueado.status, 429, 'depois de 5 erros seguidos, espera');
  } finally { await s.fechar(); }
});

test('excluir atendente: só administrador; some das listas, encerra o acesso e libera o e-mail, mas a linha fica para o histórico', async () => {
  const s = await subirServidor();
  try {
    const equipes = (await s.chamar('/api/equipe')).dados.equipes;
    const perfilId = await s.perfil('Kelly');
    assert.equal((await s.chamar(`/api/equipe/usuarios/${perfilId}`, 'PATCH', { equipeIds: [equipes[0].id] })).status, 200);
    await s.db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
      .run('Bruno Alves', 'bruno@teste.com', gerarHashSenha('outrasenha123'), 'atendente', Date.now());
    const brunoId = (await s.db.prepare('SELECT id FROM usuarios WHERE email = ?').get('bruno@teste.com')).id;
    const bruno = await s.entrar('bruno@teste.com', 'outrasenha123');
    assert.equal((await s.chamar('/acesso/atendente', 'POST', { atendenteId: brunoId }, bruno)).status, 200, 'Bruno escolhe a si mesmo');
    assert.equal((await s.chamar(`/api/equipe/usuarios/${perfilId}`, 'DELETE', null, bruno)).status, 403, 'atendente comum não exclui');

    const excluido = await s.chamar(`/api/equipe/usuarios/${perfilId}`, 'DELETE');
    assert.equal(excluido.status, 200, JSON.stringify(excluido.dados));
    assert.ok(!(await s.chamar('/api/equipe')).dados.usuarios.some((u) => u.id === perfilId), 'sai de Configurações › Equipe');
    assert.ok(!(await s.chamar('/acesso/atendentes')).dados.atendentes.some((a) => a.id === perfilId), 'sai de Escolha seu atendente');
    assert.ok(!(await s.chamar('/api/resumo')).dados.atendentes.some((a) => a.id === perfilId), 'sai da barra lateral');
    const linha = await s.db.prepare('SELECT nome, ativo, pode_logar, presenca FROM usuarios WHERE id = ?').get(perfilId);
    assert.deepEqual({ nome: linha.nome, ativo: Number(linha.ativo), presenca: linha.presenca }, { nome: 'Kelly', ativo: 0, presenca: 'excluido' });
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM equipe_membros WHERE usuario_id = ?').get(perfilId)).n, 0);
    assert.equal((await s.chamar(`/api/equipe/usuarios/${perfilId}`, 'DELETE')).status, 404, 'excluir de novo não acha');
    assert.equal((await s.chamar(`/api/equipe/usuarios/${perfilId}`, 'PATCH', { nome: 'Outro' })).status, 404);

    // conta com login: sessão encerrada e e-mail liberado para um novo convite
    assert.equal((await s.chamar(`/api/equipe/usuarios/${brunoId}`, 'DELETE')).status, 200);
    assert.equal((await s.chamar('/api/me', 'GET', null, bruno)).status, 401, 'a sessão do excluído acaba');
    assert.equal(await s.entrar('bruno@teste.com', 'outrasenha123'), '', 'não entra mais');
    assert.notEqual((await s.db.prepare('SELECT email FROM usuarios WHERE id = ?').get(brunoId)).email, 'bruno@teste.com');

    // a própria conta e o último administrador ficam protegidos
    const eu = (await s.chamar('/api/me')).dados.conta.id;
    assert.equal((await s.chamar(`/api/equipe/usuarios/${eu}`, 'DELETE')).status, 400);
    assert.equal((await s.chamar('/api/equipe/usuarios/999999', 'DELETE')).status, 404);
  } finally { await s.fechar(); }
});
