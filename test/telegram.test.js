'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco, semear } = require('../src/db');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarTelegram, tokenValido } = require('../src/telegram');
const canais = require('../src/canais');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const TOKEN = '123456789:AAHfakeTokenFakeTokenFakeTokenFake12';

// Telegram de mentira, para testar sem internet.
function telegramFalso() {
  const chamadas = [];
  const ativos = new Set();
  return {
    chamadas,
    async validarToken(token) {
      chamadas.push(['getMe', token]);
      if (token !== TOKEN) { const e = new Error('Token do bot inválido ou revogado.'); e.status = 401; throw e; }
      return { id: '123456789', usuario: 'bigteck_bot', nome: 'Bigteck Atendimento' };
    },
    async removerWebhook(token) { chamadas.push(['deleteWebhook', token]); return true; },
    async enviarTexto(token, chatId, texto) { chamadas.push(['sendMessage', token, chatId, texto]); return { messageId: 77, chatId }; },
    sondagem: {
      iniciar(canal) { chamadas.push(['sondagem.iniciar', canal.id]); ativos.add(canal.id); },
      parar(id) { chamadas.push(['sondagem.parar', id]); ativos.delete(id); },
      ativo: (id) => ativos.has(id),
      pararTodas() { ativos.clear(); },
    },
  };
}

async function subirServidor() {
  const db = abrirBanco(':memory:');
  semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: true });
  const telegram = telegramFalso();
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), telegram });
  const servidor = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const h = { Cookie: cookie, 'Content-Type': 'application/json' };
  const chamar = async (caminho, metodo = 'GET', corpo) => {
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };
  return { db, base, telegram, chamar, fechar: () => new Promise((r) => servidor.close(r)) };
}

const update = (id, texto, extra = {}) => ({
  update_id: id,
  message: {
    message_id: id * 10, date: 1_700_000_000 + id,
    from: { id: 555, is_bot: false, first_name: 'João', last_name: 'Silva', username: 'joaosilva' },
    chat: { id: 555, type: 'private', first_name: 'João', last_name: 'Silva' },
    text: texto,
    ...extra,
  },
});

test('telegram: cliente monta a URL da Bot API e traduz erros', async () => {
  const pedidos = [];
  const fetchFalso = async (url, opts) => {
    pedidos.push({ url, corpo: JSON.parse(opts.body) });
    if (url.endsWith('/getMe')) return new Response(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }), { status: 401 });
    if (url.endsWith('/sendMessage')) return new Response(JSON.stringify({ ok: true, result: { message_id: 42, chat: { id: 555 } } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  const tg = criarTelegram({ fetchImpl: fetchFalso });
  assert.equal(tokenValido(TOKEN), true);
  assert.equal(tokenValido('abc'), false);
  await assert.rejects(() => tg.validarToken('abc'), /Token do bot inválido/);
  await assert.rejects(() => tg.validarToken(TOKEN), /inválido ou revogado/);
  assert.equal(pedidos[0].url, `https://api.telegram.org/bot${TOKEN}/getMe`);
  const enviado = await tg.enviarTexto(TOKEN, '555', 'Olá!');
  assert.deepEqual(enviado, { messageId: 42, chatId: 555 });
  assert.deepEqual(pedidos[1].corpo, { chat_id: '555', text: 'Olá!' });
});

test('telegram: a consulta contínua entrega as mensagens e para quando pedido', async () => {
  let chamadasGetUpdates = 0;
  const fetchFalso = (url, opts) => {
    if (!url.endsWith('/getUpdates')) return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    chamadasGetUpdates += 1;
    const corpo = JSON.parse(opts.body);
    if (chamadasGetUpdates === 1) {
      return new Response(JSON.stringify({ ok: true, result: [update(1, 'Oi'), update(2, 'Tudo bem?')] }), { status: 200 });
    }
    // segunda chamada: confirma o offset e fica "pendurada" até a sondagem ser parada
    assert.equal(corpo.offset, 3);
    return new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })));
    });
  };
  const tg = criarTelegram({ fetchImpl: fetchFalso, esperaSondagemS: 1 });
  const recebidas = [];
  const item = tg.sondagem.iniciar({ id: 9, instancia_token: TOKEN }, { aoReceber: (u) => recebidas.push(u.message.text) });
  const inicio = Date.now();
  while (recebidas.length < 2 && Date.now() - inicio < 3000) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(recebidas, ['Oi', 'Tudo bem?']);
  assert.equal(tg.sondagem.ativo(9), true);
  tg.sondagem.parar(9);
  await item.promessa;
  assert.equal(tg.sondagem.ativo(9), false);
});

test('telegram: conectar bot pelo token, receber mensagem e responder pelo CRM', async () => {
  const s = await subirServidor();
  try {
    // usuário comum não pode gerenciar canais
    const loginMarina = await fetch(`${s.base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'marina@bigteck.com.br', senha: ADMIN.senha }) });
    const cookieMarina = (loginMarina.headers.get('set-cookie') || '').split(';')[0];
    const negado = await fetch(`${s.base}/api/canais/telegram`, { method: 'POST', headers: { Cookie: cookieMarina, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: TOKEN }) });
    assert.equal(negado.status, 403);

    // token com formato errado e token recusado pelo Telegram
    const ruim = await s.chamar('/api/canais/telegram', 'POST', { token: 'abc' });
    assert.equal(ruim.status, 400);
    const recusado = await s.chamar('/api/canais/telegram', 'POST', { token: '123456789:BBBrecusadoRecusadoRecusadoRecusado' });
    assert.equal(recusado.status, 400);
    assert.match(recusado.dados.erro, /inválido/);

    // token válido: canal criado e já recebendo
    const criado = await s.chamar('/api/canais/telegram', 'POST', { token: TOKEN });
    assert.equal(criado.status, 201, JSON.stringify(criado.dados));
    const canal = criado.dados.canal;
    assert.equal(canal.tipo, 'telegram');
    assert.equal(canal.status, 'connected');
    assert.equal(canal.numeroFormatado, '@bigteck_bot');
    assert.equal(canal.nome, 'Bigteck Atendimento');
    assert.equal(canal.recebendo, true);
    assert.ok(s.telegram.chamadas.some((c) => c[0] === 'deleteWebhook'));
    assert.ok(s.telegram.chamadas.some((c) => c[0] === 'sondagem.iniciar' && c[1] === canal.id));
    const repetido = await s.chamar('/api/canais/telegram', 'POST', { token: TOKEN });
    assert.equal(repetido.status, 409);

    const resumo = await s.chamar('/api/resumo');
    const tg = resumo.dados.canais.find((c) => c.id === 'telegram');
    assert.equal(tg.conectado, true);
    assert.equal(tg.canais.length, 1);

    // mensagem do cliente chega pela consulta contínua
    const row = s.db.prepare('SELECT * FROM canais WHERE id = ?').get(canal.id);
    const r1 = canais.processarUpdateTelegram(s.db, row, update(1, 'Olá, preciso de ajuda com a fatura'));
    assert.equal(r1.resultado, 'mensagem');
    assert.equal(r1.nova, true);
    assert.equal(canais.processarUpdateTelegram(s.db, row, update(1, 'Olá, preciso de ajuda com a fatura')).motivo, 'duplicada');
    assert.equal(canais.processarUpdateTelegram(s.db, row, { update_id: 5, message: { message_id: 1, chat: { id: -100, type: 'group' }, text: 'oi' } }).motivo, 'grupo');
    assert.equal(canais.processarUpdateTelegram(s.db, row, { update_id: 6, edited_message: {} }).motivo, 'mensagem editada');
    const r2 = canais.processarUpdateTelegram(s.db, row, update(2, '', { photo: [{ file_id: 'x' }], caption: 'segue o boleto' }));
    assert.equal(r2.nova, false);
    const inicio = canais.processarUpdateTelegram(s.db, row, { update_id: 7, message: { message_id: 3, date: 1_700_000_100, from: { id: 777, first_name: 'Ana' }, chat: { id: 777, type: 'private' }, text: '/start' } });
    assert.equal(inicio.nova, true);

    const lista = await s.chamar('/api/conversas');
    const conversa = lista.dados.conversas.find((c) => c.contato.nome === 'João Silva');
    assert.ok(conversa, 'conversa do Telegram deveria aparecer na lista');
    assert.equal(conversa.canal, 'telegram');
    assert.equal(conversa.canalId, canal.id);
    assert.equal(conversa.contato.telegramUsuario, 'joaosilva');
    assert.equal(conversa.contato.telegramId, '555');
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    const textos = detalhe.dados.conversa.mensagens.map((m) => m.texto);
    assert.deepEqual(textos, ['Olá, preciso de ajuda com a fatura', '[Imagem] segue o boleto']);
    const conversaAna = lista.dados.conversas.find((c) => c.contato.nome === 'Ana');
    assert.ok(conversaAna);

    // resposta do atendente vai pelo bot
    const resposta = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Claro! Me passa o CNPJ?', tipo: 'resposta' });
    assert.equal(resposta.status, 201, JSON.stringify(resposta.dados));
    assert.equal(resposta.dados.erroEnvio, null);
    assert.equal(resposta.dados.mensagem.entrega, 'enviada');
    const envio = s.telegram.chamadas.find((c) => c[0] === 'sendMessage');
    assert.deepEqual(envio, ['sendMessage', TOKEN, '555', 'Claro! Me passa o CNPJ?']);
    assert.equal(s.db.prepare('SELECT externo_id FROM mensagens WHERE id = ?').get(resposta.dados.mensagem.id).externo_id, 'tg:555:77');

    // desconectar, reconectar e excluir
    const desc = await s.chamar(`/api/canais/${canal.id}/desconectar`, 'POST', {});
    assert.equal(desc.dados.canal.status, 'disconnected');
    assert.ok(s.telegram.chamadas.some((c) => c[0] === 'sondagem.parar' && c[1] === canal.id));
    const falhou = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Ainda aí?', tipo: 'resposta' });
    assert.equal(falhou.dados.erroEnvio, null, 'com o bot desconectado o envio ainda usa o token');
    const reconectado = await s.chamar(`/api/canais/${canal.id}/conectar`, 'POST', {});
    assert.equal(reconectado.dados.status, 'connected');
    const st = await s.chamar(`/api/canais/${canal.id}/status`);
    assert.equal(st.dados.status, 'connected');
    const eventos = await s.chamar(`/api/canais/${canal.id}/eventos`);
    assert.equal(eventos.status, 200);
    const del = await s.chamar(`/api/canais/${canal.id}`, 'DELETE');
    assert.equal(del.status, 200);
    assert.equal(s.telegram.sondagem.ativo(canal.id), false);
    assert.equal((await s.chamar('/api/canais')).dados.canais.length, 0);
    assert.equal((await s.chamar(`/api/conversas/${conversa.id}`)).dados.conversa.canalId, null);
  } finally {
    await s.fechar();
  }
});
