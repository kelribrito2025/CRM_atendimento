'use strict';

// "Abrir conta": pede um link de uso único ao site, dizendo quem abriu e por quê.

const test = require('node:test');
const assert = require('node:assert/strict');
const { semear, migrar, inserirUsuario } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarWidget, assinar } = require('../src/widget');
const { criarAbrirConta } = require('../src/abrir-conta');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const SEGREDO = 'segredo-do-site';

// Servidor do site de mentira: guarda o que recebeu e devolve o link.
function siteFalso({ resposta, status = 200 } = {}) {
  const pedidos = [];
  const fetchImpl = async (url, opcoes) => {
    pedidos.push({ url, cabecalhos: opcoes.headers, corpo: JSON.parse(opcoes.body) });
    const corpo = resposta ?? { url: 'https://app.numero-virtual.com/impersonar/tok-unico', expiraEm: '2026-09-13T18:02:11Z' };
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { pedidos, fetchImpl };
}

async function subirServidor({ site = siteFalso(), token = 'chave-do-agente' } = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Carla Menezes', comDadosExemplo: false });
  const widget = criarWidget(db, { segredo: SEGREDO });
  const abrirConta = criarAbrirConta({ url: 'https://site.exemplo/api/agents/impersonar', token, fetchImpl: site.fetchImpl });
  const app = criarApp(db, { widget, abrirConta, enviador: criarEnviador({ modo: 'silencioso' }) });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const chamar = async (caminho, metodo = 'GET', corpo) => {
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  // um cliente que chegou pelo chat do site
  const sessao = await fetch(`${base}/widget/sessao`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '4380402', nome: 'Andressa Lima', pin: '11535', assinatura: assinar(SEGREDO, '4380402') }),
  }).then((r) => r.json());
  await fetch(`${base}/widget/mensagens`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-token': sessao.token },
    body: JSON.stringify({ texto: 'Meu saldo não bate' }),
  });
  // A conversa nasce na primeira mensagem, não no login do cliente.
  const conversa = await db.prepare("SELECT id FROM conversas WHERE canal = 'widget' ORDER BY id DESC LIMIT 1").get();

  return { db, base, site, chamar, conversaId: Number(conversa.id), fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('abrir conta: manda quem abriu e o motivo, e devolve o link de uso único', async () => {
  const s = await subirServidor();
  try {
    const r = await s.chamar(`/api/conversas/${s.conversaId}/abrir-conta`, 'POST');
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.url, 'https://app.numero-virtual.com/impersonar/tok-unico');

    const pedido = s.site.pedidos.at(-1);
    assert.equal(pedido.cabecalhos.Authorization, 'Bearer chave-do-agente');
    assert.equal(pedido.corpo.clienteId, '4380402');
    // o atendente não digita nada: o motivo é a conversa em que ele está
    assert.match(pedido.corpo.motivo, /^Atendimento da conversa #\S+ \(widget\)$/);
    assert.equal(pedido.corpo.atendente.nome, 'Carla Menezes', 'quem abriu vem da sessão do CRM');
    assert.equal(pedido.corpo.atendente.email, ADMIN.email);
    assert.ok(pedido.corpo.atendente.id);

    // Fica na auditoria administrativa, não misturado às notas da conversa.
    const conversa = (await s.chamar(`/api/conversas/${s.conversaId}`)).dados.conversa;
    assert.equal(conversa.mensagens.some((m) => m.tipo === 'nota'), false);
    const auditoria = await s.chamar('/api/auditoria');
    assert.equal(auditoria.status, 200);
    assert.equal(auditoria.dados.eventos.length, 1);
    assert.deepEqual(auditoria.dados.eventos[0], {
      id: auditoria.dados.eventos[0].id,
      acao: 'abrir_conta',
      descricao: 'Abriu a conta do cliente no site.',
      usuario: { id: auditoria.dados.eventos[0].usuario.id, nome: 'Carla Menezes', email: ADMIN.email },
      conta: { id: auditoria.dados.eventos[0].conta.id, email: ADMIN.email },
      conversa: { id: s.conversaId, protocolo: conversa.protocolo, canal: 'widget' },
      contato: { id: conversa.contato.id, nome: 'Andressa Lima' },
      criadoEm: auditoria.dados.eventos[0].criadoEm,
    });
  } finally { await s.fechar(); }
});

test('abrir conta: notas antigas viram auditoria uma só vez e somem da conversa', async () => {
  const s = await subirServidor();
  try {
    const admin = await s.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(ADMIN.email);
    const antigoId = Number((await s.db.prepare(`INSERT INTO mensagens
      (conversa_id, tipo, autor_id, texto, entrega, criada_em) VALUES (?, 'nota', ?, ?, NULL, ?)`)
      .run(s.conversaId, admin.id, 'Abriu a conta do cliente no site.', 123456789)).lastInsertRowid);

    await migrar(s.db);
    await migrar(s.db);

    assert.equal(Number((await s.db.prepare('SELECT COUNT(*) AS n FROM auditoria_eventos WHERE origem_mensagem_id = ?').get(antigoId)).n), 1);
    assert.equal(Number((await s.db.prepare('SELECT COUNT(*) AS n FROM mensagens WHERE id = ?').get(antigoId)).n), 0);
    const evento = await s.db.prepare('SELECT usuario_nome, usuario_email, protocolo, canal, contato_nome, criado_em FROM auditoria_eventos WHERE origem_mensagem_id = ?').get(antigoId);
    assert.deepEqual({ ...evento }, {
      usuario_nome: 'Carla Menezes', usuario_email: ADMIN.email,
      protocolo: (await s.db.prepare('SELECT protocolo FROM conversas WHERE id = ?').get(s.conversaId)).protocolo,
      canal: 'widget', contato_nome: 'Andressa Lima', criado_em: 123456789,
    });
  } finally { await s.fechar(); }
});

test('auditoria: atendente não pode consultar o histórico da equipe', async () => {
  const s = await subirServidor();
  try {
    await inserirUsuario(s.db, { nome: 'Atendente Teste', email: 'atendente@teste.com', senha: 'segredo123' });
    const login = await fetch(`${s.base}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'atendente@teste.com', senha: 'segredo123' }),
    });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    assert.equal((await fetch(`${s.base}/api/auditoria`, { headers: { Cookie: cookie } })).status, 403);
  } finally { await s.fechar(); }
});

test('abrir conta: o navegador não escolhe quem está abrindo', async () => {
  const s = await subirServidor();
  try {
    await s.chamar(`/api/conversas/${s.conversaId}/abrir-conta`, 'POST', {
      motivo: 'motivo inventado pelo navegador',
      atendente: { id: '999', nome: 'Outra Pessoa', email: 'outra@teste.com' },
      clienteId: '111',
    });
    const pedido = s.site.pedidos.at(-1);
    assert.equal(pedido.corpo.atendente.nome, 'Carla Menezes', 'ignora o que veio do navegador');
    assert.equal(pedido.corpo.clienteId, '4380402', 'o cliente é o da conversa, não o que o navegador mandou');
    assert.match(pedido.corpo.motivo, /^Atendimento da conversa/, 'o motivo é montado pelo servidor');
  } finally { await s.fechar(); }
});

test('abrir conta: cliente que não veio do site não tem conta para abrir', async () => {
  const s = await subirServidor();
  try {
    // cliente que não veio do site
    const agora = Date.now();
    await s.db.prepare("INSERT INTO contatos (nome, telefone) VALUES ('Bruno WhatsApp', '+5531988887777')").run();
    const ct = await s.db.prepare('SELECT id FROM contatos ORDER BY id DESC LIMIT 1').get();
    await s.db.prepare("INSERT INTO conversas (protocolo, contato_id, canal, status, nao_lidas, criada_em, atualizada_em) VALUES ('#5099', ?, 'whatsapp', 'aberta', 0, ?, ?)").run(ct.id, agora, agora);
    const cv = await s.db.prepare('SELECT id FROM conversas ORDER BY id DESC LIMIT 1').get();
    const semSite = await s.chamar(`/api/conversas/${cv.id}/abrir-conta`, 'POST');
    assert.equal(semSite.status, 400);
    assert.match(semSite.dados.erro, /chat do site/);
  } finally { await s.fechar(); }
});

test('abrir conta: recados claros quando o site recusa', async () => {
  for (const [status, trecho] of [[401, /chave de acesso/i], [403, /chave de acesso/i], [404, /não existe mais/i], [500, /respondeu com erro/i]]) {
    const s = await subirServidor({ site: siteFalso({ status, resposta: { erro: 'nao' } }) });
    try {
      const r = await s.chamar(`/api/conversas/${s.conversaId}/abrir-conta`, 'POST');
      assert.equal(r.status === 200, false, `status ${status} não pode virar sucesso`);
      assert.match(r.dados.erro, trecho);
    } finally { await s.fechar(); }
  }
});

test('abrir conta: sem chave configurada, o botão nem aparece', async () => {
  const s = await subirServidor({ token: '' });
  try {
    assert.equal((await s.chamar('/api/resumo')).dados.abrirContaAtivo, false);
    const r = await s.chamar(`/api/conversas/${s.conversaId}/abrir-conta`, 'POST');
    assert.equal(r.status, 400);
    assert.match(r.dados.erro, /não está configurado/i);
  } finally { await s.fechar(); }
});
