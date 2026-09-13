'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco, semear } = require('../src/db');
const { criarApp } = require('../src/app');
const { gerarHashSenha, verificarSenha } = require('../src/senha');
const { LimitadorTentativas } = require('../src/limitador');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };

async function subirServidor(opcoes = {}) {
  const db = abrirBanco(':memory:');
  semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste' });
  const app = criarApp(db, opcoes);
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return { db, servidor, base, fechar: () => new Promise((r) => servidor.close(r)) };
}

async function logar(base, credenciais = ADMIN) {
  const resposta = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credenciais),
  });
  const cookie = (resposta.headers.get('set-cookie') || '').split(';')[0];
  return { resposta, cookie };
}

test('senha: gera hash e confere corretamente', () => {
  const hash = gerarHashSenha('minhaSenha!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(verificarSenha('minhaSenha!', hash), true);
  assert.equal(verificarSenha('outraSenha', hash), false);
  assert.equal(verificarSenha('minhaSenha!', 'lixo'), false);
  assert.throws(() => gerarHashSenha('123'), /6 caracteres/);
});

test('limitador: bloqueia após muitas falhas', () => {
  const l = new LimitadorTentativas({ maximo: 3, janelaMs: 60_000 });
  l.registrarFalha('x');
  l.registrarFalha('x');
  assert.equal(l.bloqueadoPor('x'), 0);
  l.registrarFalha('x');
  assert.ok(l.bloqueadoPor('x') > 0);
  l.limpar('x');
  assert.equal(l.bloqueadoPor('x'), 0);
});

test('login: rejeita senha errada e aceita a correta', async () => {
  const s = await subirServidor();
  try {
    const errado = await logar(s.base, { email: ADMIN.email, senha: 'errada' });
    assert.equal(errado.resposta.status, 401);
    assert.match((await errado.resposta.json()).erro, /inválidos/);

    const inexistente = await logar(s.base, { email: 'ninguem@teste.com', senha: 'qualquer' });
    assert.equal(inexistente.resposta.status, 401);

    const { resposta, cookie } = await logar(s.base);
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { ok: true, redirect: '/' });
    assert.match(cookie, /^crm_sessao=/);
    assert.match(resposta.headers.get('set-cookie'), /HttpOnly/);
  } finally {
    await s.fechar();
  }
});

test('login: bloqueia após várias tentativas erradas', async () => {
  const s = await subirServidor({ limitador: new LimitadorTentativas({ maximo: 3 }) });
  try {
    for (let i = 0; i < 3; i++) await logar(s.base, { email: ADMIN.email, senha: 'errada' });
    const { resposta } = await logar(s.base);
    assert.equal(resposta.status, 429);
  } finally {
    await s.fechar();
  }
});

test('proteção: páginas e API exigem login', async () => {
  const s = await subirServidor();
  try {
    const pagina = await fetch(`${s.base}/`, { redirect: 'manual' });
    assert.equal(pagina.status, 302);
    assert.equal(pagina.headers.get('location'), '/login');

    const api = await fetch(`${s.base}/api/resumo`);
    assert.equal(api.status, 401);

    const login = await fetch(`${s.base}/login`);
    assert.equal(login.status, 200);
    assert.match(await login.text(), /Acesse sua conta/);
  } finally {
    await s.fechar();
  }
});

test('fluxo: resumo, conversas, envio de mensagem, nota e logout', async () => {
  const s = await subirServidor();
  try {
    const { cookie } = await logar(s.base);
    const h = { Cookie: cookie, 'Content-Type': 'application/json' };

    const me = await (await fetch(`${s.base}/api/me`, { headers: h })).json();
    assert.equal(me.usuario.email, ADMIN.email);

    const resumo = await (await fetch(`${s.base}/api/resumo`, { headers: h })).json();
    assert.equal(resumo.caixas.todas, 18);
    assert.equal(resumo.caixas.minhas, 5);
    assert.equal(resumo.caixas.semResposta, 3);
    assert.equal(resumo.equipes.length, 4);
    assert.equal(resumo.equipes.find((e) => e.nome === 'Reembolso').abertas, 7);

    const lista = await (await fetch(`${s.base}/api/conversas?caixa=sem_resposta`, { headers: h })).json();
    assert.equal(lista.conversas.length, 3);
    assert.ok(lista.conversas.every((c) => c.semResposta));

    const busca = await (await fetch(`${s.base}/api/conversas?q=carla`, { headers: h })).json();
    assert.equal(busca.conversas.length, 1);
    const carla = busca.conversas[0];
    assert.equal(carla.protocolo, '4821');

    const detalhe = await (await fetch(`${s.base}/api/conversas/${carla.id}`, { headers: h })).json();
    assert.equal(detalhe.conversa.mensagens.length, 6);
    assert.equal(detalhe.conversa.contato.pin, '486213');

    // Envia uma resposta na conversa sem atendente: ela deve ser atribuída a quem respondeu
    const semResp = lista.conversas[0];
    const envio = await fetch(`${s.base}/api/conversas/${semResp.id}/mensagens`, {
      method: 'POST', headers: h, body: JSON.stringify({ texto: 'Olá! Já estou verificando.', tipo: 'resposta' }),
    });
    assert.equal(envio.status, 201);
    const enviado = await envio.json();
    assert.equal(enviado.mensagem.tipo, 'atendente');
    assert.equal(enviado.conversa.atendente.id, me.usuario.id);
    assert.equal(enviado.conversa.semResposta, false);

    // Nota interna
    const nota = await fetch(`${s.base}/api/conversas/${semResp.id}/mensagens`, {
      method: 'POST', headers: h, body: JSON.stringify({ texto: 'Cliente VIP', tipo: 'nota' }),
    });
    assert.equal((await nota.json()).mensagem.tipo, 'nota');

    // Validações
    const vazio = await fetch(`${s.base}/api/conversas/${semResp.id}/mensagens`, {
      method: 'POST', headers: h, body: JSON.stringify({ texto: '   ', tipo: 'resposta' }),
    });
    assert.equal(vazio.status, 400);
    const inexistente = await fetch(`${s.base}/api/conversas/99999`, { headers: h });
    assert.equal(inexistente.status, 404);

    // Reatribuição e status
    const equipe = resumo.equipes.find((e) => e.nome === 'Admin');
    const patch = await fetch(`${s.base}/api/conversas/${semResp.id}`, {
      method: 'PATCH', headers: h, body: JSON.stringify({ equipeId: equipe.id, atendenteId: null }),
    });
    const patched = await patch.json();
    assert.equal(patched.conversa.equipe.id, equipe.id);
    assert.equal(patched.conversa.atendente, null);

    const resolver = await fetch(`${s.base}/api/conversas/${semResp.id}/status`, {
      method: 'POST', headers: h, body: JSON.stringify({ status: 'resolvida' }),
    });
    assert.equal((await resolver.json()).conversa.status, 'resolvida');

    // PIN
    const pin = await fetch(`${s.base}/api/conversas/${semResp.id}/pin`, {
      method: 'POST', headers: h, body: JSON.stringify({ acao: 'novo' }),
    });
    const comPin = (await pin.json()).conversa.contato;
    assert.match(comPin.pin, /^\d{6}$/);
    assert.equal(comPin.pinValidadoEm, null);

    // Logout invalida a sessão
    const logout = await fetch(`${s.base}/logout`, { method: 'POST', headers: { ...h, Accept: 'application/json' } });
    assert.equal(logout.status, 200);
    const depois = await fetch(`${s.base}/api/me`, { headers: h });
    assert.equal(depois.status, 401);
  } finally {
    await s.fechar();
  }
});

test('segurança: redirecionamento pós-login não aceita URL externa', async () => {
  const s = await subirServidor();
  try {
    const resposta = await fetch(`${s.base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ADMIN, next: 'https://site-malicioso.com' }),
    });
    assert.equal((await resposta.json()).redirect, '/');
  } finally {
    await s.fechar();
  }
});
