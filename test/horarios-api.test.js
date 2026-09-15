'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBancoDeTeste } = require('./apoio');
const { semear } = require('../src/db');
const { criarApp } = require('../src/app');
const { criarWidget, assinar } = require('../src/widget');
const { criarEnviador } = require('../src/email');
const { gerarHashSenha } = require('../src/senha');
const { criarAvisos } = require('../src/eventos');
const h = { inicio: '09:00', pausaInicio: '12:00', pausaFim: '13:00', fim: '18:00' };
const em = (hora) => Date.parse(`2026-09-15T${hora}-03:00`);

async function ambiente() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: 'admin@horario.com', adminSenha: 'SenhaTeste123', comDadosExemplo: false });
  const admin = (await db.prepare('SELECT id FROM usuarios LIMIT 1').get()).id;
  const info = await db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, papel, criado_em)
    VALUES ('Agente', 'agente@horario.com', ?, 'atendente', '2026-09-15')`).run(gerarHashSenha('SenhaTeste123'));
  const agente = Number(info.lastInsertRowid);
  let tempo = em('11:59:59');
  const avisos = criarAvisos(); const eventos = [];
  avisos.assinar((e) => eventos.push(e));
  const widget = criarWidget(db, { segredo: 'teste-horario', avisos, agora: () => tempo });
  const app = criarApp(db, { widget, avisos, agora: () => tempo, enviador: criarEnviador({ modo: 'silencioso' }) });
  const servidor = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const entrar = async (email) => {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha: 'SenhaTeste123' }) });
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie').split(';')[0];
  };
  const ck = await entrar('admin@horario.com');
  const chamar = async (rota, method = 'GET', body = null, cookie = ck, token = null) => {
    const r = await fetch(`${base}${rota}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(token ? { 'x-widget-token': token } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
    return { status: r.status, dados: await r.json() };
  };
  return { db, base, agente, admin, ck, chamar, entrar, eventos, widget, agora: (hora) => { tempo = em(hora); },
    fechar: async () => { servidor.closeAllConnections(); await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('horários API: admin configura, valida antes de salvar e atendente não muda a agenda', async () => {
  const s = await ambiente();
  try {
    const rota = `/api/equipe/usuarios/${s.agente}`;
    assert.equal((await s.chamar(rota, 'PATCH', { horario: h })).status, 200);
    const lista = (await s.chamar('/api/equipe')).dados.usuarios;
    assert.deepEqual(lista.find((u) => u.id === s.agente).horario, h);
    assert.deepEqual(s.eventos.at(-1), { origem: 'horario', atendenteId: s.agente });
    assert.equal((await s.chamar(rota, 'PATCH', { nome: 'Nao salvar', horario: { ...h, pausaFim: '11:00' } })).status, 400);
    assert.equal((await s.db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(s.agente)).nome, 'Agente');
    const ck = await s.entrar('agente@horario.com');
    assert.equal((await s.chamar(rota, 'PATCH', { horario: h }, ck)).status, 403);
    assert.equal((await s.chamar(rota, 'PATCH', { horario: h }, '')).status, 401);
    assert.equal((await s.chamar('/api/equipe/usuarios/999999', 'PATCH', { horario: h })).status, 404);
    assert.equal((await s.chamar(rota, 'PATCH', { horario: null })).dados.usuario.horario, null);
    const bloqueado = await s.chamar('/api/equipe/usuarios', 'POST', { nome: 'Nao criar' });
    assert.equal(bloqueado.status, 403, 'cadastro continua bloqueado');
  } finally { await s.fechar(); }
});

test('horários API: pausa e confirmação somente do perfil autenticado, válida em todas as sessões', async () => {
  const s = await ambiente();
  try {
    await s.chamar(`/api/equipe/usuarios/${s.agente}`, 'PATCH', { horario: h });
    await s.chamar(`/api/equipe/usuarios/${s.admin}`, 'PATCH', { horario: h });
    const ck = await s.entrar('agente@horario.com');
    const outraAba = await s.entrar('agente@horario.com');
    assert.equal((await s.chamar('/api/resumo', 'GET', null, ck)).dados.estadoHorario.fase, 'trabalho');
    s.agora('12:00:00');
    assert.equal((await s.chamar('/api/resumo', 'GET', null, ck)).dados.estadoHorario.fase, 'pausa');
    assert.equal((await s.chamar('/api/horario/retornar', 'POST', {}, ck)).status, 409);
    s.agora('13:00:00');
    assert.equal((await s.chamar('/api/resumo', 'GET', null, ck)).dados.estadoHorario.fase, 'retorno');
    assert.equal((await s.chamar('/api/horario/retornar', 'POST', { atendenteId: s.admin }, ck)).status, 200);
    assert.equal((await s.chamar('/api/resumo', 'GET', null, outraAba)).dados.estadoHorario.fase, 'trabalho');
    assert.equal((await s.chamar('/api/resumo')).dados.estadoHorario.fase, 'retorno', 'não confirma retorno de outra pessoa');
    assert.equal((await s.chamar('/api/horario/retornar', 'POST', {}, ck)).status, 200, 'idempotente');
    await s.chamar(`/api/equipe/usuarios/${s.agente}`, 'PATCH', { horario: { ...h, fim: '17:00' } });
    assert.equal((await s.chamar('/api/resumo', 'GET', null, ck)).dados.estadoHorario.fase, 'trabalho', 'editar o fim não refaz a pausa');
    s.agora('18:00:00');
    assert.equal((await s.chamar('/api/horario/retornar', 'POST', {}, ck)).status, 409);
    assert.equal((await s.chamar('/api/horario/retornar', 'POST', {}, '')).status, 401);
  } finally { await s.fechar(); }
});

test('horários API: card público, recepção durante pausa, números reais no retorno e fim do expediente', async () => {
  const s = await ambiente();
  try {
    await s.chamar(`/api/equipe/usuarios/${s.admin}`, 'PATCH', { horario: h });
    const sessao = await s.chamar('/widget/sessao', 'POST', { id: 'horario-cliente', nome: 'Cliente Teste', assinatura: assinar('teste-horario', 'horario-cliente') });
    assert.equal(sessao.status, 200);
    const token = sessao.dados.token;
    assert.equal(sessao.dados.atendimento.status, 'aberto');
    s.agora('12:00:00');
    const durante = await s.chamar('/widget/mensagens', 'GET', null, '', token);
    assert.equal(durante.dados.atendimento.status, 'pausa');
    assert.equal(durante.dados.atendimento.retornaAs, '13:00');
    assert.equal((await s.chamar('/widget/mensagens', 'POST', { texto: 'Posso deixar minha mensagem?' }, '', token)).status, 201);
    const conversa = await s.db.prepare("SELECT id FROM conversas WHERE canal = 'widget' LIMIT 1").get();
    await s.db.prepare('UPDATE conversas SET atendente_id = ? WHERE id = ?').run(s.admin, conversa.id);
    await s.db.prepare('UPDATE mensagens SET criada_em = ? WHERE conversa_id = ?').run(em('12:05:00'), conversa.id);
    s.agora('13:00:00');
    const resumo = (await s.chamar('/api/resumo')).dados;
    assert.deepEqual(resumo.retornoPausa, { mensagensNovas: 1, aguardandoDezMin: 1 });
    assert.equal((await s.chamar('/widget/mensagens', 'GET', null, '', token)).dados.atendimento.status, 'retorno');
    await s.chamar('/api/horario/retornar', 'POST', {});
    assert.equal((await s.chamar('/widget/mensagens', 'GET', null, '', token)).dados.atendimento.status, 'aberto');
    s.agora('18:00:00');
    const fora = (await s.chamar('/widget/mensagens', 'GET', null, '', token)).dados.atendimento;
    assert.equal(fora.status, 'fora');
    assert.equal(fora.retornoTexto, 'amanhã às 09:00');
    assert.doesNotMatch(JSON.stringify(fora), /@horario|atendenteId|usuarios|senha/);
  } finally { await s.fechar(); }
});

test('horários API: agenda e retorno pertencem ao perfil escolhido, não à conta compartilhada', async () => {
  const s = await ambiente();
  try {
    await s.chamar(`/api/equipe/usuarios/${s.agente}`, 'PATCH', { horario: h });
    await s.db.prepare('UPDATE usuarios SET pode_logar = 0 WHERE id = ?').run(s.agente);
    const { escolherAtendente } = require('../src/sessoes');
    assert.equal(await escolherAtendente(s.db, decodeURIComponent(s.ck.split('=')[1]), s.agente), true);
    s.agora('12:30:00');
    let r = (await s.chamar('/api/resumo')).dados;
    assert.equal(r.conta.id, s.admin);
    assert.equal(r.usuario.id, s.agente);
    assert.equal(r.estadoHorario.fase, 'pausa');
    s.agora('13:00:00');
    assert.equal((await s.chamar('/api/horario/retornar', 'POST', {})).status, 200);
    r = (await s.chamar('/api/resumo')).dados;
    assert.equal(r.estadoHorario.fase, 'trabalho');
    assert.equal((await s.db.prepare('SELECT retorno_confirmado_em FROM usuarios WHERE id = ?').get(s.admin)).retorno_confirmado_em, null);
  } finally { await s.fechar(); }
});
