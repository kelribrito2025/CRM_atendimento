'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
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
    async obterFotoPerfil(token, usuarioId) {
      chamadas.push(['getUserProfilePhotos', token, usuarioId]);
      return Number(usuarioId) === 555 ? 'foto-perfil-555' : null;
    },
    async baixarArquivo(token, fileId) {
      chamadas.push(['baixarArquivo', token, fileId]);
      if (fileId === 'foto-perfil-555') return { bytes: Buffer.from('foto-do-perfil'), tipo: 'image/jpeg', caminho: 'photos/perfil.jpg' };
      if (fileId !== 'foto-123') { const e = new Error('O arquivo não está mais disponível no Telegram.'); e.status = 404; throw e; }
      return { bytes: Buffer.from('imagem-falsa'), tipo: 'image/jpeg', caminho: 'photos/file_1.jpg' };
    },
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
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: true });
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
  return { db, base, telegram, chamar, cookie, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
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

test('telegram: foto do perfil do cliente aparece no avatar', async () => {
  const s = await subirServidor();
  try {
    const criado = await s.chamar('/api/canais/telegram', 'POST', { token: TOKEN });
    const canal = await s.db.prepare('SELECT * FROM canais WHERE id = ?').get(criado.dados.canal.id);
    await canais.processarUpdateTelegram(s.db, canal, update(1, 'oi'));
    await canais.atualizarFotoTelegram(s.db, s.telegram, canal, 555);

    const conversa = (await s.chamar('/api/conversas')).dados.conversas.find((c) => c.contato.nome === 'João Silva');
    assert.equal(conversa.contato.foto, `/api/contatos/${conversa.contato.id}/foto`);
    const foto = await fetch(`${s.base}${conversa.contato.foto}`, { headers: { Cookie: s.cookie } });
    assert.equal(foto.status, 200);
    assert.equal(foto.headers.get('content-type'), 'image/jpeg');
    assert.equal(await foto.text(), 'foto-do-perfil');
    assert.equal((await fetch(`${s.base}${conversa.contato.foto}`)).status, 401, 'a foto só aparece para quem está logado');

    // sem foto no Telegram, o CRM não fica pedindo toda hora
    await canais.processarUpdateTelegram(s.db, canal, { update_id: 9, message: { message_id: 9, date: 1_700_000_500, from: { id: 777, first_name: 'Ana' }, chat: { id: 777, type: 'private' }, text: 'oi' } });
    await canais.atualizarFotoTelegram(s.db, s.telegram, canal, 777);
    const semFoto = await s.db.prepare("SELECT tg_foto_id, tg_foto_em FROM contatos WHERE tg_id = '777'").get();
    assert.equal(semFoto.tg_foto_id, null);
    assert.ok(semFoto.tg_foto_em, 'guarda quando tentou, para não repetir a consulta');
    const antes = s.telegram.chamadas.filter((c) => c[0] === 'getUserProfilePhotos').length;
    await canais.atualizarFotoTelegram(s.db, s.telegram, canal, 777);
    assert.equal(s.telegram.chamadas.filter((c) => c[0] === 'getUserProfilePhotos').length, antes, 'não consulta de novo no mesmo dia');
  } finally {
    await s.fechar();
  }
});

test('telegram: PIN que chega na conversa preenche o card do cliente', async () => {
  const s = await subirServidor();
  try {
    const criado = await s.chamar('/api/canais/telegram', 'POST', { token: TOKEN });
    const canal = await s.db.prepare('SELECT * FROM canais WHERE id = ?').get(criado.dados.canal.id);
    const de = { id: 900, is_bot: false, first_name: 'Pedro' };
    const chat = { id: 900, type: 'private' };

    // link de início com o PIN: /start 5446
    await canais.processarUpdateTelegram(s.db, canal, { update_id: 1, message: { message_id: 1, date: 1_700_000_000, from: de, chat, text: '/start 5446' } });
    let contato = await s.db.prepare('SELECT * FROM contatos WHERE tg_id = ?').get('900');
    assert.equal(contato.pin, '5446', 'o PIN do link de início deveria preencher o card');
    const conversa = (await s.chamar('/api/conversas')).dados.conversas.find((c) => c.contato.nome === 'Pedro');
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.contato.pin, '5446');
    assert.equal(detalhe.dados.conversa.contato.pinValidadoEm, null, 'o PIN ainda precisa ser conferido');
    assert.match(detalhe.dados.conversa.mensagens[0].texto, /PIN 5446/);

    // mensagem com só o número também preenche
    const outro = { id: 901, is_bot: false, first_name: 'Ana' };
    await canais.processarUpdateTelegram(s.db, canal, { update_id: 2, message: { message_id: 2, date: 1_700_000_100, from: outro, chat: { id: 901, type: 'private' }, text: '486213' } });
    assert.equal((await s.db.prepare('SELECT pin FROM contatos WHERE tg_id = ?').get('901')).pin, '486213');

    // texto comum não é confundido com PIN
    await canais.processarUpdateTelegram(s.db, canal, { update_id: 3, message: { message_id: 3, date: 1_700_000_200, from: { id: 902, is_bot: false, first_name: 'Rui' }, chat: { id: 902, type: 'private' }, text: 'bom dia' } });
    assert.equal((await s.db.prepare('SELECT pin FROM contatos WHERE tg_id = ?').get('902')).pin, null);

    // PIN já conferido não é trocado por uma mensagem nova
    await s.db.prepare('UPDATE contatos SET pin_validado_em = ? WHERE tg_id = ?').run(Date.now(), '900');
    await canais.processarUpdateTelegram(s.db, canal, { update_id: 4, message: { message_id: 4, date: 1_700_000_300, from: de, chat, text: '9999' } });
    assert.equal((await s.db.prepare('SELECT pin FROM contatos WHERE tg_id = ?').get('900')).pin, '5446');
  } finally {
    await s.fechar();
  }
});

test('telegram: conectar bot pelo token, receber mensagem e responder pelo CRM', async () => {
  const s = await subirServidor();
  const cookieAdmin = s.cookie;
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
    const row = await s.db.prepare('SELECT * FROM canais WHERE id = ?').get(canal.id);
    const r1 = await canais.processarUpdateTelegram(s.db, row, update(1, 'Olá, preciso de ajuda com a fatura'));
    assert.equal(r1.resultado, 'mensagem');
    assert.equal(r1.nova, true);
    assert.equal((await canais.processarUpdateTelegram(s.db, row, update(1, 'Olá, preciso de ajuda com a fatura'))).motivo, 'duplicada');
    assert.equal((await canais.processarUpdateTelegram(s.db, row, { update_id: 5, message: { message_id: 1, chat: { id: -100, type: 'group' }, text: 'oi' } })).motivo, 'grupo');
    assert.equal((await canais.processarUpdateTelegram(s.db, row, { update_id: 6, edited_message: {} })).motivo, 'mensagem editada');
    const r2 = await canais.processarUpdateTelegram(s.db, row, update(2, '', { photo: [{ file_id: 'pequena' }, { file_id: 'foto-123' }], caption: 'segue o boleto' }));
    assert.equal(r2.nova, false);
    const inicio = await canais.processarUpdateTelegram(s.db, row, { update_id: 7, message: { message_id: 3, date: 1_700_000_100, from: { id: 777, first_name: 'Ana' }, chat: { id: 777, type: 'private' }, text: '/start' } });
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

    // a imagem enviada pelo cliente é entregue pelo CRM, sem expor o token do bot
    const comImagem = detalhe.dados.conversa.mensagens.find((m) => m.midia);
    assert.equal(comImagem.midia.tipo, 'imagem');
    assert.equal(comImagem.midia.url, `/api/midia/${comImagem.id}`);
    const arquivo = await fetch(`${s.base}${comImagem.midia.url}`, { headers: { Cookie: cookieAdmin } });
    assert.equal(arquivo.status, 200);
    assert.equal(arquivo.headers.get('content-type'), 'image/jpeg');
    assert.equal(await arquivo.text(), 'imagem-falsa');
    assert.deepEqual(s.telegram.chamadas.filter((c) => c[0] === 'baixarArquivo').at(-1), ['baixarArquivo', TOKEN, 'foto-123'], 'baixa a maior versão da foto');
    const semLogin = await fetch(`${s.base}${comImagem.midia.url}`);
    assert.equal(semLogin.status, 401);
    const conversaAna = lista.dados.conversas.find((c) => c.contato.nome === 'Ana');
    assert.ok(conversaAna);

    // resposta do atendente vai pelo bot
    const resposta = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Claro! Me passa o CNPJ?', tipo: 'resposta' });
    assert.equal(resposta.status, 201, JSON.stringify(resposta.dados));
    assert.equal(resposta.dados.erroEnvio, null);
    assert.equal(resposta.dados.mensagem.entrega, 'enviada');
    const envio = s.telegram.chamadas.find((c) => c[0] === 'sendMessage');
    assert.deepEqual(envio, ['sendMessage', TOKEN, '555', 'Claro! Me passa o CNPJ?']);
    assert.equal((await s.db.prepare('SELECT externo_id FROM mensagens WHERE id = ?').get(resposta.dados.mensagem.id)).externo_id, 'tg:555:77');

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
