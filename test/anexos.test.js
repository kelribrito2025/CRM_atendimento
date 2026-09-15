'use strict';

// Anexo enviado pelo atendente, conversa resolvida que volta no mesmo histórico
// e o nome do atendente que respondeu por último.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const canais = require('../src/canais');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');

test('anexo: colar imagem no campo prepara o arquivo e preserva a colagem de texto', () => {
  const tela = fs.readFileSync(path.join(__dirname, '..', 'client/assets/js/atendimento.js'), 'utf8');
  assert.match(tela, /evento\.clipboardData\?\.items/);
  assert.match(tela, /i\.kind === 'file'.*startsWith\('image\/'\)/);
  assert.match(tela, /evento\.preventDefault\(\);\s*enviarAnexo\(nomearImagemColada\(imagem\)\)/);
  assert.match(tela, /`imagem-colada-\$\{Date\.now\(\)\}\.\$\{extensao\}`/);
  assert.match(tela, /onpaste: \(e\) => colarNoCompositor\(e, textarea, modoNota\)/);
  assert.match(tela, /Enviar arquivo ou colar imagem com Ctrl\+V/);
  assert.match(tela, /setTimeout\(\(\) => \{\s*if \(acentosLigados\)/, 'sem imagem, a colagem de texto continua sendo tratada');
});

// Armazenamento de arquivos de mentira, no lugar do S3.
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
    async apagar(chave) { return guardados.delete(chave); },
    urlAssinada: (chave) => `https://exemplo-s3/${encodeURIComponent(chave)}?assinatura=abc`,
  };
}

function uazapiFalso(chamadas) {
  return {
    configurado: true,
    async enviarTexto(token, numero, texto) { chamadas.push(['texto', numero, texto]); return { messageid: `S-${chamadas.length}` }; },
    async enviarMidia(token, numero, dados) { chamadas.push(['midia', numero, dados]); return { messageid: `S-${chamadas.length}` }; },
  };
}

async function subirServidor({ arquivos = arquivosFalsos(), chamadas = [] } = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Kely Ribeiro', comDadosExemplo: false });
  const uazapi = uazapiFalso(chamadas);
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), uazapi, arquivos, baseUrl: 'https://crm.exemplo.com.br' });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const entrar = async (email, senha) => {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };
  const cookie = await entrar(ADMIN.email, ADMIN.senha);
  const chamar = async (caminho, metodo = 'GET', corpo, ck = cookie) => {
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };
  const enviarArquivo = async (conversaId, { bytes = PNG, nome = 'comprovante.png', mime = 'image/png' } = {}, ck = cookie) => {
    const r = await fetch(`${base}/api/conversas/${conversaId}/anexos`, {
      method: 'POST',
      headers: { Cookie: ck, 'Content-Type': mime, 'x-nome-arquivo': encodeURIComponent(nome) },
      body: bytes,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  return { db, base, arquivos, chamadas, cookie, entrar, chamar, enviarArquivo, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

// Cria um canal e faz o cliente mandar a primeira mensagem.
async function conversaDeWhatsapp(s, { nome = 'Cliente Teste', numero = '5531988887777' } = {}) {
  const agora = Date.now();
  await s.db.prepare("INSERT INTO canais (tipo, nome, instancia_id, instancia_token, status, webhook_segredo, criado_em, atualizado_em) VALUES ('whatsapp', 'Bigteck', 'i1', 'tok', 'connected', ?, ?, ?)")
    .run(`${Math.random().toString(16).slice(2)}`.padEnd(32, '0').slice(0, 32), agora, agora);
  const canal = await s.db.prepare('SELECT * FROM canais ORDER BY id DESC LIMIT 1').get();
  // `quando` deixa a ordem previsível no teste (o WhatsApp manda a hora em segundos).
  const evento = (texto, id, quando = Date.now()) => canais.processarEvento(s.db, canal, {
    EventType: 'messages',
    message: { messageid: id, chatid: `${numero}@s.whatsapp.net`, fromMe: false, messageType: 'text', text: texto, senderName: nome, messageTimestamp: Math.floor(quando / 1000) },
  });
  await evento('Oi, preciso de ajuda', `E1-${numero}`, Date.now() - 60_000);
  const lista = await s.chamar(`/api/conversas?q=${encodeURIComponent(nome)}`);
  return { canal, evento, conversa: lista.dados.conversas[0] };
}

test('anexo: o atendente envia um arquivo e o cliente recebe pelo canal', async () => {
  const s = await subirServidor();
  try {
    const { conversa, canal } = await conversaDeWhatsapp(s);

    const r = await s.enviarArquivo(conversa.id);
    assert.equal(r.status, 201, JSON.stringify(r.dados));
    assert.equal(r.dados.erroEnvio, null);
    assert.equal(r.dados.mensagem.tipo, 'atendente');
    assert.equal(r.dados.mensagem.entrega, 'enviada');
    assert.deepEqual(
      { tipo: r.dados.mensagem.midia.tipo, nome: r.dados.mensagem.midia.nome, url: r.dados.mensagem.midia.url },
      { tipo: 'imagem', nome: 'comprovante.png', url: `/api/midia/${r.dados.mensagem.id}` },
    );

    // o arquivo foi guardado e o canal recebeu um endereço temporário, não o arquivo
    assert.equal(s.arquivos.guardados.size, 1);
    const envio = s.chamadas.find((c) => c[0] === 'midia');
    assert.equal(envio[1], '5531988887777');
    assert.equal(envio[2].tipo, 'image');
    assert.match(envio[2].url, /^https:\/\/exemplo-s3\//);
    assert.equal(envio[2].nome, 'comprovante.png');

    // a tela busca o arquivo pela rota autenticada, sem ver o endereço do bucket
    const midia = await fetch(`${s.base}${r.dados.mensagem.midia.url}`, { headers: { Cookie: s.cookie } });
    assert.equal(midia.status, 200);
    assert.equal(midia.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await midia.arrayBuffer()).length, PNG.length);

    // sem sessão ninguém baixa
    assert.equal((await fetch(`${s.base}${r.dados.mensagem.midia.url}`)).status, 401);
    void canal;
  } finally { await s.fechar(); }
});

test('anexo: nome com acento, tipo pelo conteúdo e limites', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s);

    const doc = await s.enviarArquivo(conversa.id, { bytes: Buffer.from('conteudo'), nome: 'Relatório de março.pdf', mime: 'application/pdf' });
    assert.equal(doc.status, 201);
    assert.equal(doc.dados.mensagem.midia.nome, 'Relatório de março.pdf');
    assert.equal(doc.dados.mensagem.midia.tipo, 'documento');
    assert.equal(s.chamadas.at(-1)[2].tipo, 'document');

    // arquivo vazio não passa
    const vazio = await fetch(`${s.base}/api/conversas/${conversa.id}/anexos`, {
      method: 'POST', headers: { Cookie: s.cookie, 'Content-Type': 'image/png', 'x-nome-arquivo': 'v.png' }, body: Buffer.alloc(0),
    });
    assert.equal(vazio.status, 400);

    // conversa que não existe
    assert.equal((await s.enviarArquivo(999999)).status, 404);
  } finally { await s.fechar(); }
});

test('anexo: sem armazenamento configurado, o CRM avisa em vez de falhar calado', async () => {
  const s = await subirServidor({ arquivos: { configurado: false } });
  try {
    const { conversa } = await conversaDeWhatsapp(s);
    const r = await s.enviarArquivo(conversa.id);
    assert.equal(r.status, 400);
    assert.match(r.dados.erro, /anexos indispon/i);
    assert.equal((await s.chamar('/api/resumo')).dados.anexosAtivos, false);
  } finally { await s.fechar(); }
});

test('conversa resolvida: nova mensagem do cliente volta no mesmo histórico', async () => {
  const s = await subirServidor();
  try {
    const { conversa, evento } = await conversaDeWhatsapp(s);
    await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Resolvido por aqui!' });
    const resolvida = await s.chamar(`/api/conversas/${conversa.id}/status`, 'POST', { status: 'resolvida' });
    assert.equal(resolvida.dados.conversa.status, 'resolvida');

    // o mesmo cliente escreve de novo
    await evento('Voltei, tenho outra dúvida', 'E2', Date.now() + 60_000);

    const lista = await s.chamar('/api/conversas?q=Cliente%20Teste');
    assert.equal(lista.dados.conversas.length, 1, 'não pode abrir uma segunda conversa para o mesmo cliente');
    assert.equal(lista.dados.conversas[0].id, conversa.id, 'é a mesma conversa de antes');
    assert.equal(lista.dados.conversas[0].status, 'aberta', 'a conversa reabre sozinha');

    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.deepEqual(detalhe.dados.conversa.mensagens.map((m) => m.texto), [
      'Oi, preciso de ajuda', 'Resolvido por aqui!', 'Voltei, tenho outra dúvida',
    ], 'o histórico continua inteiro');
    assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM conversas').get()).n, 1);
  } finally { await s.fechar(); }
});

test('atendente: o selo da conversa mostra quem respondeu por último', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s);
    // segundo atendente
    const senha = 'outrasenha123';
    const { gerarHashSenha } = require('../src/senha');
    await s.db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
      .run('Bruno Alves', 'bruno@teste.com', gerarHashSenha(senha), 'atendente', Date.now());
    const cookieBruno = await s.entrar('bruno@teste.com', senha);

    await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Oi, sou a Kely' });
    let lista = await s.chamar('/api/conversas?q=Cliente%20Teste');
    assert.equal(lista.dados.conversas[0].atendente.nomeCurto, 'Kely R.');

    // o outro atendente entra e responde: o selo passa a ser dele
    await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Bom dia, sou o Bruno' }, cookieBruno);
    lista = await s.chamar('/api/conversas?q=Cliente%20Teste');
    assert.equal(lista.dados.conversas[0].atendente.nomeCurto, 'Bruno A.');

    // e cada mensagem guarda o nome de quem escreveu
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.deepEqual(
      detalhe.dados.conversa.mensagens.filter((m) => m.tipo === 'atendente').map((m) => m.autor.nomeCurto),
      ['Kely R.', 'Bruno A.'],
    );

    // um anexo também passa a conversa para quem enviou
    await s.enviarArquivo(conversa.id);
    lista = await s.chamar('/api/conversas?q=Cliente%20Teste');
    assert.equal(lista.dados.conversas[0].atendente.nomeCurto, 'Kely R.');
  } finally { await s.fechar(); }
});

test('nota interna: quem escreveu pode editar e apagar; os outros não', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s);
    const senha = 'outrasenha123';
    const { gerarHashSenha } = require('../src/senha');
    await s.db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
      .run('Bruno Alves', 'bruno@teste.com', gerarHashSenha(senha), 'atendente', Date.now());
    const cookieBruno = await s.entrar('bruno@teste.com', senha);

    // o Bruno escreve a nota
    const criada = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Cliente do plano ouro', tipo: 'nota' }, cookieBruno);
    assert.equal(criada.status, 201);
    const notaId = criada.dados.mensagem.id;
    assert.equal(criada.dados.mensagem.editadaEm, null);

    // ele mesmo edita
    const editada = await s.chamar(`/api/notas/${notaId}`, 'PATCH', { texto: 'Cliente do plano ouro desde 2021' }, cookieBruno);
    assert.equal(editada.status, 200, JSON.stringify(editada.dados));
    assert.equal(editada.dados.mensagem.texto, 'Cliente do plano ouro desde 2021');
    assert.ok(editada.dados.mensagem.editadaEm, 'a nota fica marcada como editada');

    // nota vazia não passa
    assert.equal((await s.chamar(`/api/notas/${notaId}`, 'PATCH', { texto: '   ' }, cookieBruno)).status, 400);

    // uma mensagem normal não pode ser editada por esta rota
    const resposta = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Oi!' }, cookieBruno);
    assert.equal((await s.chamar(`/api/notas/${resposta.dados.mensagem.id}`, 'PATCH', { texto: 'trocado' }, cookieBruno)).status, 404);

    // o administrador também pode mexer
    const doAdmin = await s.chamar(`/api/notas/${notaId}`, 'PATCH', { texto: 'Plano ouro · conferido' });
    assert.equal(doAdmin.status, 200);

    // e apagar some com a nota, sem levar o resto da conversa junto
    assert.equal((await s.chamar(`/api/notas/${notaId}`, 'DELETE', null, cookieBruno)).status, 200);
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.mensagens.filter((m) => m.tipo === 'nota').length, 0);
    assert.equal(detalhe.dados.conversa.mensagens.length, 2, 'a mensagem do cliente e a resposta continuam lá');
    assert.equal((await s.chamar(`/api/notas/${notaId}`, 'DELETE')).status, 404);
  } finally { await s.fechar(); }
});

test('nota interna: atendente não mexe na nota de outro atendente', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s);
    const { gerarHashSenha } = require('../src/senha');
    for (const [nome, email] of [['Bruno Alves', 'bruno@teste.com'], ['Célia Dias', 'celia@teste.com']]) {
      await s.db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
        .run(nome, email, gerarHashSenha('outrasenha123'), 'atendente', Date.now());
    }
    const bruno = await s.entrar('bruno@teste.com', 'outrasenha123');
    const celia = await s.entrar('celia@teste.com', 'outrasenha123');

    const criada = await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Nota do Bruno', tipo: 'nota' }, bruno);
    const notaId = criada.dados.mensagem.id;
    assert.equal((await s.chamar(`/api/notas/${notaId}`, 'PATCH', { texto: 'mexido' }, celia)).status, 403);
    assert.equal((await s.chamar(`/api/notas/${notaId}`, 'DELETE', null, celia)).status, 403);
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.mensagens.find((m) => m.tipo === 'nota').texto, 'Nota do Bruno');
  } finally { await s.fechar(); }
});

test('equipes: o CRM passa a ter também a equipe Prioridade', async () => {
  const s = await subirServidor();
  try {
    const nomes = (await s.chamar('/api/resumo')).dados.equipes.map((e) => e.nome);
    assert.deepEqual(nomes, ['Reembolso', 'Admin', 'Prioridade']);
  } finally { await s.fechar(); }
});

test('histórico: a conversa abre com as últimas mensagens e as antigas chegam depois', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s);
    // 100 mensagens antigas, em ordem
    // todas depois da primeira mensagem da conversa (que é de um minuto atrás)
    const base = Date.now() - 59_000;
    for (let i = 1; i <= 100; i++) {
      await s.db.prepare("INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, criada_em) VALUES (?, 'cliente', NULL, ?, ?)")
        .run(conversa.id, `mensagem ${i}`, base + i * 500);
    }

    // abre: só as 40 últimas
    const aberta = await s.chamar(`/api/conversas/${conversa.id}`);
    const primeiras = aberta.dados.conversa.mensagens;
    assert.equal(primeiras.length, 40);
    assert.equal(aberta.dados.conversa.temMaisMensagens, true);
    assert.equal(primeiras.at(-1).texto, 'mensagem 100', 'a última da tela é a mais recente');
    assert.equal(primeiras[0].texto, 'mensagem 61');

    // sobe a rolagem: chegam as 40 anteriores
    const maisAntiga = primeiras[0];
    const pagina2 = await s.chamar(`/api/conversas/${conversa.id}/mensagens?antes=${maisAntiga.id}&antesEm=${maisAntiga.criadaEm}`);
    assert.equal(pagina2.status, 200, JSON.stringify(pagina2.dados));
    assert.equal(pagina2.dados.mensagens.length, 40);
    assert.equal(pagina2.dados.temMais, true);
    assert.equal(pagina2.dados.mensagens.at(-1).texto, 'mensagem 60', 'emenda exatamente onde a tela parou');
    assert.equal(pagina2.dados.mensagens[0].texto, 'mensagem 21');

    // sobe de novo: chega o começo da conversa e acaba
    const antiga2 = pagina2.dados.mensagens[0];
    const pagina3 = await s.chamar(`/api/conversas/${conversa.id}/mensagens?antes=${antiga2.id}&antesEm=${antiga2.criadaEm}`);
    assert.equal(pagina3.dados.temMais, false, 'não há mais histórico para buscar');
    assert.equal(pagina3.dados.mensagens.at(-1).texto, 'mensagem 20');
    assert.equal(pagina3.dados.mensagens[0].texto, 'Oi, preciso de ajuda', 'a primeira mensagem da conversa');

    // nenhuma mensagem se repete nem some
    const tudo = [...pagina3.dados.mensagens, ...pagina2.dados.mensagens, ...primeiras];
    assert.equal(tudo.length, 101);
    assert.equal(new Set(tudo.map((m) => m.id)).size, 101);

    // pedido sem referência é recusado
    assert.equal((await s.chamar(`/api/conversas/${conversa.id}/mensagens`)).status, 400);
  } finally { await s.fechar(); }
});

test('histórico: conversa curta abre inteira, sem pedir mais nada', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s);
    const aberta = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(aberta.dados.conversa.mensagens.length, 1);
    assert.equal(aberta.dados.conversa.temMaisMensagens, false);
  } finally { await s.fechar(); }
});

test('encerrar pelo card: a conversa sai de Minhas e volta com o histórico', async () => {
  const s = await subirServidor();
  try {
    const { conversa, evento } = await conversaDeWhatsapp(s);
    await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Resolvido!' });
    assert.equal((await s.chamar('/api/conversas?caixa=minhas')).dados.conversas.length, 1);

    const encerrada = await s.chamar(`/api/conversas/${conversa.id}/status`, 'POST', { status: 'resolvida' });
    assert.equal(encerrada.status, 200);
    assert.equal(encerrada.dados.conversa.status, 'resolvida');
    assert.deepEqual((await s.chamar('/api/conversas?caixa=minhas')).dados.conversas, [], 'some da lista Minhas');
    assert.equal((await s.chamar('/api/resumo')).dados.caixas.minhas, 0);
    // também sai de "Todas": encerrada fica guardada em "Encerradas"
    assert.deepEqual((await s.chamar('/api/conversas')).dados.conversas, [], 'some também de Todas');
    assert.equal((await s.chamar('/api/conversas?caixa=encerradas')).dados.conversas.length, 1);
    // mas a busca continua achando, para ver o histórico do cliente
    assert.equal((await s.chamar('/api/conversas?q=Cliente%20Teste')).dados.conversas.length, 1);

    // o mesmo cliente volta: mesma conversa, histórico inteiro
    await evento('Voltei!', 'E9', Date.now() + 60_000);
    const detalhe = await s.chamar(`/api/conversas/${conversa.id}`);
    assert.equal(detalhe.dados.conversa.status, 'aberta');
    assert.deepEqual(detalhe.dados.conversa.mensagens.map((m) => m.texto), ['Oi, preciso de ajuda', 'Resolvido!', 'Voltei!']);
  } finally { await s.fechar(); }
});

test('caixa Encerradas: guarda o que foi encerrado e tira das outras caixas', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s);
    await s.chamar(`/api/conversas/${conversa.id}/mensagens`, 'POST', { texto: 'Pronto!' });

    // enquanto está aberta, não aparece em Encerradas
    assert.deepEqual((await s.chamar('/api/conversas?caixa=encerradas')).dados.conversas, []);
    assert.equal((await s.chamar('/api/resumo')).dados.caixas.encerradas, 0);

    await s.chamar(`/api/conversas/${conversa.id}/status`, 'POST', { status: 'resolvida' });

    const encerradas = await s.chamar('/api/conversas?caixa=encerradas');
    assert.deepEqual(encerradas.dados.conversas.map((c) => c.id), [conversa.id]);
    assert.equal((await s.chamar('/api/resumo')).dados.caixas.encerradas, 1);
    assert.deepEqual((await s.chamar('/api/conversas?caixa=minhas')).dados.conversas, []);
    assert.deepEqual((await s.chamar('/api/conversas?caixa=sem_resposta')).dados.conversas, []);

    // reabrir tira de Encerradas
    await s.chamar(`/api/conversas/${conversa.id}/status`, 'POST', { status: 'aberta' });
    assert.deepEqual((await s.chamar('/api/conversas?caixa=encerradas')).dados.conversas, []);
    assert.equal((await s.chamar('/api/conversas?caixa=minhas')).dados.conversas.length, 1);
  } finally { await s.fechar(); }
});

test('conversa encerrada sai de "Todas" e só a busca ainda encontra', async () => {
  const s = await subirServidor();
  try {
    const { conversa } = await conversaDeWhatsapp(s, { nome: 'Ana Prado', numero: '5531977776666' });
    const outra = await conversaDeWhatsapp(s, { nome: 'Beto Lima', numero: '5531955554444' });

    assert.equal((await s.chamar('/api/conversas')).dados.conversas.length, 2);
    await s.chamar(`/api/conversas/${conversa.id}/status`, 'POST', { status: 'resolvida' });

    const todas = await s.chamar('/api/conversas');
    assert.deepEqual(todas.dados.conversas.map((c) => c.id), [outra.conversa.id], 'só a que ficou aberta');
    assert.equal((await s.chamar('/api/resumo')).dados.caixas.todas, 1);

    // a busca pelo nome ainda traz a encerrada
    const busca = await s.chamar('/api/conversas?q=Ana');
    assert.deepEqual(busca.dados.conversas.map((c) => c.status), ['resolvida']);

    // reabrindo, volta para Todas
    await s.chamar(`/api/conversas/${conversa.id}/status`, 'POST', { status: 'aberta' });
    assert.equal((await s.chamar('/api/conversas')).dados.conversas.length, 2);
  } finally { await s.fechar(); }
});

test('inbox por canal: cada cliente cai na caixa da plataforma em que escreveu', async () => {
  const s = await subirServidor();
  try {
    const wa = await conversaDeWhatsapp(s, { nome: 'Ana Prado', numero: '5531977776666' });

    // conversa do chat do site
    const { criarWidget } = require('../src/widget');
    const widget = criarWidget(s.db, {});
    const sessao = await widget.abrirSessao({ id: 'u-55', nome: 'Beto do Site' });
    await widget.enviarMensagem(await widget.sessaoDoToken(sessao.token), 'Oi pelo site');

    const contagens = (await s.chamar('/api/resumo')).dados.porCanal;
    assert.deepEqual(contagens, { whatsapp: 1, telegram: 0, widget: 1 });

    const soWa = await s.chamar('/api/conversas?canal=whatsapp');
    assert.deepEqual(soWa.dados.conversas.map((c) => c.contato.nome), ['Ana Prado']);

    const soSite = await s.chamar('/api/conversas?canal=widget');
    assert.deepEqual(soSite.dados.conversas.map((c) => c.contato.nome), ['Beto do Site']);

    assert.deepEqual((await s.chamar('/api/conversas?canal=telegram')).dados.conversas, []);
    // canal inventado é ignorado: mostra tudo
    assert.equal((await s.chamar('/api/conversas?canal=fax')).dados.conversas.length, 2);

    // encerrar tira da contagem do canal
    await s.chamar(`/api/conversas/${wa.conversa.id}/status`, 'POST', { status: 'resolvida' });
    assert.equal((await s.chamar('/api/resumo')).dados.porCanal.whatsapp, 0);
    assert.deepEqual((await s.chamar('/api/conversas?canal=whatsapp')).dados.conversas, []);
  } finally { await s.fechar(); }
});
