'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { abrirBanco, semear } = require('../src/db');
const { criarSessao } = require('../src/sessoes');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { chaveDeLimite } = require('../src/rotas-api');
const { criarEnviador } = require('../src/email');
const { gerarHashSenha } = require('../src/senha');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };

test('perfis: limites antiabuso pertencem à conta, não ao perfil selecionado', () => {
  const conta = { id: 7 };
  assert.equal(chaveDeLimite('saldo', { conta, usuario: { id: 31 } }), 'saldo:7');
  assert.equal(chaveDeLimite('saldo', { conta, usuario: { id: 32 } }), 'saldo:7');
  assert.equal(chaveDeLimite('acao-saldo', { conta, usuario: { id: 32 } }), 'acao-saldo:7');
});

async function subirServidor(opcoes = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Conta da Equipe', comDadosExemplo: true });
  await db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, pode_logar, criado_em)
    VALUES (?, ?, ?, 'atendente', 1, 1, ?)`).run('Outra Conta', 'outra@teste.com', gerarHashSenha('outrasenha123'), Date.now());
  const app = criarApp(db, {
    paginasDir: path.join(__dirname, '..', 'client'),
    enviador: criarEnviador({ modo: 'silencioso' }),
    cadastroAtendenteAtivo: true,
    ...opcoes,
  });
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, () => resolve(instancia));
  });
  return {
    db,
    base: `http://127.0.0.1:${servidor.address().port}`,
    fechar: async () => { await new Promise((resolve) => servidor.close(resolve)); await db.fechar(); },
  };
}

async function entrar(base) {
  const resposta = await fetch(`${base}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN),
  });
  return {
    resposta,
    dados: await resposta.json(),
    cookie: (resposta.headers.get('set-cookie') || '').split(';')[0],
  };
}

async function json(base, caminho, cookie, metodo = 'GET', corpo) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    redirect: 'manual',
  });
  return { resposta, dados: await resposta.json().catch(() => ({})) };
}

test('perfis: cadastro fica bloqueado por padrão sem afetar os perfis existentes', async () => {
  const s = await subirServidor({ cadastroAtendenteAtivo: false });
  try {
    const login = await entrar(s.base);
    const resumo = await json(s.base, '/api/resumo', login.cookie);
    assert.equal(resumo.dados.cadastroAtendenteAtivo, false);

    const criado = await json(s.base, '/api/equipe/usuarios', login.cookie, 'POST', { nome: 'Novo atendente' });
    assert.equal(criado.resposta.status, 403);
    assert.match(criado.dados.erro, /temporariamente bloqueado/);

    const perfis = await s.db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE pode_logar = 0').get();
    assert.equal(Number(perfis.n), 0);
  } finally { await s.fechar(); }
});

test('perfis: admin adiciona atendente sem criar nova senha ou conta de login', async () => {
  const s = await subirServidor();
  try {
    const login = await entrar(s.base);
    assert.equal(login.dados.redirect, '/', 'outras contas com senha não forçam a escolha');
    const equipe = await json(s.base, '/api/equipe', login.cookie);
    const equipeId = equipe.dados.equipes[0].id;

    const criado = await json(s.base, '/api/equipe/usuarios', login.cookie, 'POST', {
      nome: '  Raissa   Oliveira  ', equipeIds: [equipeId],
    });
    assert.equal(criado.resposta.status, 201, JSON.stringify(criado.dados));
    assert.equal(criado.dados.usuario.nome, 'Raissa Oliveira');
    assert.equal(criado.dados.usuario.email, null);
    assert.equal(criado.dados.usuario.podeLogar, false);
    assert.deepEqual(criado.dados.usuario.equipes.map((e) => e.id), [equipeId]);

    const papelSeparado = await json(s.base, `/api/equipe/usuarios/${criado.dados.usuario.id}`, login.cookie, 'PATCH', { papel: 'admin' });
    assert.equal(papelSeparado.resposta.status, 400);
    assert.match(papelSeparado.dados.erro, /permissões da conta/);

    const banco = await s.db.prepare('SELECT email, senha_hash, pode_logar FROM usuarios WHERE id = ?').get(criado.dados.usuario.id);
    assert.equal(Number(banco.pode_logar), 0);
    assert.match(banco.email, /^perfil-[a-f0-9-]+@atendimento\.local$/);
    assert.match(banco.senha_hash, /^scrypt\$/);

    const tentativa = await fetch(`${s.base}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: banco.email, senha: 'qualquer-senha' }),
    });
    assert.equal(tentativa.status, 401, 'perfil interno jamais autentica diretamente');
  } finally { await s.fechar(); }
});

test('perfis: próximo login exige escolha e toda autoria usa o atendente selecionado', async () => {
  const s = await subirServidor();
  try {
    const primeiro = await entrar(s.base);
    const criado = await json(s.base, '/api/equipe/usuarios', primeiro.cookie, 'POST', { nome: 'Raissa Oliveira' });
    const perfilId = criado.dados.usuario.id;

    const novoLogin = await entrar(s.base);
    assert.equal(novoLogin.dados.redirect, '/escolher-atendente?next=%2F');

    const bloqueado = await json(s.base, '/api/resumo', novoLogin.cookie);
    assert.equal(bloqueado.resposta.status, 409);
    assert.equal(bloqueado.dados.escolherAtendente, true);

    const pagina = await fetch(`${s.base}/escolher-atendente`, { headers: { Cookie: novoLogin.cookie } });
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /Escolha seu atendente/);

    const opcoes = await json(s.base, '/acesso/atendentes', novoLogin.cookie);
    assert.deepEqual(opcoes.dados.atendentes.map((a) => a.nome).sort(), ['Conta da Equipe', 'Raissa Oliveira']);
    assert.ok(!opcoes.dados.atendentes.some((a) => a.nome === 'Outra Conta'), 'outra conta com senha não pode ser personificada');

    const outraConta = await s.db.prepare("SELECT id FROM usuarios WHERE email = 'outra@teste.com'").get();
    const outraContaRecusada = await json(s.base, '/acesso/atendente', novoLogin.cookie, 'POST', { atendenteId: outraConta.id });
    assert.equal(outraContaRecusada.resposta.status, 400);

    const invalido = await json(s.base, '/acesso/atendente', novoLogin.cookie, 'POST', { atendenteId: 999999 });
    assert.equal(invalido.resposta.status, 400);

    const escolhido = await json(s.base, '/acesso/atendente', novoLogin.cookie, 'POST', { atendenteId: perfilId, next: '/' });
    assert.equal(escolhido.resposta.status, 200);
    assert.equal(escolhido.dados.redirect, '/');

    const me = await json(s.base, '/api/me', novoLogin.cookie);
    assert.equal(me.dados.usuario.id, perfilId);
    assert.equal(me.dados.usuario.nome, 'Raissa Oliveira');
    assert.equal(me.dados.usuario.email, null);
    assert.equal(me.dados.conta.email, ADMIN.email);
    assert.equal(me.dados.conta.papel, 'admin');

    const lista = await json(s.base, '/api/conversas?caixa=sem_resposta', novoLogin.cookie);
    const conversa = lista.dados.conversas[0];
    const nota = await json(s.base, `/api/conversas/${conversa.id}/mensagens`, novoLogin.cookie, 'POST', {
      texto: 'Nota do perfil escolhido', tipo: 'nota',
    });
    assert.equal(nota.resposta.status, 201, JSON.stringify(nota.dados));
    assert.equal(nota.dados.mensagem.autor.id, perfilId);
    assert.equal(nota.dados.mensagem.autor.nome, 'Raissa Oliveira');
  } finally { await s.fechar(); }
});

test('perfis: ação externa identifica o perfil e a auditoria separa a conta autenticada', async () => {
  let recebido;
  const saldo = {
    configurado: true,
    async creditar(dados) {
      recebido = dados;
      return { valor: 'R$ 1,00' };
    },
  };
  const s = await subirServidor({ saldo });
  try {
    const primeiro = await entrar(s.base);
    const criado = await json(s.base, '/api/equipe/usuarios', primeiro.cookie, 'POST', { nome: 'Graziele' });
    const perfilId = criado.dados.usuario.id;
    const novoLogin = await entrar(s.base);
    await json(s.base, '/acesso/atendente', novoLogin.cookie, 'POST', { atendenteId: perfilId });
    const lista = await json(s.base, '/api/conversas?caixa=sem_resposta', novoLogin.cookie);
    const conversa = lista.dados.conversas[0];
    const acao = await json(s.base, `/api/conversas/${conversa.id}/saldo/creditar`, novoLogin.cookie, 'POST', {
      pin: '12345', valorCents: 100, motivo: 'Teste seguro', chaveIdempotencia: 'perfil-conta-auditoria-1',
    });
    assert.equal(acao.resposta.status, 200, JSON.stringify(acao.dados));
    assert.deepEqual(recebido.atendente, { id: perfilId, nome: 'Graziele', email: ADMIN.email });

    const evento = await s.db.prepare("SELECT usuario_id, usuario_nome, usuario_email, conta_id, conta_email FROM auditoria_eventos WHERE acao = 'saldo_creditar'").get();
    const conta = await s.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(ADMIN.email);
    assert.equal(Number(evento.usuario_id), perfilId);
    assert.equal(evento.usuario_nome, 'Graziele');
    assert.equal(evento.usuario_email, null);
    assert.equal(Number(evento.conta_id), Number(conta.id));
    assert.equal(evento.conta_email, ADMIN.email);
  } finally { await s.fechar(); }
});

test('perfis: sem perfis internos o login continua entrando direto', async () => {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Conta da Equipe', comDadosExemplo: false });
  const app = criarApp(db, { paginasDir: path.join(__dirname, '..', 'client'), enviador: criarEnviador({ modo: 'silencioso' }) });
  const servidor = await new Promise((resolve) => { const instancia = app.listen(0, () => resolve(instancia)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const login = await entrar(base);
    assert.equal(login.dados.redirect, '/');
    assert.equal((await json(base, '/api/resumo', login.cookie)).resposta.status, 200);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
    await db.fechar();
  }
});

test('perfis: reiniciar o banco não preenche uma escolha que ainda está pendente', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-perfis-'));
  const arquivo = path.join(pasta, 'crm.sqlite');
  let db = await abrirBanco(arquivo);
  try {
    await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Conta da Equipe', comDadosExemplo: false });
    const conta = await db.prepare('SELECT id FROM usuarios WHERE email = ?').get(ADMIN.email);
    await db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, pode_logar, criado_em)
      VALUES ('Raissa', 'perfil-reinicio@atendimento.local', 'sem-login', 'atendente', 1, 0, ?)`).run(Date.now());
    const sessao = await criarSessao(db, conta.id, false);
    assert.equal(sessao.precisaEscolher, true);
    assert.equal((await db.prepare('SELECT atendente_id FROM sessoes').get()).atendente_id, null);
    await db.fechar();

    db = await abrirBanco(arquivo);
    assert.equal((await db.prepare('SELECT atendente_id FROM sessoes').get()).atendente_id, null);
    const colunasAuditoria = await db.colunas('auditoria_eventos');
    assert.ok(colunasAuditoria.includes('conta_id'));
    assert.ok(colunasAuditoria.includes('conta_email'));
  } finally {
    await db.fechar().catch(() => {});
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
