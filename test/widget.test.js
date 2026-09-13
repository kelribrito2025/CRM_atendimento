'use strict';

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

async function subirServidor({ segredo = SEGREDO } = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste', comDadosExemplo: false });
  const widget = criarWidget(db, { segredo });
  const app = criarApp(db, { widget, enviador: criarEnviador({ modo: 'silencioso' }), paginasDir: PAGINAS });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const entrar = async () => {
    const r = await fetch(`${base}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN.email, senha: ADMIN.senha }),
    });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };

  // Chamada do lado do cliente final (site), com a chave da conversa.
  const visitante = async (caminho, metodo = 'GET', corpo, token) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-widget-token': token } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  // Chamada do lado do atendente (CRM autenticado).
  const cookie = await entrar();
  const crm = async (caminho, metodo = 'GET', corpo) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  // Abre a sessão como o site do cliente faria: assinando o id no servidor dele.
  const abrirSessao = (dados) => visitante('/widget/sessao', 'POST', {
    ...dados, assinatura: assinar(segredo || SEGREDO, dados.id),
  });

  return { db, base, widget, visitante, abrirSessao, crm, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('chat do site: o arquivo de uma linha e a página do quadro ficam públicos', async () => {
  const s = await subirServidor();
  try {
    const script = await fetch(`${s.base}/widget.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') || '', /javascript/);
    assert.match(await script.text(), /ChatAtendimento/, 'o arquivo precisa expor o comando ChatAtendimento');

    const pagina = await fetch(`${s.base}/widget`);
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /widget-chat\.js/);
    assert.match(pagina.headers.get('content-security-policy') || '', /frame-ancestors/, 'precisa poder abrir dentro do site do cliente');
  } finally { await s.fechar(); }
});

test('chat do site: visitante manda mensagem, atendente responde e o visitante recebe', async () => {
  const s = await subirServidor();
  try {
    const sessao = await s.abrirSessao({ id: 'u-901', nome: 'Carla Menezes', empresa: 'Loja Aurora', pin: '5446' });
    assert.equal(sessao.status, 200, JSON.stringify(sessao.dados));
    const token = sessao.dados.token;
    assert.ok(token && token.length > 20);
    // Só entrar no painel não abre conversa nenhuma no CRM.
    assert.equal(sessao.dados.conversaId, null, 'entrar no painel ainda não é conversa');
    assert.equal((await s.crm('/api/conversas')).dados.conversas.length, 0, 'nada na caixa de entrada ainda');

    // Conversa começa vazia
    assert.deepEqual((await s.visitante('/widget/mensagens', 'GET', null, token)).dados.mensagens, []);

    const enviada = await s.visitante('/widget/mensagens', 'POST', { texto: 'Oi, meu saldo não atualizou.' }, token);
    assert.equal(enviada.status, 201, JSON.stringify(enviada.dados));
    assert.equal(enviada.dados.mensagem.de, 'voce');
    // Agora sim: a conversa nasceu, com protocolo como as outras.
    assert.ok((await s.abrirSessao({ id: 'u-901', nome: 'Carla Menezes' })).dados.protocolo, 'a conversa recebe protocolo como as outras');

    // A conversa aparece na caixa de entrada do CRM, como canal "widget"
    const caixa = await s.crm('/api/conversas');
    const conversa = caixa.dados.conversas.find((c) => c.contato.nome === 'Carla Menezes');
    assert.ok(conversa, 'a conversa do site precisa aparecer no CRM');
    assert.equal(conversa.canal, 'widget');
    assert.equal(conversa.naoLidas, 1);
    assert.equal(conversa.contato.empresa, 'Loja Aurora');
    // o PIN que o site mandou já vem preenchido na ficha do cliente
    assert.equal((await s.crm(`/api/conversas/${conversa.id}`)).dados.conversa.contato.pin, '5446');

    // Atendente responde pelo CRM (sem WhatsApp nem Telegram no meio)
    const resposta = await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Oi Carla, já estou verificando!' });
    assert.equal(resposta.status, 201, JSON.stringify(resposta.dados));
    assert.equal(resposta.dados.erroEnvio, null, 'conversa do site não tenta enviar por canal externo');

    // Nota interna não pode vazar para o cliente
    await s.crm(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Cliente do plano ouro', tipo: 'nota' });

    const tudo = await s.visitante('/widget/mensagens', 'GET', null, token);
    assert.deepEqual(tudo.dados.mensagens.map((m) => [m.de, m.texto]), [
      ['voce', 'Oi, meu saldo não atualizou.'],
      ['atendimento', 'Oi Carla, já estou verificando!'],
    ]);
    assert.equal(tudo.dados.mensagens[1].autor, 'Admin', 'mostra só o primeiro nome do atendente');

    // O `desde` traz só o que é novo
    const novas = await s.visitante(`/widget/mensagens?desde=${tudo.dados.mensagens[1].id}`, 'GET', null, token);
    assert.deepEqual(novas.dados.mensagens, []);
  } finally { await s.fechar(); }
});

test('chat do site: voltar ao painel continua a mesma conversa, sem duplicar cliente', async () => {
  const s = await subirServidor();
  try {
    const a = await s.abrirSessao({ id: 'u-901', nome: 'Carla Menezes' });
    await s.visitante('/widget/mensagens', 'POST', { texto: 'primeira' }, a.dados.token);
    const b = await s.abrirSessao({ id: 'u-901', nome: 'Carla M. Menezes' });

    assert.ok(b.dados.conversaId, 'ao voltar, a sessão já encontra a conversa de antes');
    assert.equal(b.dados.contato.id, a.dados.contato.id, 'mesmo cliente');
    assert.equal(b.dados.contato.nome, 'Carla M. Menezes', 'o nome é atualizado pelo site');
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM contatos').get()).n, 1);
    assert.equal((await s.visitante('/widget/mensagens', 'GET', null, b.dados.token)).dados.mensagens.length, 1);
  } finally { await s.fechar(); }
});

test('chat do site: cada visitante só vê a conversa dele', async () => {
  const s = await subirServidor();
  try {
    const carla = await s.abrirSessao({ id: 'u-901', nome: 'Carla' });
    const bruno = await s.abrirSessao({ id: 'u-902', nome: 'Bruno' });
    await s.visitante('/widget/mensagens', 'POST', { texto: 'segredo da Carla' }, carla.dados.token);

    // O Bruno entrou no painel e não escreveu: não tem conversa nenhuma.
    assert.equal(bruno.dados.conversaId, null);
    assert.deepEqual((await s.visitante('/widget/mensagens', 'GET', null, bruno.dados.token)).dados.mensagens, []);
    // E a conversa da Carla, que escreveu, não é a dele.
    const dela = (await s.abrirSessao({ id: 'u-901', nome: 'Carla' })).dados.conversaId;
    assert.ok(dela);
    assert.notEqual(dela, bruno.dados.conversaId);
    assert.equal((await s.visitante('/widget/mensagens', 'GET', null, 'token-inventado')).status, 401);
    assert.equal((await s.visitante('/widget/mensagens', 'POST', { texto: 'oi' }, 'token-inventado')).status, 401);
    assert.equal((await s.visitante('/widget/mensagens', 'GET')).status, 401);
  } finally { await s.fechar(); }
});

test('chat do site: só entra quem tem a assinatura certa', async () => {
  const s = await subirServidor();
  try {
    assert.equal(s.widget.configurado, true);
    assert.equal((await s.visitante('/widget/sessao', 'POST', { id: 'u-901', nome: 'Carla' })).status, 401, 'sem assinatura não entra');
    assert.equal((await s.visitante('/widget/sessao', 'POST', { id: 'u-901', assinatura: 'errada' })).status, 401);
    assert.equal((await s.visitante('/widget/sessao', 'POST', { id: 'u-901', assinatura: assinar('outro-segredo', 'u-901') })).status, 401);
    // assinatura de outro usuário não serve para se passar por este
    assert.equal((await s.visitante('/widget/sessao', 'POST', { id: 'u-901', assinatura: assinar('segredo-do-site', 'u-902') })).status, 401);

    const ok = await s.visitante('/widget/sessao', 'POST', { id: 'u-901', nome: 'Carla', assinatura: assinar('segredo-do-site', 'u-901') });
    assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  } finally { await s.fechar(); }
});

test('chat do site: mensagem vazia, id ausente e sessão vencida são recusados', async () => {
  const s = await subirServidor();
  try {
    assert.equal((await s.abrirSessao({ nome: 'Sem id' })).status, 400);

    const sessao = await s.abrirSessao({ id: 'u-903', nome: 'Vera' });
    const token = sessao.dados.token;
    assert.equal((await s.visitante('/widget/mensagens', 'POST', { texto: '   ' }, token)).status, 400);

    // texto muito longo é cortado, não quebra
    const longa = await s.visitante('/widget/mensagens', 'POST', { texto: 'a'.repeat(5000) }, token);
    assert.equal(longa.status, 201);
    assert.equal(longa.dados.mensagem.texto.length, 4000);

    // sessão vencida some e a limpeza apaga o registro
    await s.db.prepare('UPDATE widget_sessoes SET expira_em = ?').run(Date.now() - 1000);
    assert.equal((await s.visitante('/widget/mensagens', 'GET', null, token)).status, 401);
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM widget_sessoes').get()).n, 0);
  } finally { await s.fechar(); }
});

test('chat do site: sem widget ligado, as rotas não existem', async () => {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin', comDadosExemplo: false });
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), paginasDir: PAGINAS });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    assert.equal((await fetch(`${base}/widget.js`)).status, 404);
    assert.equal((await fetch(`${base}/widget/mensagens`)).status, 404);
  } finally {
    await new Promise((r) => servidor.close(r));
    await db.fechar();
  }
});

// O caso relatado pelo dev do site: com o servidor sem WIDGET_SEGREDO, o chat
// aceitava qualquer id e entregava a conversa de qualquer cliente a quem soubesse
// o id dele. Agora o chat fica desligado em vez de liberar.
test('chat do site: sem segredo no servidor, ninguém abre conversa nenhuma', async () => {
  const s = await subirServidor({ segredo: '' });
  try {
    assert.equal(s.widget.configurado, false);

    // sem assinatura
    const semAssinatura = await s.visitante('/widget/sessao', 'POST', { id: '999', nome: 'teste', email: 't@t.com' });
    assert.equal(semAssinatura.status, 401, JSON.stringify(semAssinatura.dados));
    assert.equal(semAssinatura.dados.token, undefined, 'não pode devolver chave de conversa');

    // com assinatura inventada
    const inventada = await s.visitante('/widget/sessao', 'POST', { id: '999', nome: 'teste', assinatura: 'naoehumaassinaturavalida'.repeat(3) });
    assert.equal(inventada.status, 401);

    // com uma assinatura feita com qualquer segredo (não há segredo que valha)
    const comSegredo = await s.visitante('/widget/sessao', 'POST', { id: '999', assinatura: assinar('qualquer-segredo', '999') });
    assert.equal(comSegredo.status, 401);

    // e nada foi criado no banco
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM contatos').get()).n, 0);
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM conversas').get()).n, 0);
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM widget_sessoes').get()).n, 0);

    // sem chave de conversa, as mensagens também não abrem
    assert.equal((await s.visitante('/widget/mensagens', 'GET', null, 'inventado')).status, 401);
    assert.equal((await s.visitante('/widget/mensagens', 'POST', { texto: 'oi' }, 'inventado')).status, 401);
  } finally { await s.fechar(); }
});

test('chat do site: a assinatura precisa ser do segredo e do id certos', async () => {
  const s = await subirServidor();
  try {
    const certa = assinar(SEGREDO, 'u-500');
    // um caractere trocado já derruba
    const quaseIgual = `${certa.slice(0, -1)}${certa.at(-1) === 'a' ? 'b' : 'a'}`;
    assert.equal((await s.visitante('/widget/sessao', 'POST', { id: 'u-500', assinatura: quaseIgual })).status, 401);
    // assinatura curta, vazia, nula ou de outro tipo
    for (const assinatura of ['', null, 0, certa.slice(0, 10), `${certa}extra`, { a: 1 }]) {
      assert.equal((await s.visitante('/widget/sessao', 'POST', { id: 'u-500', assinatura })).status, 401, `aceitou ${JSON.stringify(assinatura)}`);
    }
    assert.equal((await s.visitante('/widget/sessao', 'POST', { id: 'u-500', assinatura: certa })).status, 200);
  } finally { await s.fechar(); }
});

test('chat do site: só entrar no painel não cria conversa; escrever cria', async () => {
  const s = await subirServidor();
  try {
    // Dez pessoas abrem a dashboard e não falam nada.
    const tokens = [];
    for (let i = 0; i < 10; i += 1) {
      const r = await s.abrirSessao({ id: `visita-${i}`, nome: `Pessoa ${i}` });
      tokens.push(r.dados.token);
      assert.equal(r.dados.conversaId, null);
    }
    assert.equal((await s.crm('/api/conversas')).dados.conversas.length, 0, 'caixa de entrada limpa');
    // Os contatos ficam guardados: é a mesma pessoa se ela voltar.
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM contatos').get()).n, 10);

    // Uma delas escreve.
    await s.visitante('/widget/mensagens', 'POST', { texto: 'Preciso de ajuda' }, tokens[3]);
    const caixa = await s.crm('/api/conversas');
    assert.equal(caixa.dados.conversas.length, 1, 'só a conversa de quem falou');
    assert.equal(caixa.dados.conversas[0].contato.nome, 'Pessoa 3');

    // Recarregar a página continua na mesma conversa, sem criar outra.
    const devolta = await s.abrirSessao({ id: 'visita-3', nome: 'Pessoa 3' });
    assert.equal(devolta.dados.conversaId, caixa.dados.conversas[0].id);
    await s.visitante('/widget/mensagens', 'POST', { texto: 'ainda estou aqui' }, devolta.dados.token);
    assert.equal((await s.crm('/api/conversas')).dados.conversas.length, 1);
  } finally { await s.fechar(); }
});

test('chat do site: conversas vazias de antes somem na atualização', async () => {
  const s = await subirServidor();
  try {
    const { proximoProtocolo } = require('../src/canais');
    const agora = Date.now();
    // Simula o banco antigo: um cliente com conversa vazia e outro com conversa de verdade.
    const vazio = await s.db.prepare('INSERT INTO contatos (nome, site_id) VALUES (?, ?)').run('Só passou', 'antigo-1');
    const falante = await s.db.prepare('INSERT INTO contatos (nome, site_id) VALUES (?, ?)').run('Escreveu', 'antigo-2');
    const criarConversa = async (contatoId) => {
      const r = await s.db.prepare(`INSERT INTO conversas (protocolo, contato_id, canal, status, nao_lidas, criada_em, atualizada_em)
        VALUES (?, ?, 'widget', 'aberta', 0, ?, ?)`).run(await proximoProtocolo(s.db), contatoId, agora, agora);
      return Number(r.lastInsertRowid);
    };
    const conversaVazia = await criarConversa(Number(vazio.lastInsertRowid));
    const conversaCheia = await criarConversa(Number(falante.lastInsertRowid));
    await s.db.prepare('INSERT INTO mensagens (conversa_id, tipo, texto, criada_em) VALUES (?, ?, ?, ?)')
      .run(conversaCheia, 'cliente', 'oi', agora);

    // Roda a atualização de novo, como faria ao subir a versão nova.
    await s.db.prepare('DELETE FROM ajustes WHERE chave = ?').run('widget_conversa_sob_demanda');
    await require('../src/db').migrar(s.db);

    assert.equal(await s.db.prepare('SELECT id FROM conversas WHERE id = ?').get(conversaVazia), undefined, 'a vazia some');
    assert.ok(await s.db.prepare('SELECT id FROM conversas WHERE id = ?').get(conversaCheia), 'a que tem mensagem fica');
    // Ninguém perde o cadastro do cliente.
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM contatos').get()).n, 2);
  } finally { await s.fechar(); }
});
