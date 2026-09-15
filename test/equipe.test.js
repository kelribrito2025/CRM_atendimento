'use strict';

// Configurações › Equipe: convidar, mudar papel, bloquear acesso e equipes.

const test = require('node:test');
const assert = require('node:assert/strict');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { gerarHashSenha } = require('../src/senha');
const { criarAvisos } = require('../src/eventos');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };

async function subirServidor(opcoes = {}) {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Kely Ribeiro', comDadosExemplo: false });
  const enviador = criarEnviador({ modo: 'silencioso' });
  const app = criarApp(db, { enviador, baseUrl: 'https://crm.exemplo.com.br', ...opcoes });
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
  const criarPessoa = async (nome, email, papel = 'atendente') => {
    await db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
      .run(nome, email, gerarHashSenha('outrasenha123'), papel, Date.now());
    return (await db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)).id;
  };

  return { db, base, enviador, cookie, entrar, chamar, criarPessoa, fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); } };
}

test('equipe: lista quem trabalha no CRM, com papel, equipes e presença', async () => {
  const s = await subirServidor();
  try {
    const r = await s.chamar('/api/equipe');
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.usuarios.length, 1);
    assert.deepEqual(
      { nome: r.dados.usuarios[0].nome, papel: r.dados.usuarios[0].papel, ativo: r.dados.usuarios[0].ativo },
      { nome: 'Kely Ribeiro', papel: 'admin', ativo: true },
    );
    assert.deepEqual(r.dados.equipes.map((e) => e.nome), ['Reembolso', 'Admin', 'Prioridade']);
    assert.deepEqual(r.dados.convites, []);
  } finally { await s.fechar(); }
});

test('inbox da equipe: administrador cria com nome e cor e ela aparece vazia no resumo', async () => {
  const avisos = criarAvisos();
  const eventos = [];
  avisos.assinar((evento) => eventos.push(evento));
  const s = await subirServidor({ avisos });
  try {
    const criada = await s.chamar('/api/equipe/inboxes', 'POST', { nome: '  Financeiro   VIP  ', cor: '#a1b2c3' });
    assert.equal(criada.status, 201, JSON.stringify(criada.dados));
    assert.deepEqual(
      { nome: criada.dados.equipe.nome, cor: criada.dados.equipe.cor, abertas: criada.dados.equipe.abertas, membros: criada.dados.equipe.membros },
      { nome: 'Financeiro VIP', cor: '#A1B2C3', abertas: 0, membros: [] },
    );

    const resumo = await s.chamar('/api/resumo');
    const inbox = resumo.dados.equipes.find((e) => Number(e.id) === Number(criada.dados.equipe.id));
    assert.deepEqual(
      { nome: inbox.nome, cor: inbox.cor, abertas: inbox.abertas, semResposta: inbox.semResposta, membros: inbox.membros },
      { nome: 'Financeiro VIP', cor: '#A1B2C3', abertas: 0, semResposta: 0, membros: [] },
    );
    assert.equal(resumo.dados.equipes.at(-1).nome, 'Financeiro VIP', 'a nova inbox entra depois das existentes');
    assert.ok((await s.chamar('/api/equipe')).dados.equipes.some((e) => e.nome === 'Financeiro VIP'));
    assert.deepEqual(eventos.at(-1), { origem: 'equipe_criada', equipeId: criada.dados.equipe.id });
  } finally { await s.fechar(); }
});

test('inbox da equipe: recusa nome repetido, reservado ou inválido e cor inválida', async () => {
  const s = await subirServidor();
  try {
    assert.equal((await s.chamar('/api/equipe/inboxes', 'POST', { nome: 'Financeiro', cor: '#123ABC' })).status, 201);
    assert.equal((await s.chamar('/api/equipe/inboxes', 'POST', { nome: 'financeiro', cor: '#654321' })).status, 409);
    assert.equal((await s.chamar('/api/equipe/inboxes', 'POST', { nome: 'Admin', cor: '#654321' })).status, 400);
    assert.equal((await s.chamar('/api/equipe/inboxes', 'POST', { nome: 'A', cor: '#654321' })).status, 400);
    assert.equal((await s.chamar('/api/equipe/inboxes', 'POST', { nome: 'x'.repeat(61), cor: '#654321' })).status, 400);
    assert.equal((await s.chamar('/api/equipe/inboxes', 'POST', { nome: 'Suporte', cor: 'verde' })).status, 400);
  } finally { await s.fechar(); }
});

test('equipe: convidar por e-mail gera link, aparece na lista e dá para cancelar', async () => {
  const s = await subirServidor();
  try {
    const equipes = (await s.chamar('/api/equipe')).dados.equipes;
    const convite = await s.chamar('/api/equipe/convites', 'POST', { email: 'Bruno@Teste.com', papel: 'atendente', equipeIds: [equipes[0].id] });
    assert.equal(convite.status, 201, JSON.stringify(convite.dados));
    assert.match(convite.dados.link, /^https:\/\/crm\.exemplo\.com\.br\/convite\?token=[A-Za-z0-9_-]+$/);

    // o e-mail saiu com o link dentro
    const email = s.enviador.enviados.at(-1);
    assert.equal(email.para, 'bruno@teste.com');
    assert.ok(email.texto.includes(convite.dados.link));

    const lista = (await s.chamar('/api/equipe')).dados;
    assert.equal(lista.convites.length, 1);
    assert.equal(lista.convites[0].email, 'bruno@teste.com');
    assert.deepEqual(lista.convites[0].equipeIds, [equipes[0].id]);

    // o link funciona de verdade: a pessoa cria a senha e entra
    const token = convite.dados.link.split('token=')[1];
    const criada = await fetch(`${s.base}/acesso/convite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, nome: 'Bruno Alves', senha: 'SenhaForte123', aceito: true }),
    });
    assert.equal(criada.status, 201);
    const depois = (await s.chamar('/api/equipe')).dados;
    assert.equal(depois.convites.length, 0, 'convite usado sai da lista');
    assert.deepEqual(depois.usuarios.map((u) => u.nome).sort(), ['Bruno Alves', 'Kely Ribeiro']);
    assert.deepEqual(depois.usuarios.find((u) => u.nome === 'Bruno Alves').equipes.map((e) => e.nome), ['Reembolso']);
  } finally { await s.fechar(); }
});

test('equipe: convite recusa e-mail inválido, repetido e equipe que não existe', async () => {
  const s = await subirServidor();
  try {
    assert.equal((await s.chamar('/api/equipe/convites', 'POST', { email: 'nao-e-email' })).status, 400);
    assert.equal((await s.chamar('/api/equipe/convites', 'POST', { email: ADMIN.email })).status, 409);
    assert.equal((await s.chamar('/api/equipe/convites', 'POST', { email: 'x@y.com', equipeIds: [9999] })).status, 400);

    const criado = await s.chamar('/api/equipe/convites', 'POST', { email: 'ok@teste.com' });
    assert.equal(criado.status, 201);
    const id = (await s.chamar('/api/equipe')).dados.convites[0].id;
    assert.equal((await s.chamar(`/api/equipe/convites/${id}`, 'DELETE')).status, 200);
    assert.deepEqual((await s.chamar('/api/equipe')).dados.convites, []);
    assert.equal((await s.chamar(`/api/equipe/convites/${id}`, 'DELETE')).status, 404);
  } finally { await s.fechar(); }
});

test('equipe: muda papel, equipes e bloqueia o acesso de alguém', async () => {
  const s = await subirServidor();
  try {
    const id = await s.criarPessoa('Bruno Alves', 'bruno@teste.com');
    const equipes = (await s.chamar('/api/equipe')).dados.equipes;

    const comEquipes = await s.chamar(`/api/equipe/usuarios/${id}`, 'PATCH', { equipeIds: [equipes[0].id, equipes[2].id] });
    assert.equal(comEquipes.status, 200, JSON.stringify(comEquipes.dados));
    assert.deepEqual(comEquipes.dados.usuario.equipes.map((e) => e.nome), ['Reembolso', 'Prioridade']);

    assert.equal((await s.chamar(`/api/equipe/usuarios/${id}`, 'PATCH', { papel: 'admin' })).dados.usuario.papel, 'admin');

    // bloquear derruba a sessão da pessoa
    const dele = await s.entrar('bruno@teste.com', 'outrasenha123');
    assert.equal((await s.chamar('/api/resumo', 'GET', null, dele)).status, 200);
    assert.equal((await s.chamar(`/api/equipe/usuarios/${id}`, 'PATCH', { ativo: false })).dados.usuario.ativo, false);
    assert.equal((await s.chamar('/api/resumo', 'GET', null, dele)).status, 401, 'quem foi bloqueado perde a sessão');

    assert.equal((await s.chamar('/api/equipe/usuarios/9999', 'PATCH', { papel: 'admin' })).status, 404);
  } finally { await s.fechar(); }
});

test('equipe: administrador edita o próprio nome e o nome de outro atendente', async () => {
  const s = await subirServidor();
  try {
    const eu = (await s.chamar('/api/me')).dados.usuario.id;
    const outro = await s.criarPessoa('Bruno Alves', 'bruno@teste.com');

    const meuNome = await s.chamar(`/api/equipe/usuarios/${eu}`, 'PATCH', { nome: '  Kely   Brito  ' });
    assert.equal(meuNome.status, 200, JSON.stringify(meuNome.dados));
    assert.equal(meuNome.dados.usuario.nome, 'Kely Brito');
    assert.equal((await s.chamar('/api/resumo')).dados.usuario.nome, 'Kely Brito');

    const outroNome = await s.chamar(`/api/equipe/usuarios/${outro}`, 'PATCH', { nome: 'Bruno Cardoso' });
    assert.equal(outroNome.status, 200, JSON.stringify(outroNome.dados));
    assert.equal(outroNome.dados.usuario.nome, 'Bruno Cardoso');
    assert.equal((await s.chamar('/api/equipe')).dados.usuarios.find((u) => Number(u.id) === Number(outro)).nome, 'Bruno Cardoso');

    for (const nome of ['', 'A', 'x'.repeat(121)]) {
      assert.equal((await s.chamar(`/api/equipe/usuarios/${outro}`, 'PATCH', { nome })).status, 400);
    }
  } finally { await s.fechar(); }
});

test('equipe: ninguém se tranca do lado de fora', async () => {
  const s = await subirServidor();
  try {
    const eu = (await s.chamar('/api/me')).dados.usuario.id;
    assert.equal((await s.chamar(`/api/equipe/usuarios/${eu}`, 'PATCH', { papel: 'atendente' })).status, 400);
    assert.equal((await s.chamar(`/api/equipe/usuarios/${eu}`, 'PATCH', { ativo: false })).status, 400);

    // o único outro admin também não pode ser rebaixado se eu for o último... com dois, pode
    const outro = await s.criarPessoa('Bruno Alves', 'bruno@teste.com', 'admin');
    assert.equal((await s.chamar(`/api/equipe/usuarios/${outro}`, 'PATCH', { papel: 'atendente' })).status, 200);

    // agora só sobrou eu: bloquear a mim mesma continua barrado
    assert.equal((await s.chamar(`/api/equipe/usuarios/${eu}`, 'PATCH', { ativo: false })).status, 400);
    assert.equal((await s.chamar('/api/equipe')).dados.usuarios.filter((u) => u.papel === 'admin' && u.ativo).length, 1);
  } finally { await s.fechar(); }
});

test('equipe: atendente comum não entra nas configurações da equipe', async () => {
  const s = await subirServidor();
  try {
    await s.criarPessoa('Bruno Alves', 'bruno@teste.com');
    const dele = await s.entrar('bruno@teste.com', 'outrasenha123');
    for (const [caminho, metodo, corpo] of [
      ['/api/equipe', 'GET', null],
      ['/api/equipe/inboxes', 'POST', { nome: 'Financeiro', cor: '#12B85C' }],
      ['/api/equipe/convites', 'POST', { email: 'x@y.com' }],
      ['/api/equipe/convites/abc', 'DELETE', null],
      ['/api/equipe/usuarios/1', 'PATCH', { nome: 'Nome alterado' }],
    ]) {
      assert.equal((await s.chamar(caminho, metodo, corpo, dele)).status, 403, `${metodo} ${caminho}`);
    }
    // e sem login nenhum também não
    assert.equal((await fetch(`${s.base}/api/equipe`)).status, 401);
  } finally { await s.fechar(); }
});

test('busca: encontra o cliente pelo nome, pelo celular e pelo PIN', async () => {
  const s = await subirServidor();
  try {
    const agora = Date.now();
    const pessoas = [
      ['Andressa Lima', '+55 31 98888-7777', '11535'],
      ['Bruno Cardoso', '+55 11 97777-6666', '40210'],
    ];
    for (const [nome, telefone, pin] of pessoas) {
      await s.db.prepare('INSERT INTO contatos (nome, telefone, pin) VALUES (?, ?, ?)').run(nome, telefone, pin);
      const ct = await s.db.prepare('SELECT id FROM contatos ORDER BY id DESC LIMIT 1').get();
      await s.db.prepare("INSERT INTO conversas (protocolo, contato_id, canal, status, nao_lidas, criada_em, atualizada_em) VALUES (?, ?, 'whatsapp', 'aberta', 0, ?, ?)")
        .run(`#50${ct.id}`, ct.id, agora, agora);
    }
    const buscar = async (q) => (await s.chamar(`/api/conversas?q=${encodeURIComponent(q)}`)).dados.conversas.map((c) => c.contato.nome);

    assert.deepEqual(await buscar('andressa'), ['Andressa Lima'], 'pelo nome, sem ligar para maiúscula');
    assert.deepEqual(await buscar('Lima'), ['Andressa Lima'], 'pelo sobrenome');
    assert.deepEqual(await buscar('11535'), ['Andressa Lima'], 'pelo PIN');
    assert.deepEqual(await buscar('40210'), ['Bruno Cardoso'], 'pelo PIN do outro');
    assert.deepEqual(await buscar('98888-7777'), ['Andressa Lima'], 'pelo celular como está escrito');
    assert.deepEqual(await buscar('31988887777'), ['Andressa Lima'], 'pelo celular só com números');
    assert.deepEqual(await buscar('988887777'), ['Andressa Lima'], 'sem o DDD');
    assert.deepEqual(await buscar('99999'), [], 'o que não existe não traz nada');
  } finally { await s.fechar(); }
});
