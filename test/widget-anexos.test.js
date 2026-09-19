'use strict';

// Arquivo que o cliente anexa no chat do site: sai do navegador dele, é guardado
// no nosso S3 e aparece no CRM. E o contrário: o anexo do atendente chega no chat.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarWidget, assinar } = require('../src/widget');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const PAGINAS = path.join(__dirname, '..', 'client');
const SEGREDO = 'segredo-do-site';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');

// S3 de mentira: guarda na memória e conta o que foi gravado.
function arquivosFalsos() {
  const guardados = new Map();
  return {
    configurado: true,
    guardados,
    async enviar(bytes, { nome, tipo, pasta }) {
      const chave = `chat-app-numeros/${pasta}/${guardados.size + 1}-${nome}`;
      guardados.set(chave, { bytes, tipo });
      return { chave, tamanho: bytes.length, tipo };
    },
    async baixar(chave) {
      const g = guardados.get(chave);
      if (!g) throw new Error('não existe');
      return { bytes: g.bytes, tipo: g.tipo };
    },
    urlAssinada: (chave) => `https://exemplo-s3/${encodeURIComponent(chave)}?assinatura=abc`,
  };
}

async function subirServidor({ arquivos = arquivosFalsos() } = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: false });
  const widget = criarWidget(db, { segredo: SEGREDO, arquivos });
  const app = criarApp(db, { widget, arquivos, enviador: criarEnviador({ modo: 'silencioso' }), paginasDir: PAGINAS });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const visitante = async (caminho, metodo = 'GET', corpo, token) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-widget-token': token } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  // O cliente anexando um arquivo pelo clipe do chat.
  const anexar = async (token, bytes, nome, mime) => {
    const r = await fetch(`${base}/widget/anexos`, {
      method: 'POST',
      headers: { 'Content-Type': mime, 'x-nome-arquivo': encodeURIComponent(nome), ...(token ? { 'x-widget-token': token } : {}) },
      body: bytes,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  const baixarComoCliente = async (url, token) => {
    const r = await fetch(`${base}${url}`, { headers: token ? { 'x-widget-token': token } : {} });
    return { status: r.status, tipo: r.headers.get('content-type'), bytes: Buffer.from(await r.arrayBuffer()) };
  };

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
  const crmAnexar = async (conversaId, bytes, nome, mime) => {
    const resposta = await fetch(`${base}/api/conversas/${conversaId}/anexos`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': mime, 'x-nome-arquivo': encodeURIComponent(nome) }, body: bytes,
    });
    return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
  };
  const crmBaixar = async (url) => {
    const resposta = await fetch(`${base}${url}`, { headers: { Cookie: cookie } });
    return { status: resposta.status, tipo: resposta.headers.get('content-type'), bytes: Buffer.from(await resposta.arrayBuffer()) };
  };

  const abrirSessao = (dados) => visitante('/widget/sessao', 'POST', { ...dados, assinatura: assinar(SEGREDO, dados.id) });

  return {
    db, arquivos, visitante, abrirSessao, anexar, baixarComoCliente, crm, crmAnexar, crmBaixar,
    fechar: async () => { await new Promise((r2) => servidor.close(r2)); await db.fechar(); },
  };
}

test('chat do site: o arquivo do cliente vai para o nosso S3 e aparece no CRM', async () => {
  const s = await subirServidor();
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'u-70', nome: 'Carla Menezes' });
    const r = await s.anexar(sessao.token, PNG, 'comprovante.png', 'image/png');
    assert.equal(r.status, 201);
    assert.equal(r.dados.mensagem.midia.tipo, 'imagem');
    assert.equal(r.dados.mensagem.midia.nome, 'comprovante.png');

    // Guardado no nosso bucket, no prefixo da conversa.
    assert.equal(s.arquivos.guardados.size, 1);
    const [chave, guardado] = [...s.arquivos.guardados.entries()][0];
    assert.match(chave, /^chat-app-numeros\/conversa-\d+\//);
    assert.deepEqual(guardado.bytes, PNG);

    // O atendente vê a mensagem com o arquivo e baixa o mesmo conteúdo.
    const { dados: lista } = await s.crm('/api/conversas?caixa=todas');
    const conversa = lista.conversas.find((c) => c.canal === 'widget');
    const { dados: aberta } = await s.crm(`/api/conversas/${conversa.id}`);
    const mensagem = aberta.conversa.mensagens.at(-1);
    assert.equal(mensagem.midia.tipo, 'imagem');
    assert.equal(mensagem.midia.nome, 'comprovante.png');
    const baixado = await s.crmBaixar(mensagem.midia.url);
    assert.equal(baixado.status, 200);
    assert.deepEqual(baixado.bytes, PNG);
  } finally { await s.fechar(); }
});

test('chat do site: o áudio gravado pelo cliente chega no CRM como mensagem de áudio', async () => {
  const s = await subirServidor();
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'u-71', nome: 'Paulo Reis' });
    const AUDIO = Buffer.from('bytes-de-audio-webm');
    const r = await s.anexar(sessao.token, AUDIO, 'audio-2026-09-19-10-00-00.webm', 'audio/webm');
    assert.equal(r.status, 201, JSON.stringify(r.dados));
    assert.equal(r.dados.mensagem.midia.tipo, 'audio');
    assert.equal(r.dados.mensagem.midia.mime, 'audio/webm');
    assert.equal(r.dados.mensagem.texto, '[Áudio]');

    const { dados: lista } = await s.crm('/api/conversas?caixa=todas');
    const conversa = lista.conversas.find((c) => c.canal === 'widget');
    const { dados: aberta } = await s.crm(`/api/conversas/${conversa.id}`);
    const mensagem = aberta.conversa.mensagens.at(-1);
    assert.equal(mensagem.midia.tipo, 'audio');
    const baixado = await s.crmBaixar(mensagem.midia.url);
    assert.equal(baixado.status, 200);
    assert.deepEqual(baixado.bytes, AUDIO);

    // Safari grava em mp4: também é áudio.
    const safari = await s.anexar(sessao.token, AUDIO, 'audio-x.m4a', 'audio/mp4');
    assert.equal(safari.dados.mensagem.midia.tipo, 'audio');
  } finally { await s.fechar(); }
});

test('chat do site: o cliente abre o próprio arquivo, e o de outro cliente não', async () => {
  const s = await subirServidor();
  try {
    const { dados: carla } = await s.abrirSessao({ id: 'u-71', nome: 'Carla' });
    const { dados: bruno } = await s.abrirSessao({ id: 'u-72', nome: 'Bruno' });
    const { dados } = await s.anexar(carla.token, PNG, 'nota.png', 'image/png');
    const url = dados.mensagem.midia.url;

    const dela = await s.baixarComoCliente(url, carla.token);
    assert.equal(dela.status, 200);
    assert.deepEqual(dela.bytes, PNG);

    // O arquivo é da conversa dela: a chave do Bruno não abre.
    assert.equal((await s.baixarComoCliente(url, bruno.token)).status, 404);
    // Sem chave nenhuma, nem entra.
    assert.equal((await s.baixarComoCliente(url, null)).status, 401);
    assert.equal((await s.anexar(null, PNG, 'x.png', 'image/png')).status, 401);
  } finally { await s.fechar(); }
});

test('chat do site: o anexo do atendente chega no chat do cliente', async () => {
  const s = await subirServidor();
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'u-73', nome: 'Carla' });
    await s.visitante('/widget/mensagens', 'POST', { texto: 'Segue meu comprovante' }, sessao.token);

    const { dados: lista } = await s.crm('/api/conversas?caixa=todas');
    const conversa = lista.conversas.find((c) => c.canal === 'widget');
    const enviado = await s.crmAnexar(conversa.id, PNG, 'segunda-via.png', 'image/png');
    assert.equal(enviado.status, 201);

    const { dados } = await s.visitante('/widget/mensagens', 'GET', null, sessao.token);
    const doAtendimento = dados.mensagens.filter((m) => m.de === 'atendimento');
    assert.equal(doAtendimento.length, 1);
    assert.equal(doAtendimento[0].midia.nome, 'segunda-via.png');
    const baixado = await s.baixarComoCliente(doAtendimento[0].midia.url, sessao.token);
    assert.equal(baixado.status, 200);
    assert.deepEqual(baixado.bytes, PNG);
  } finally { await s.fechar(); }
});

test('chat do site: sem S3 configurado o envio avisa, e não quebra a conversa', async () => {
  const s = await subirServidor({ arquivos: { configurado: false } });
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'u-74', nome: 'Carla' });
    const r = await s.anexar(sessao.token, PNG, 'nota.png', 'image/png');
    assert.equal(r.status, 400);
    assert.match(r.dados.erro, /indisponível/i);
    // o texto continua funcionando
    assert.equal((await s.visitante('/widget/mensagens', 'POST', { texto: 'oi' }, sessao.token)).status, 201);
  } finally { await s.fechar(); }
});

test('chat do site: arquivo acima de 20 MB é recusado', async () => {
  const s = await subirServidor();
  try {
    const { dados: sessao } = await s.abrirSessao({ id: 'u-75', nome: 'Carla' });
    const grande = Buffer.alloc(21 * 1024 * 1024, 7);
    const r = await s.anexar(sessao.token, grande, 'video.mp4', 'video/mp4');
    assert.equal(r.status, 413);
    assert.equal(s.arquivos.guardados.size, 0);
  } finally { await s.fechar(); }
});
