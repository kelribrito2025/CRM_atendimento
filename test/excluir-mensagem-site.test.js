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
const SEGREDO = 'segredo-exclusao-site';
const PAGINAS = path.join(__dirname, '..', 'client');
const PNG = Buffer.from('imagem de teste');

function arquivosFalsos() {
  const guardados = new Map();
  return {
    configurado: true,
    guardados,
    async enviar(bytes, { nome, tipo, pasta }) {
      const chave = `chat-app-numeros/${pasta}/${nome}`;
      guardados.set(chave, { bytes, tipo });
      return { chave, tamanho: bytes.length, tipo };
    },
    async baixar(chave) {
      const item = guardados.get(chave);
      if (!item) throw new Error('não existe');
      return { bytes: item.bytes, tipo: item.tipo };
    },
    async apagar(chave) { return guardados.delete(chave); },
    urlAssinada: (chave) => `https://arquivos.exemplo/${encodeURIComponent(chave)}`,
  };
}

async function subirServidor() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: false });
  const arquivos = arquivosFalsos();
  const avisos = criarAvisos();
  const widget = criarWidget(db, { segredo: SEGREDO, arquivos, avisos });
  const app = criarApp(db, { widget, avisos, arquivos, enviador: criarEnviador({ modo: 'silencioso' }), paginasDir: PAGINAS });
  const servidor = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const entrar = async (email, senha) => {
    const resposta = await fetch(`${base}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }),
    });
    return (resposta.headers.get('set-cookie') || '').split(';')[0];
  };
  const cookie = await entrar(ADMIN.email, ADMIN.senha);
  const crm = async (caminho, metodo = 'GET', corpo, ck = cookie) => {
    const resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { Cookie: ck, 'Content-Type': 'application/json' },
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
  const enviarArquivo = async (conversaId) => {
    const resposta = await fetch(`${base}/api/conversas/${conversaId}/anexos`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/png', 'x-nome-arquivo': 'imagem.png' }, body: PNG,
    });
    return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
  };
  const ouvirWidget = async (token) => {
    const parada = new AbortController();
    const resposta = await fetch(`${base}/widget/eventos`, { headers: { 'x-widget-token': token }, signal: parada.signal });
    const leitor = resposta.body.getReader();
    const esperar = async (ms = 2000) => {
      const limite = Date.now() + ms;
      const decodificador = new TextDecoder();
      let texto = '';
      while (Date.now() < limite) {
        const leitura = leitor.read();
        const resultado = await Promise.race([
          leitura,
          new Promise((resolve) => setTimeout(() => resolve(null), Math.max(1, limite - Date.now()))),
        ]);
        if (!resultado) return null;
        if (resultado.done) return null;
        texto += decodificador.decode(resultado.value, { stream: true });
        const linha = texto.split('\n').find((item) => item.startsWith('data:'));
        if (linha) return JSON.parse(linha.slice(5).trim());
      }
      return null;
    };
    return { status: resposta.status, esperar, fechar: () => parada.abort() };
  };

  return {
    db, base, arquivos, cookie, entrar, crm, visitante, abrirSessao, enviarArquivo, ouvirWidget,
    fechar: async () => { await new Promise((resolve) => servidor.close(resolve)); await db.fechar(); },
  };
}

async function conversaDoSite(s, id = 'cliente-exclusao') {
  const { dados: sessao } = await s.abrirSessao({ id, nome: 'Cliente Site', email: 'cliente@site.com' });
  const enviada = await s.visitante('/widget/mensagens', 'POST', { texto: 'Mensagem do cliente' }, sessao.token);
  assert.equal(enviada.status, 201);
  const conversa = (await s.crm('/api/conversas')).dados.conversas[0];
  return { sessao, conversa, mensagemCliente: enviada.dados.mensagem };
}

test('mensagem do site: exclusão remove do CRM e do widget, audita e avisa por SSE', async () => {
  const s = await subirServidor();
  let fluxo;
  try {
    const { sessao, conversa } = await conversaDoSite(s);
    const resposta = await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Informação enviada por engano' });
    const mensagemId = resposta.dados.mensagem.id;
    assert.equal((await s.crm('/api/resumo')).dados.caixas.semResposta, 0);
    let historico = await s.visitante('/widget/mensagens', 'GET', null, sessao.token);
    assert.equal(historico.dados.total, 2);

    fluxo = await s.ouvirWidget(sessao.token);
    const aviso = fluxo.esperar();
    const excluida = await s.crm(`/api/conversas/${conversa.id}/mensagens/${mensagemId}`, 'DELETE');
    assert.equal(excluida.status, 200, JSON.stringify(excluida.dados));
    assert.deepEqual(await aviso, { novidade: 1, origem: 'exclusao' });

    historico = await s.visitante('/widget/mensagens', 'GET', null, sessao.token);
    assert.equal(historico.dados.total, 1);
    assert.equal(historico.dados.mensagens.some((m) => m.id === mensagemId), false);
    const detalhe = await s.crm(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.mensagens.some((m) => m.id === mensagemId), false);
    assert.equal((await s.crm('/api/resumo')).dados.caixas.semResposta, 1, 'badge volta a indicar que o cliente aguarda resposta');

    const auditoria = await s.db.prepare("SELECT * FROM auditoria_eventos WHERE acao = 'mensagem_excluir'").get();
    assert.equal(Number(auditoria.origem_mensagem_id), mensagemId);
    assert.match(auditoria.detalhe, new RegExp(`#${mensagemId}`));
    assert.doesNotMatch(auditoria.detalhe, /Informação enviada por engano/);
  } finally {
    fluxo?.fechar();
    await s.fechar();
  }
});

test('mensagem do site: cliente não pode ser apagado e outro atendente não apaga envio alheio', async () => {
  const s = await subirServidor();
  try {
    const { conversa, mensagemCliente } = await conversaDoSite(s, 'cliente-permissoes');
    assert.equal((await s.crm(`/api/conversas/${conversa.id}/mensagens/${mensagemCliente.id}`, 'DELETE')).status, 400);

    const respostaAdmin = await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Resposta do administrador' });
    await s.db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
      .run('Célia Dias', 'celia@teste.com', gerarHashSenha('outrasenha123'), 'atendente', Date.now());
    const celia = await s.entrar('celia@teste.com', 'outrasenha123');
    const negada = await s.crm(`/api/conversas/${conversa.id}/mensagens/${respostaAdmin.dados.mensagem.id}`, 'DELETE', null, celia);
    assert.equal(negada.status, 403);

    const respostaCelia = await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Resposta da Célia' }, celia);
    assert.equal((await s.crm(`/api/conversas/${conversa.id}/mensagens/${respostaCelia.dados.mensagem.id}`, 'DELETE', null, celia)).status, 200);
    assert.equal((await s.crm(`/api/conversas/${conversa.id}/mensagens/${respostaAdmin.dados.mensagem.id}`, 'DELETE')).status, 200, 'administrador pode excluir envio de outro atendente');
  } finally { await s.fechar(); }
});

test('mensagem: exclusão fica bloqueada em canais externos', async () => {
  const s = await subirServidor();
  try {
    const agora = Date.now();
    const contato = await s.db.prepare('INSERT INTO contatos (nome, telefone) VALUES (?, ?)').run('Cliente WhatsApp', '5511999999999');
    const conversa = await s.db.prepare("INSERT INTO conversas (protocolo, contato_id, canal, status, nao_lidas, criada_em, atualizada_em) VALUES (?, ?, 'whatsapp', 'aberta', 0, ?, ?)")
      .run('EXT-1', Number(contato.lastInsertRowid), agora, agora);
    const mensagem = await s.db.prepare("INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, entrega, criada_em) VALUES (?, 'atendente', 1, ?, 'enviada', ?)")
      .run(Number(conversa.lastInsertRowid), 'Não pode sumir só do CRM', agora);
    const resposta = await s.crm(`/api/conversas/${conversa.lastInsertRowid}/mensagens/${mensagem.lastInsertRowid}`, 'DELETE');
    assert.equal(resposta.status, 400);
    assert.match(resposta.dados.erro, /Chat do site/);
    assert.ok(await s.db.prepare('SELECT id FROM mensagens WHERE id = ?').get(Number(mensagem.lastInsertRowid)));
  } finally { await s.fechar(); }
});

test('mensagem do site: excluir anexo remove também o objeto do armazenamento', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDoSite(s, 'cliente-anexo');
    const enviada = await s.enviarArquivo(conversa.id);
    assert.equal(enviada.status, 201, JSON.stringify(enviada.dados));
    assert.equal(s.arquivos.guardados.size, 1);
    const resposta = await s.crm(`/api/conversas/${conversa.id}/mensagens/${enviada.dados.mensagem.id}`, 'DELETE');
    assert.equal(resposta.status, 200, JSON.stringify(resposta.dados));
    assert.equal(s.arquivos.guardados.size, 0);
  } finally { await s.fechar(); }
});

test('mensagem do site: interface oferece lixeira e confirmação apenas no canal elegível', () => {
  const fs = require('node:fs');
  const tela = fs.readFileSync(path.join(__dirname, '..', 'client/assets/js/atendimento.js'), 'utf8');
  const widget = fs.readFileSync(path.join(__dirname, '..', 'client/assets/js/widget-chat.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'client/assets/css/app.css'), 'utf8');
  assert.match(tela, /conversa\?\.canal === 'widget'/);
  assert.match(tela, /m\?\.tipo === 'atendente'/);
  assert.match(tela, /titulo: 'Excluir mensagem\?'/);
  assert.match(tela, /class: 'btn-excluir-mensagem hov'/);
  assert.match(widget, /buscarMensagens\(false, evento\?\.origem === 'exclusao' \|\| evento\?\.origem === 'edicao'\)/);
  assert.match(css, /\.btn-excluir-mensagem\s*\{/);
});
