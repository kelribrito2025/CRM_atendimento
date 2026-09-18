'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarWidget, assinar } = require('../src/widget');
const { criarAvisos } = require('../src/eventos');
const { gerarHashSenha } = require('../src/senha');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const SEGREDO = 'segredo-edicao-site';
const PAGINAS = path.join(__dirname, '..', 'client');

async function subirServidor() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: false });
  const avisos = criarAvisos();
  const widget = criarWidget(db, { segredo: SEGREDO, avisos });
  const app = criarApp(db, { widget, avisos, enviador: criarEnviador({ modo: 'silencioso' }), paginasDir: PAGINAS });
  const servidor = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const entrar = async (email, senha) => {
    const resposta = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    return (resposta.headers.get('set-cookie') || '').split(';')[0];
  };
  const cookie = await entrar(ADMIN.email, ADMIN.senha);
  const crm = async (caminho, metodo = 'GET', corpo, ck = cookie) => {
    const resposta = await fetch(`${base}${caminho}`, { method: metodo, headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
  };
  const visitante = async (caminho, metodo = 'GET', corpo, token) => {
    const resposta = await fetch(`${base}${caminho}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { 'x-widget-token': token } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
  };
  const abrirSessao = (dados) => visitante('/widget/sessao', 'POST', { ...dados, assinatura: assinar(SEGREDO, dados.id) });
  const ouvirWidget = async (token) => {
    const parada = new AbortController();
    const resposta = await fetch(`${base}/widget/eventos`, { headers: { 'x-widget-token': token }, signal: parada.signal });
    const leitor = resposta.body.getReader();
    const esperar = async (ms = 2000) => {
      const limite = Date.now() + ms;
      const decodificador = new TextDecoder();
      let texto = '';
      while (Date.now() < limite) {
        const resultado = await Promise.race([leitor.read(), new Promise((resolve) => setTimeout(() => resolve(null), Math.max(1, limite - Date.now())))]);
        if (!resultado || resultado.done) return null;
        texto += decodificador.decode(resultado.value, { stream: true });
        const linha = texto.split('\n').find((item) => item.startsWith('data:'));
        if (linha) return JSON.parse(linha.slice(5).trim());
      }
      return null;
    };
    return { esperar, fechar: () => parada.abort() };
  };
  return { db, entrar, crm, visitante, abrirSessao, ouvirWidget, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('mensagem do site: edição troca o texto no CRM e no widget, marca "editada", audita e avisa por SSE', async () => {
  const s = await subirServidor();
  let fluxo;
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'cliente-edicao', nome: 'Cliente Site', email: 'cliente@site.com' });
    assert.equal((await s.visitante('/widget/mensagens', 'POST', { texto: 'Oi, tenho uma dúvida' }, sessao.token)).status, 201);
    const conversa = (await s.crm('/api/conversas')).dados.conversas[0];
    const resposta = await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Claro, me conta' });
    const mensagemId = resposta.dados.mensagem.id;
    let historico = await s.visitante('/widget/mensagens', 'GET', null, sessao.token);
    assert.equal(historico.dados.ultimaEdicao, 0);
    assert.equal(historico.dados.mensagens.find((m) => m.id === mensagemId).editadaEm, null);

    fluxo = await s.ouvirWidget(sessao.token);
    const aviso = fluxo.esperar();
    const editada = await s.crm(`/api/conversas/${conversa.id}/mensagens/${mensagemId}`, 'PATCH', { texto: 'Claro, me conta o que aconteceu' });
    assert.equal(editada.status, 200, JSON.stringify(editada.dados));
    assert.equal(editada.dados.mensagem.texto, 'Claro, me conta o que aconteceu');
    assert.ok(editada.dados.mensagem.editadaEm > 0);
    assert.deepEqual(await aviso, { novidade: 1, origem: 'edicao' });

    historico = await s.visitante('/widget/mensagens', 'GET', null, sessao.token);
    const noWidget = historico.dados.mensagens.find((m) => m.id === mensagemId);
    assert.equal(noWidget.texto, 'Claro, me conta o que aconteceu');
    assert.equal(noWidget.editadaEm, editada.dados.mensagem.editadaEm);
    assert.equal(historico.dados.ultimaEdicao, editada.dados.mensagem.editadaEm, 'o widget sem SSE percebe a edição pela data');
    assert.equal(historico.dados.total, 2, 'editar não muda a quantidade');

    const detalhe = await s.crm(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.mensagens.find((m) => m.id === mensagemId).texto, 'Claro, me conta o que aconteceu');

    const auditoria = await s.db.prepare("SELECT * FROM auditoria_eventos WHERE acao = 'mensagem_editar'").get();
    assert.match(auditoria.detalhe, new RegExp(`Editou a mensagem #${mensagemId} enviada no Chat do site`));
    assert.doesNotMatch(auditoria.detalhe, /me conta/);

    // o cliente não edita nada pelo widget, e a mensagem do cliente não é editável pelo CRM
    const doCliente = historico.dados.mensagens.find((m) => m.de === 'voce');
    assert.equal((await s.crm(`/api/conversas/${conversa.id}/mensagens/${doCliente.id}`, 'PATCH', { texto: 'x' })).status, 400);
    assert.equal((await s.visitante(`/api/conversas/${conversa.id}/mensagens/${mensagemId}`, 'PATCH', { texto: 'x' }, sessao.token)).status, 401);
  } finally {
    fluxo?.fechar();
    await s.fechar();
  }
});

test('mensagem do site: outro atendente não edita envio alheio; administrador pode', async () => {
  const s = await subirServidor();
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'cliente-permissao', nome: 'Cliente', email: 'c@site.com' });
    await s.visitante('/widget/mensagens', 'POST', { texto: 'Olá' }, sessao.token);
    const conversa = (await s.crm('/api/conversas')).dados.conversas[0];
    await s.db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
      .run('Célia Dias', 'celia@teste.com', gerarHashSenha('outrasenha123'), 'atendente', Date.now());
    const celia = await s.entrar('celia@teste.com', 'outrasenha123');
    const respostaCelia = await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Resposta da Célia' }, celia);
    const respostaAdmin = await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Resposta do admin' });

    assert.equal((await s.crm(`/api/conversas/${conversa.id}/mensagens/${respostaAdmin.dados.mensagem.id}`, 'PATCH', { texto: 'tentando' }, celia)).status, 403);
    assert.equal((await s.crm(`/api/conversas/${conversa.id}/mensagens/${respostaCelia.dados.mensagem.id}`, 'PATCH', { texto: 'Resposta da Célia, corrigida' }, celia)).status, 200);
    assert.equal((await s.crm(`/api/conversas/${conversa.id}/mensagens/${respostaCelia.dados.mensagem.id}`, 'PATCH', { texto: 'Corrigida pelo admin' })).status, 200, 'administrador edita envio de outro atendente');
    assert.equal((await s.db.prepare('SELECT texto FROM mensagens WHERE id = ?').get(respostaCelia.dados.mensagem.id)).texto, 'Corrigida pelo admin');
    assert.equal((await s.db.prepare("SELECT COUNT(*) AS n FROM auditoria_eventos WHERE acao = 'mensagem_editar'").get()).n, 2, 'cada edição gera um registro');
  } finally { await s.fechar(); }
});
