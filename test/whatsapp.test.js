'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarUazapi, interpretarStatus } = require('../src/uazapi');
const canais = require('../src/canais');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };

// Servidor do uazapi de mentira, para testar sem internet.
function uazapiFalso() {
  const chamadas = [];
  let estadoInstancia = 'disconnected';
  return {
    configurado: true,
    base: 'https://falso.uazapi.com',
    chamadas,
    conectarDeVerdade() { estadoInstancia = 'connected'; },
    async criarInstancia(nome) { chamadas.push(['init', nome]); return { instance: { id: 'inst-1', token: 'tok-123', name: nome, status: 'disconnected' } }; },
    async conectar(token, telefone) {
      chamadas.push(['connect', token, telefone || null]);
      estadoInstancia = 'connecting';
      return { instance: { status: 'connecting', qrcode: telefone ? null : 'QRBASE64', paircode: telefone ? 'ABCD1234' : null } };
    },
    async status(token) {
      chamadas.push(['status', token]);
      return { instance: { status: estadoInstancia, owner: '5531999990000@s.whatsapp.net', profileName: 'Bigteck' }, status: { connected: estadoInstancia === 'connected', loggedIn: estadoInstancia === 'connected' } };
    },
    async desconectar(token) { chamadas.push(['disconnect', token]); estadoInstancia = 'disconnected'; return {}; },
    async excluir(token) { chamadas.push(['delete', token]); return {}; },
    async configurarWebhook(token, cfg) { chamadas.push(['webhook', token, cfg]); return {}; },
    async enviarTexto(token, numero, texto) { chamadas.push(['texto', numero, texto]); return { messageid: `SAIDA-${chamadas.length}` }; },
  };
}

async function subirServidor(opcoes = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: true });
  const uazapi = uazapiFalso();
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), uazapi, baseUrl: 'https://crm.exemplo.com.br', ...opcoes });
  const servidor = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const h = { Cookie: cookie, 'Content-Type': 'application/json' };
  const chamar = async (caminho, metodo = 'GET', corpo) => {
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };
  return { db, base, uazapi, h, chamar, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('uazapi: cliente monta cabeçalhos e traduz erros', async () => {
  const pedidos = [];
  const fetchFalso = async (url, opts) => {
    pedidos.push({ url, opts });
    if (url.endsWith('/instance/status')) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401 });
    return new Response(JSON.stringify({ instance: { token: 'abc' } }), { status: 200 });
  };
  const cli = criarUazapi({ url: 'https://x.uazapi.com/', adminToken: 'ADM', fetchImpl: fetchFalso });
  assert.equal(cli.configurado, true);
  const r = await cli.criarInstancia('Loja');
  assert.equal(r.instance.token, 'abc');
  assert.equal(pedidos[0].url, 'https://x.uazapi.com/instance/init');
  assert.equal(pedidos[0].opts.headers.admintoken, 'ADM');
  await cli.enviarTexto('tok', '5531999', 'oi');
  assert.equal(pedidos[1].opts.headers.token, 'tok');
  assert.deepEqual(JSON.parse(pedidos[1].opts.body), { number: '5531999', text: 'oi' });
  await assert.rejects(() => cli.status('tok'), /Token inválido/);
  assert.equal(criarUazapi({}).configurado, false);
});

test('uazapi: interpretação de status e eventos', () => {
  assert.equal(interpretarStatus({ instance: { status: 'connected', owner: '5531999990000@s.whatsapp.net' } }).numero, '5531999990000');
  assert.equal(interpretarStatus({ instance: { status: 'qrcode' } }).status, 'connecting');
  assert.equal(interpretarStatus({ status: { connected: true, loggedIn: true } }).status, 'connected');
  assert.equal(interpretarStatus({}).status, 'disconnected');
  assert.equal(canais.formatarNumero('5531998124471'), '+55 31 99812-4471');
  assert.equal(canais.numeroDoChat('5531998124471@s.whatsapp.net'), '5531998124471');
  assert.equal(canais.ehGrupo('120363012345678901@g.us'), true);
  const m = canais.extrairMensagem({ message: { messageid: 'X', chatid: '55@s.whatsapp.net', messageType: 'image', content: { caption: 'foto' }, senderName: 'Ana' } });
  assert.equal(m.texto, '[Imagem] foto');
  assert.equal(m.nome, 'Ana');
  assert.equal(canais.interpretarEntrega('READ'), 'lida');
  assert.equal(canais.interpretarEntrega('DELIVERY_ACK'), 'entregue');
});

test('whatsapp: foto do contato é guardada quando o servidor manda o endereço', async () => {
  const s = await subirServidor();
  try {
    const criado = await s.chamar('/api/canais', 'POST', { nome: 'WhatsApp principal' });
    assert.equal(criado.dados.canal.cor, '#12B85C', 'canais existentes ou sem escolha continuam verdes');
    const canal = await s.db.prepare('SELECT * FROM canais WHERE id = ?').get(criado.dados.canal.id);
    assert.equal(canal.cor, '#12B85C');
    await canais.processarEvento(s.db, canal, {
      EventType: 'messages',
      message: { messageid: 'A1', chatid: '5531988887777@s.whatsapp.net', fromMe: false, text: 'oi', senderName: 'Carla', messageTimestamp: Date.now() },
      chat: { wa_chatid: '5531988887777@s.whatsapp.net', imagePreview: 'https://exemplo.com/foto.jpg' },
    });
    const contato = await s.db.prepare("SELECT * FROM contatos WHERE wa_id = '5531988887777'").get();
    assert.equal(contato.wa_foto_url, 'https://exemplo.com/foto.jpg');
    const conversa = (await s.chamar('/api/conversas')).dados.conversas.find((c) => c.contato.id === contato.id);
    assert.equal(conversa.contato.foto, `/api/contatos/${contato.id}/foto`);
  } finally {
    await s.fechar();
  }
});

test('whatsapp: criar canal, conectar por QR e por número, receber e responder mensagens', async () => {
  const s = await subirServidor();
  try {
    // apenas admin
    const loginMarina = await fetch(`${s.base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'marina@bigteck.com.br', senha: ADMIN.senha }) });
    const cookieMarina = (loginMarina.headers.get('set-cookie') || '').split(';')[0];
    const negado = await fetch(`${s.base}/api/canais`, { method: 'POST', headers: { Cookie: cookieMarina, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(negado.status, 403);

    const corInvalida = await s.chamar('/api/canais', 'POST', { nome: 'Cor inválida', cor: 'verde' });
    assert.equal(corInvalida.status, 400);
    assert.match(corInvalida.dados.erro, /cor válida/i);
    assert.equal(s.uazapi.chamadas.filter((c) => c[0] === 'init').length, 0, 'cor inválida não cria instância');

    // criar canal
    const criado = await s.chamar('/api/canais', 'POST', { nome: 'WhatsApp principal', cor: '#7c3aed' });
    assert.equal(criado.status, 201);
    const canal = criado.dados.canal;
    assert.equal(canal.cor, '#7C3AED');
    assert.equal(canal.status, 'disconnected');
    assert.match(canal.webhookUrl, /^https:\/\/crm\.exemplo\.com\.br\/webhook\/uazapi\/[a-f0-9]{32}$/);
    assert.equal(canal.webhookAviso, null);
    const cfgWebhook = s.uazapi.chamadas.find((c) => c[0] === 'webhook')[2];
    assert.equal(cfgWebhook.url, canal.webhookUrl);
    assert.ok(cfgWebhook.events.includes('messages'));

    // conectar por QR code
    const qr = await s.chamar(`/api/canais/${canal.id}/conectar`, 'POST', {});
    assert.equal(qr.status, 200);
    assert.equal(qr.dados.qrcode, 'QRBASE64');
    assert.equal(qr.dados.status, 'connecting');

    // conectar por número (código de pareamento)
    const ruim = await s.chamar(`/api/canais/${canal.id}/conectar`, 'POST', { telefone: '123' });
    assert.equal(ruim.status, 400);
    const par = await s.chamar(`/api/canais/${canal.id}/conectar`, 'POST', { telefone: '(31) 99999-0000' });
    assert.equal(par.dados.paircode, 'ABCD1234');
    assert.equal(s.uazapi.chamadas.filter((c) => c[0] === 'connect').pop()[2], '31999990000');

    // status vira conectado
    s.uazapi.conectarDeVerdade();
    const st = await s.chamar(`/api/canais/${canal.id}/status`);
    assert.equal(st.dados.status, 'connected');
    assert.equal(st.dados.canal.numeroFormatado, '+55 31 99999-0000');
    const resumo = await s.chamar('/api/resumo');
    assert.equal(resumo.dados.canais[0].conectado, true);

    // webhook: mensagem do cliente
    const segredo = canal.webhookUrl.split('/').pop();
    const evento = (corpo) => fetch(`${s.base}/webhook/uazapi/${segredo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const errado = await fetch(`${s.base}/webhook/uazapi/${'0'.repeat(32)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(errado.status, 404);

    const msg = { EventType: 'messages', message: { messageid: 'ENTRADA-1', chatid: '5531988887777@s.whatsapp.net', fromMe: false, messageType: 'text', text: 'Olá, preciso de ajuda com minha fatura', senderName: 'Cliente Teste', messageTimestamp: Math.floor(Date.now() / 1000) } };
    const r1 = await evento(msg);
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).resultado, 'mensagem');

    const lista = await s.chamar('/api/conversas?q=Cliente%20Teste');
    assert.equal(lista.dados.conversas.length, 1);
    const conversa = lista.dados.conversas[0];
    assert.equal(conversa.canal, 'whatsapp');
    assert.equal(conversa.canalCor, '#7C3AED');
    assert.equal(conversa.semResposta, true);
    assert.equal(conversa.naoLidas, 1);
    assert.equal(conversa.contato.telefone, '+55 31 98888-7777');

    // duplicada e grupo são ignoradas
    assert.equal((await (await evento(msg)).json()).motivo, 'duplicada');
    const grupo = await evento({ EventType: 'messages', message: { messageid: 'G1', chatid: '120363012345678901@g.us', text: 'oi grupo' } });
    assert.equal((await grupo.json()).motivo, 'grupo');
    assert.equal((await s.chamar('/api/conversas?q=Cliente%20Teste')).dados.conversas.length, 1);

    // responder pelo CRM envia pelo uazapi
    const resposta = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Claro! Me passa o CNPJ?', tipo: 'resposta' });
    assert.equal(resposta.status, 201);
    assert.equal(resposta.dados.erroEnvio, null);
    assert.equal(resposta.dados.mensagem.entrega, 'enviada');
    const envio = s.uazapi.chamadas.find((c) => c[0] === 'texto');
    assert.deepEqual(envio, ['texto', '5531988887777', 'Claro! Me passa o CNPJ?']);

    // confirmação de leitura pelo webhook
    const idSaida = (await s.db.prepare("SELECT externo_id FROM mensagens WHERE tipo = 'atendente' AND conversa_id = ?").get(conversa.id)).externo_id;
    assert.ok(idSaida);
    const lida = await evento({ EventType: 'messages_update', message: { messageid: idSaida, status: 'READ' } });
    assert.equal((await lida.json()).entrega, 'lida');
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.mensagens.find((m) => m.tipo === 'atendente').entrega, 'lida');

    // mensagem respondida pelo celular aparece como atendente
    await evento({ EventType: 'messages', message: { messageid: 'CEL-1', chatid: '5531988887777@s.whatsapp.net', fromMe: true, text: 'Respondi pelo celular' } });
    const detalhe2 = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe2.dados.conversa.mensagens.at(-1).tipo, 'atendente');

    // evento de conexão atualiza o status
    await evento({ EventType: 'connection', status: 'disconnected' });
    const canaisDepois = await s.chamar('/api/canais');
    assert.equal(canaisDepois.dados.canais[0].status, 'disconnected');
    const eventos = await s.chamar(`/api/canais/${canal.id}/eventos`);
    assert.ok(eventos.dados.eventos.length >= 5);

    // excluir
    const del = await s.chamar(`/api/canais/${canal.id}`, 'DELETE');
    assert.equal(del.status, 200);
    assert.equal((await s.chamar('/api/canais')).dados.canais.length, 0);
    assert.equal((await s.chamar(`/api/conversas/${conversa.id}`)).status, 200); // conversa continua
  } finally {
    await s.fechar();
  }
});

test('whatsapp: sem servidor configurado a tela avisa e o envio marca falha', async () => {
  const s = await subirServidor({ uazapi: { configurado: false, base: '' } });
  try {
    const criado = await s.chamar('/api/canais', 'POST', { nome: 'x' });
    assert.equal(criado.status, 400);
    assert.match(criado.dados.erro, /UAZAPI_URL/);
    const lista = await s.chamar('/api/canais');
    assert.equal(lista.dados.configurado, false);
  } finally {
    await s.fechar();
  }
});
