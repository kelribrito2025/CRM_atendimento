'use strict';

// A mensagem aparece na hora: o servidor avisa quem está com a tela aberta,
// em vez de a tela ficar perguntando de tempos em tempos.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarWidget, assinar } = require('../src/widget');
const { criarAvisos } = require('../src/eventos');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const PAGINAS = path.join(__dirname, '..', 'client');
const SEGREDO = 'segredo-do-site';

async function subirServidor() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: false });
  const avisos = criarAvisos();
  const widget = criarWidget(db, { segredo: SEGREDO, arquivos: null, avisos });
  const app = criarApp(db, { widget, avisos, enviador: criarEnviador({ modo: 'silencioso' }), paginasDir: PAGINAS });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const r = await fetch(`${base}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN.email, senha: ADMIN.senha }),
  });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];

  const crm = async (caminho, metodo = 'GET', corpo) => {
    const resposta = await fetch(`${base}${caminho}`, {
      method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
  };

  const visitante = async (caminho, metodo = 'GET', corpo, token) => {
    const resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-widget-token': token } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
  };

  const abrirSessao = (dados) => visitante('/widget/sessao', 'POST', { ...dados, assinatura: assinar(SEGREDO, dados.id) });

  // Abre o fluxo e vai guardando os avisos que chegam. Um laço só lendo: se cada
  // espera fizesse a sua própria leitura, uma espera que estourasse o tempo
  // levaria embora o aviso seguinte.
  const ouvir = async (caminho, cabecalhos) => {
    const parada = new AbortController();
    const resposta = await fetch(`${base}${caminho}`, { headers: cabecalhos, signal: parada.signal });
    if (!resposta.ok) { parada.abort(); return { status: resposta.status, esperarAviso: async () => null, fechar: () => {} }; }

    const fila = [];
    (async () => {
      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let sobra = '';
      try {
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) return;
          sobra += decodificador.decode(value, { stream: true });
          const blocos = sobra.split('\n\n');
          sobra = blocos.pop() || '';
          for (const bloco of blocos) {
            const linha = bloco.split('\n').find((l) => l.startsWith('data:'));
            if (linha) fila.push(linha.slice(5).trim());
          }
        }
      } catch { /* fechou */ }
    })();

    const esperarAviso = async (ms = 2000) => {
      const limite = Date.now() + ms;
      while (Date.now() < limite) {
        if (fila.length) return fila.shift();
        await new Promise((pronto) => setTimeout(pronto, 20));
      }
      return null;
    };
    return { status: resposta.status, esperarAviso, fechar: () => parada.abort() };
  };

  return {
    db, crm, visitante, abrirSessao, ouvir, cookie,
    fechar: async () => { await new Promise((pronto) => servidor.close(pronto)); await db.fechar(); },
  };
}

test('tempo real: a mensagem do cliente avisa a tela do atendente na hora', async () => {
  const s = await subirServidor();
  const abertos = [];
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'u-tr-1', nome: 'Carla' });
    const tela = await s.ouvir('/api/eventos', { Cookie: s.cookie });
    abertos.push(tela);
    assert.equal(tela.status, 200);

    const comeco = Date.now();
    const aviso = tela.esperarAviso();
    await s.visitante('/widget/mensagens', 'POST', { texto: 'Oi, preciso de ajuda' }, sessao.token);
    const recebido = await aviso;
    assert.ok(recebido, 'a tela do atendente precisa ser avisada');
    assert.match(recebido, /"origem":"cliente"/);
    assert.ok(Date.now() - comeco < 1500, 'o aviso chega na hora, não no próximo ciclo');
  } finally {
    abertos.forEach((a) => a.fechar());
    await s.fechar();
  }
});

test('tempo real: a resposta do atendente avisa o chat do cliente na hora', async () => {
  const s = await subirServidor();
  const abertos = [];
  try {
    const { dados: carla } = await s.abrirSessao({ id: 'u-tr-2', nome: 'Carla' });
    await s.visitante('/widget/mensagens', 'POST', { texto: 'Meu saldo não bate' }, carla.token);
    const conversa = (await s.crm('/api/conversas')).dados.conversas[0];

    const chat = await s.ouvir('/widget/eventos', { 'x-widget-token': carla.token });
    abertos.push(chat);
    assert.equal(chat.status, 200);

    const comeco = Date.now();
    const aviso = chat.esperarAviso();
    await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Já estou verificando!' });
    assert.ok(await aviso, 'o chat do cliente precisa ser avisado');
    assert.ok(Date.now() - comeco < 1500, 'o aviso chega na hora');
  } finally {
    abertos.forEach((a) => a.fechar());
    await s.fechar();
  }
});

test('tempo real: o chat do cliente não é avisado de nota interna nem de conversa alheia', async () => {
  const s = await subirServidor();
  const abertos = [];
  try {
    const { dados: carla } = await s.abrirSessao({ id: 'u-tr-3', nome: 'Carla' });
    const { dados: bruno } = await s.abrirSessao({ id: 'u-tr-4', nome: 'Bruno' });
    await s.visitante('/widget/mensagens', 'POST', { texto: 'oi' }, carla.token);
    await s.visitante('/widget/mensagens', 'POST', { texto: 'oi' }, bruno.token);
    const conversas = (await s.crm('/api/conversas')).dados.conversas;
    const daCarla = conversas.find((c) => c.contato.nome === 'Carla');
    const doBruno = conversas.find((c) => c.contato.nome === 'Bruno');

    const chatDaCarla = await s.ouvir('/widget/eventos', { 'x-widget-token': carla.token });
    abertos.push(chatDaCarla);

    // Nota interna da equipe: o cliente não pode nem saber que existiu.
    let aviso = chatDaCarla.esperarAviso(700);
    await s.crm(`/api/conversas/${daCarla.id}/mensagens`, 'POST', { texto: 'Cliente do plano ouro', tipo: 'nota' });
    assert.equal(await aviso, null, 'nota interna não avisa o cliente');

    // Resposta em OUTRA conversa também não.
    aviso = chatDaCarla.esperarAviso(700);
    await s.crm(`/api/conversas/${doBruno.id}/mensagens`, 'POST', { texto: 'Oi Bruno' });
    assert.equal(await aviso, null, 'conversa de outro cliente não avisa');

    // E a resposta dela, sim.
    aviso = chatDaCarla.esperarAviso();
    await s.crm(`/api/conversas/${daCarla.id}/mensagens`, 'POST', { texto: 'Oi Carla' });
    assert.ok(await aviso, 'a resposta da própria conversa avisa');
  } finally {
    abertos.forEach((a) => a.fechar());
    await s.fechar();
  }
});

test('tempo real: sem a chave da conversa, o fluxo do chat não abre', async () => {
  const s = await subirServidor();
  try {
    assert.equal((await s.ouvir('/widget/eventos', {})).status, 401, 'sem chave não abre');
    assert.equal((await s.ouvir('/widget/eventos', { 'x-widget-token': 'inventado' })).status, 401);
    // E o fluxo do CRM exige atendente logado.
    assert.equal((await s.ouvir('/api/eventos', {})).status, 401);
  } finally { await s.fechar(); }
});
