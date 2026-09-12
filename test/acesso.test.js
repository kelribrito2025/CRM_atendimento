'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco, semear } = require('../src/db');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const acesso = require('../src/acesso');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };

async function subirServidor(opcoes = {}) {
  const db = abrirBanco(':memory:');
  semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste' });
  const enviador = criarEnviador({ modo: 'silencioso' });
  const app = criarApp(db, { enviador, ...opcoes });
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return { db, servidor, base, enviador, fechar: () => new Promise((r) => servidor.close(r)) };
}

function json(body) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function cookieChamado(resposta, nome) {
  const lista = resposta.headers.getSetCookie ? resposta.headers.getSetCookie() : [resposta.headers.get('set-cookie') || ''];
  const achado = lista.find((c) => c.startsWith(`${nome}=`));
  return achado ? achado.split(';')[0] : null;
}

test('senha nova: regras de tamanho, maiúscula e número', () => {
  assert.deepEqual(acesso.validarSenhaNova('Abcdefghi1'), []);
  assert.deepEqual(acesso.validarSenhaNova('curta1A'), ['Pelo menos 10 caracteres']);
  assert.deepEqual(acesso.validarSenhaNova('semmaiuscula1'), ['Uma letra maiúscula e um número']);
  assert.equal(acesso.validarSenhaNova('abc').length, 2);
  assert.equal(acesso.mascararEmail('marina@empresa.com'), 'm•••@empresa.com');
});

test('páginas de acesso abrem sem login', async () => {
  const s = await subirServidor();
  try {
    for (const [rota, texto] of [['/login', 'Acesse sua conta'], ['/recuperar', 'Recuperar acesso'], ['/nova-senha', 'Definir nova senha'], ['/convite', 'Criar sua conta']]) {
      const r = await fetch(`${s.base}${rota}`);
      assert.equal(r.status, 200, rota);
      assert.match(await r.text(), new RegExp(texto), rota);
    }
    // sem verificação pendente, /verificar volta para o login
    const v = await fetch(`${s.base}/verificar`, { redirect: 'manual' });
    assert.equal(v.status, 302);
    assert.equal(v.headers.get('location'), '/login');
  } finally {
    await s.fechar();
  }
});

test('recuperar acesso: link por e-mail, nova senha e sessões antigas encerradas', async () => {
  const s = await subirServidor();
  try {
    // sessão antiga que deve cair depois da troca
    const loginAntigo = await fetch(`${s.base}/login`, json(ADMIN));
    const cookieAntigo = cookieChamado(loginAntigo, 'crm_sessao');

    const invalido = await fetch(`${s.base}/acesso/recuperar`, json({ email: 'nao-e-email' }));
    assert.equal(invalido.status, 400);

    const desconhecido = await fetch(`${s.base}/acesso/recuperar`, json({ email: 'ninguem@teste.com' }));
    assert.equal(desconhecido.status, 200); // resposta igual, sem revelar e-mails
    assert.equal(s.enviador.enviados.length, 0);

    const pedido = await fetch(`${s.base}/acesso/recuperar`, json({ email: ADMIN.email }));
    assert.equal(pedido.status, 200);
    assert.equal(s.enviador.enviados.length, 1);
    const link = s.enviador.enviados[0].texto.match(/https?:\/\/\S+/)[0];
    const token = new URL(link).searchParams.get('token');
    assert.ok(token);

    const info = await fetch(`${s.base}/acesso/redefinicao?token=${token}`);
    assert.equal(info.status, 200);
    assert.equal((await info.json()).email, ADMIN.email);

    const lixo = await fetch(`${s.base}/acesso/redefinicao?token=lixo`);
    assert.equal(lixo.status, 400);

    const fraca = await fetch(`${s.base}/acesso/nova-senha`, json({ token, senha: 'fraca', repetir: 'fraca' }));
    assert.equal(fraca.status, 400);
    const diferente = await fetch(`${s.base}/acesso/nova-senha`, json({ token, senha: 'NovaSenha123', repetir: 'Outra123456' }));
    assert.equal(diferente.status, 400);
    assert.match((await diferente.json()).erro, /não conferem/);

    const ok = await fetch(`${s.base}/acesso/nova-senha`, json({ token, senha: 'NovaSenha123', repetir: 'NovaSenha123' }));
    assert.equal(ok.status, 200);
    const cookieNovo = cookieChamado(ok, 'crm_sessao');
    assert.ok(cookieNovo);

    const meNovo = await fetch(`${s.base}/api/me`, { headers: { Cookie: cookieNovo } });
    assert.equal(meNovo.status, 200);
    const meAntigo = await fetch(`${s.base}/api/me`, { headers: { Cookie: cookieAntigo } });
    assert.equal(meAntigo.status, 401);

    const reuso = await fetch(`${s.base}/acesso/nova-senha`, json({ token, senha: 'NovaSenha123', repetir: 'NovaSenha123' }));
    assert.equal(reuso.status, 400);

    const loginVelho = await fetch(`${s.base}/login`, json(ADMIN));
    assert.equal(loginVelho.status, 401);
    const loginNovo = await fetch(`${s.base}/login`, json({ email: ADMIN.email, senha: 'NovaSenha123' }));
    assert.equal(loginNovo.status, 200);
  } finally {
    await s.fechar();
  }
});

test('convite: cria conta com papel e equipes do convite', async () => {
  const s = await subirServidor();
  try {
    const equipe = s.db.prepare("SELECT id FROM equipes WHERE nome = 'Cobrança'").get();
    const { token } = acesso.criarConvite(s.db, { email: 'nova@teste.com', papel: 'atendente', equipeIds: [equipe.id], criadoPor: 1 });

    const info = await fetch(`${s.base}/acesso/convite?token=${token}`);
    assert.equal(info.status, 200);
    const { convite } = await info.json();
    assert.equal(convite.email, 'nova@teste.com');
    assert.equal(convite.convidante, 'Admin Teste');
    assert.equal(convite.equipes[0].nome, 'Cobrança');

    const semAceite = await fetch(`${s.base}/acesso/convite`, json({ token, nome: 'Nova Pessoa', senha: 'SenhaForte12', aceito: false }));
    assert.equal(semAceite.status, 400);

    const criado = await fetch(`${s.base}/acesso/convite`, json({ token, nome: 'Nova Pessoa', senha: 'SenhaForte12', aceito: true }));
    assert.equal(criado.status, 201);
    const cookie = cookieChamado(criado, 'crm_sessao');
    const me = await (await fetch(`${s.base}/api/me`, { headers: { Cookie: cookie } })).json();
    assert.equal(me.usuario.email, 'nova@teste.com');
    assert.equal(me.usuario.nome, 'Nova Pessoa');

    const membro = s.db.prepare('SELECT 1 FROM equipe_membros WHERE equipe_id = ? AND usuario_id = ?').get(equipe.id, me.usuario.id);
    assert.ok(membro);

    const reuso = await fetch(`${s.base}/acesso/convite?token=${token}`);
    assert.equal(reuso.status, 400);
    assert.match((await reuso.json()).erro, /já foi usado/);

    const { token: expirado } = acesso.criarConvite(s.db, { email: 'tarde@teste.com', validadeMs: -1 });
    const exp = await fetch(`${s.base}/acesso/convite?token=${expirado}`);
    assert.equal(exp.status, 400);
    assert.match((await exp.json()).erro, /expirou/);
  } finally {
    await s.fechar();
  }
});

test('duas etapas: login pede código, rejeita errado e aceita o certo', async () => {
  const s = await subirServidor({ doisFatores: true });
  try {
    const login = await fetch(`${s.base}/login`, json(ADMIN));
    assert.equal(login.status, 200);
    const corpo = await login.json();
    assert.equal(corpo.verificacao, true);
    assert.equal(corpo.redirect, '/verificar');
    assert.equal(cookieChamado(login, 'crm_sessao'), null); // ainda não está logado
    const cookieVerif = cookieChamado(login, 'crm_verificacao');
    assert.ok(cookieVerif);

    const bloqueado = await fetch(`${s.base}/api/me`, { headers: { Cookie: cookieVerif } });
    assert.equal(bloqueado.status, 401);

    const pagina = await fetch(`${s.base}/verificar`, { headers: { Cookie: cookieVerif } });
    assert.equal(pagina.status, 200);

    const info = await (await fetch(`${s.base}/acesso/verificacao`, { headers: { Cookie: cookieVerif } })).json();
    assert.equal(info.email, 'a•••@teste.com');
    assert.equal(info.modoTeste, true);

    assert.equal(s.enviador.enviados.length, 1);
    const codigo = s.enviador.enviados[0].texto.match(/\b(\d{6})\b/)[1];

    const errado = await fetch(`${s.base}/acesso/verificar`, { ...json({ codigo: codigo === '000000' ? '111111' : '000000' }), headers: { 'Content-Type': 'application/json', Cookie: cookieVerif } });
    assert.equal(errado.status, 400);
    assert.match((await errado.json()).erro, /incorreto/);

    const cedo = await fetch(`${s.base}/acesso/verificar/reenviar`, { ...json({}), headers: { 'Content-Type': 'application/json', Cookie: cookieVerif } });
    assert.equal(cedo.status, 429);

    const certo = await fetch(`${s.base}/acesso/verificar`, { ...json({ codigo }), headers: { 'Content-Type': 'application/json', Cookie: cookieVerif } });
    assert.equal(certo.status, 200);
    const sessao = cookieChamado(certo, 'crm_sessao');
    assert.ok(sessao);
    const me = await fetch(`${s.base}/api/me`, { headers: { Cookie: sessao } });
    assert.equal(me.status, 200);

    // o mesmo código não serve duas vezes
    const denovo = await fetch(`${s.base}/acesso/verificar`, { ...json({ codigo }), headers: { 'Content-Type': 'application/json', Cookie: cookieVerif } });
    assert.equal(denovo.status, 401);
  } finally {
    await s.fechar();
  }
});
