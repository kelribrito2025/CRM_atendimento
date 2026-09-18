'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarTelegram } = require('../src/telegram');
const canais = require('../src/canais');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const TOKEN = '123456789:AAHfiqksKZ8WmR2zSjiQ7_v4TMAKdiHm9T0';
const raiz = path.resolve(__dirname, '..');

function telegramFalso() {
  const chamadas = [];
  const ativos = new Set();
  return {
    chamadas,
    async validarToken(token) {
      chamadas.push(['getMe', token]);
      return { id: '123456789', usuario: 'bigteck_bot', nome: 'Bigteck Atendimento' };
    },
    async removerWebhook(token) { chamadas.push(['deleteWebhook', token]); return true; },
    async enviarTexto(token, chatId, texto) { chamadas.push(['sendMessage', token, chatId, texto]); return { messageId: 77, chatId }; },
    async editarTexto(token, chatId, messageId, texto) {
      chamadas.push(['editMessageText', token, chatId, messageId, texto]);
      if (texto === 'REJEITA') { const e = new Error('O Telegram não permite mais editar esta mensagem.'); e.status = 400; throw e; }
      return { messageId, chatId, editado: true };
    },
    sondagem: {
      iniciar(canal) { ativos.add(canal.id); },
      parar(id) { ativos.delete(id); },
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
  async function entrar(credenciais) {
    const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credenciais) });
    assert.equal(login.status, 200, `login de ${credenciais.email}`);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    return async (caminho, metodo = 'GET', corpo) => {
      const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, dados: await r.json().catch(() => ({})) };
    };
  }
  const chamar = await entrar(ADMIN);
  return { db, base, telegram, chamar, entrar, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

const update = (id, texto) => ({
  update_id: id,
  message: {
    message_id: id * 10, date: 1_700_000_000 + id,
    from: { id: 555, is_bot: false, first_name: 'João', last_name: 'Silva', username: 'joaosilva' },
    chat: { id: 555, type: 'private', first_name: 'João', last_name: 'Silva' },
    text: texto,
  },
});

test('telegram: editarTexto chama editMessageText e trata "não modificada" e "não pode mais editar"', async () => {
  const pedidos = [];
  let resposta = { ok: true, result: { message_id: 77, chat: { id: 555 }, text: 'novo' } };
  const fetchFalso = async (url, opts) => {
    pedidos.push({ url, corpo: JSON.parse(opts.body) });
    return new Response(JSON.stringify(resposta), { status: resposta.ok ? 200 : 400 });
  };
  const tg = criarTelegram({ fetchImpl: fetchFalso });

  const r = await tg.editarTexto(TOKEN, '555', 77, 'novo');
  assert.deepEqual(r, { messageId: 77, chatId: 555, editado: true });
  assert.ok(pedidos[0].url.endsWith(`/bot${TOKEN}/editMessageText`));
  assert.deepEqual(pedidos[0].corpo, { chat_id: '555', message_id: 77, text: 'novo' });

  resposta = { ok: false, error_code: 400, description: 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same' };
  assert.deepEqual(await tg.editarTexto(TOKEN, '555', 77, 'novo'), { messageId: 77, chatId: '555', editado: false });

  resposta = { ok: false, error_code: 400, description: "Bad Request: message can't be edited" };
  await assert.rejects(tg.editarTexto(TOKEN, '555', 77, 'outro'), /não permite mais editar/);

  resposta = { ok: false, error_code: 400, description: 'Bad Request: message to edit not found' };
  await assert.rejects(tg.editarTexto(TOKEN, '555', 77, 'outro'), /não existe mais no Telegram/);
});

test('editar mensagem: a resposta entregue pelo Telegram é editada no chat do cliente e no CRM', async () => {
  const s = await subirServidor();
  try {
    const criado = await s.chamar('/api/canais/telegram', 'POST', { token: TOKEN });
    assert.equal(criado.status, 201, JSON.stringify(criado.dados));
    const canal = criado.dados.canal;
    const row = await s.db.prepare('SELECT * FROM canais WHERE id = ?').get(canal.id);
    await canais.processarUpdateTelegram(s.db, row, update(1, 'Olá, preciso de ajuda'));
    const lista = await s.chamar('/api/conversas');
    const conversa = lista.dados.conversas.find((c) => c.canal === 'telegram' && c.canalId === canal.id);
    assert.ok(conversa, 'conversa criada pelo bot de teste');
    const doCliente = (await s.chamar(`/api/conversas/${conversa.id}`)).dados.conversa.mensagens[0];

    const enviada = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Claro! Me passa o CNPJ?', tipo: 'resposta' });
    assert.equal(enviada.status, 201);
    const m = enviada.dados.mensagem;
    assert.equal(m.editadaEm, null);

    // edição feita
    const antes = Date.now();
    const editada = await s.chamar(`/api/conversas/${conversa.id}/mensagens/${m.id}`, 'PATCH', { texto: 'Claro! Me passa o CNPJ e a razão social?' });
    assert.equal(editada.status, 200, JSON.stringify(editada.dados));
    assert.equal(editada.dados.mensagem.texto, 'Claro! Me passa o CNPJ e a razão social?');
    assert.ok(editada.dados.mensagem.editadaEm >= antes);
    assert.deepEqual(s.telegram.chamadas.find((c) => c[0] === 'editMessageText'), ['editMessageText', TOKEN, '555', 77, 'Claro! Me passa o CNPJ e a razão social?']);
    const noBanco = await s.db.prepare('SELECT texto, editada_em FROM mensagens WHERE id = ?').get(m.id);
    assert.equal(noBanco.texto, 'Claro! Me passa o CNPJ e a razão social?');
    assert.ok(Number(noBanco.editada_em) >= antes);
    const auditoria = await s.db.prepare("SELECT * FROM auditoria_eventos WHERE acao = 'mensagem_editar'").all();
    assert.equal(auditoria.length, 1);
    assert.equal(Number(auditoria[0].origem_mensagem_id), m.id);
    assert.match(auditoria[0].detalhe, /Editou a mensagem/);
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.mensagens.find((x) => x.id === m.id).editadaEm, editada.dados.mensagem.editadaEm);

    // texto igual: nada é enviado ao Telegram
    const igual = await s.chamar(`/api/conversas/${conversa.id}/mensagens/${m.id}`, 'PATCH', { texto: 'Claro! Me passa o CNPJ e a razão social?' });
    assert.equal(igual.status, 200);
    assert.equal(s.telegram.chamadas.filter((c) => c[0] === 'editMessageText').length, 1);

    // validações
    assert.equal((await s.chamar(`/api/conversas/${conversa.id}/mensagens/${m.id}`, 'PATCH', { texto: '   ' })).status, 400);
    assert.equal((await s.chamar(`/api/conversas/${conversa.id}/mensagens/${m.id}`, 'PATCH', { texto: 'x'.repeat(4001) })).status, 400);
    const cliente = await s.chamar(`/api/conversas/${conversa.id}/mensagens/${doCliente.id}`, 'PATCH', { texto: 'tentando' });
    assert.equal(cliente.status, 400);
    assert.match(cliente.dados.erro, /enviadas pela equipe/);
    assert.equal((await s.chamar(`/api/conversas/${conversa.id}/mensagens/999999`, 'PATCH', { texto: 'x' })).status, 404);

    // o Telegram recusa: nada muda no CRM
    const recusada = await s.chamar(`/api/conversas/${conversa.id}/mensagens/${m.id}`, 'PATCH', { texto: 'REJEITA' });
    assert.equal(recusada.status, 502);
    assert.match(recusada.dados.erro, /não aceitou a edição/);
    assert.equal((await s.db.prepare('SELECT texto FROM mensagens WHERE id = ?').get(m.id)).texto, 'Claro! Me passa o CNPJ e a razão social?');

    // outro atendente (não admin) não edita a mensagem de quem enviou
    const marina = await s.entrar({ email: 'marina@bigteck.com.br', senha: ADMIN.senha });
    const negado = await marina(`/api/conversas/${conversa.id}/mensagens/${m.id}`, 'PATCH', { texto: 'outro texto' });
    assert.equal(negado.status, 403);

    // conversa que não é do Telegram: ainda não dá
    const outra = lista.dados.conversas.find((c) => c.canal !== 'telegram');
    if (outra) {
      const msgs = (await s.chamar(`/api/conversas/${outra.id}`)).dados.conversa.mensagens;
      const daEquipe = msgs.find((x) => x.tipo === 'atendente');
      if (daEquipe) {
        const r = await s.chamar(`/api/conversas/${outra.id}/mensagens/${daEquipe.id}`, 'PATCH', { texto: 'novo' });
        assert.equal(r.status, 400);
        assert.match(r.dados.erro, /Telegram/);
      }
    }
  } finally {
    await s.fechar();
  }
});

test('editar mensagem UI: lápis nas respostas do Telegram, editor no lugar e marca "editada"', () => {
  const js = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  const inicio = js.indexOf('function podeEditarMensagem');
  const fim = js.indexOf('// Os dois botõezinhos (lápis e lixeira)', inicio);
  const trecho = js.slice(inicio, fim);
  assert.ok(inicio >= 0);
  assert.match(trecho, /conversa\?\.canal === 'telegram'/);
  assert.match(trecho, /m\?\.tipo === 'atendente'/);
  assert.match(trecho, /!m\.midia/);
  assert.match(trecho, /m\.entrega === 'enviada'/);
  assert.match(trecho, /conta\?\.papel === 'admin'/);
  assert.match(trecho, /method: 'PATCH', body: \{ texto: limpo \}/);
  assert.match(trecho, /if \(e\.key === 'Escape'\)/);
  assert.match(js, /class: 'btn-editar-mensagem hov', title: 'Editar mensagem'/);
  assert.match(js, /edicaoMensagem\.id === m\.id \? edicaoDaMensagem\(m\)/);
  assert.match(js, /\$\{m\.editadaEm \? ' · editada' : ''\}/);
  assert.match(js, /`\$\{m\.id\}:\$\{m\.editadaEm \|\| 0\}`/, 'a atualização silenciosa percebe edições feitas em outra tela');

  const css = fs.readFileSync(path.join(raiz, 'client/assets/css/app.css'), 'utf8');
  assert.match(css, /\.btn-editar-mensagem, \.btn-excluir-mensagem \{/);
  assert.match(css, /\.mensagem-edicao textarea \{/);
});
