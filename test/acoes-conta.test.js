'use strict';

// Ações que mudam a situação da conta: desativar, reativar, banir e desbanir.
// As respostas seguem o contrato publicado pelo dev (parte 3).
//
// O que mais importa aqui: a tela NUNCA deduz a situação da conta pelo status
// cru — existem contas marcadas "active" que estão bloqueadas de fato. Quem
// decide é a situação que o site manda pronta, pela mesma função do login dele.

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarSaldo, resumirCliente, situacaoDoCliente } = require('../src/saldo');

const CHAVE = 'chave-de-teste';
const BASE = 'https://exemplo.internal/api/agents/customer/lookup';
const ATENDENTE = { id: 7, nome: 'Marina Alves', email: 'marina@bigteck.com.br' };
const MOTIVO = 'Cliente pediu o encerramento temporario da conta';

function apiFalsa(responder) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    const chamada = { url, corpo: JSON.parse(opcoes.body), marca: opcoes.headers['Idempotency-Key'] };
    chamadas.push(chamada);
    return responder(chamada);
  };
  return { chamadas, fetchImpl };
}

const resposta = (corpo, { status = 200, cabecalhos = {} } = {}) => new Response(
  JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cabecalhos } });

const recusa = (status, codigo, message = 'recusado') => resposta({ error: true, codigo, message }, { status });

const DESATIVADA = {
  success: true, clienteId: 4242, acao: 'desativar', motivo: MOTIVO,
  chavesRevogadas: 2, dispositivosRemovidos: 1,
  status: 'deactivated', banida: false, ativa: false, encerradaPeloTitular: false,
  situacao: { permitida: false, motivo: 'desativada', mensagem: 'Sua conta está desativada. Contate o suporte.' },
};

test('desativar: usa o endereço irmão do lookup e manda motivo, PIN número e marca', async () => {
  const { chamadas, fetchImpl } = apiFalsa(() => resposta(DESATIVADA));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  const r = await saldo.desativar({ pin: '07712', motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'marca-1' });

  assert.equal(chamadas[0].url, 'https://exemplo.internal/api/agents/customer/deactivate');
  assert.equal(chamadas[0].marca, 'marca-1');
  assert.equal(chamadas[0].corpo.pin, 7712);
  assert.equal(typeof chamadas[0].corpo.pin, 'number');
  assert.equal(chamadas[0].corpo.atendente.email, 'marina@bigteck.com.br');
  assert.equal(chamadas[0].corpo.valorCents, undefined, 'ação de conta não manda valor');
  assert.equal(r.situacao.permitida, false);
  assert.equal(r.chavesRevogadas, 2);
  assert.equal(r.semMudanca, false);
});

test('as quatro ações batem nos quatro endereços do contrato', async () => {
  const esperado = {
    desativar: 'deactivate', reativar: 'reactivate', banir: 'ban', desbanir: 'unban',
  };
  for (const [acao, caminho] of Object.entries(esperado)) {
    const { chamadas, fetchImpl } = apiFalsa(() => resposta({ ...DESATIVADA, acao }));
    const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });
    await saldo[acao]({ pin: 7712, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: `m-${acao}` });
    assert.equal(chamadas[0].url, `https://exemplo.internal/api/agents/customer/${caminho}`);
  }
});

test('reativar conta banida: a recusa vira um recado que diz o que fazer', async () => {
  const { fetchImpl } = apiFalsa(() => recusa(409, 'conta_banida'));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  await assert.rejects(
    () => saldo.reativar({ pin: 7712, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' }),
    (e) => {
      assert.equal(e.codigo, 'conta_banida');
      assert.equal(e.status, 409);
      assert.equal(e.podeRepetir, false, 'insistir não resolve: é preciso desbanir antes');
      assert.match(e.message, /desbanir primeiro/i);
      return true;
    });
});

test('a mesma recusa muda de recado conforme a ação', async () => {
  const saldoDe = (codigo) => criarSaldo({ url: BASE, token: CHAVE, fetchImpl: apiFalsa(() => recusa(409, codigo)).fetchImpl });
  const pedido = { pin: 7712, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' };

  await assert.rejects(() => saldoDe('conta_banida').desativar(pedido), /já está banida/i);
  await assert.rejects(() => saldoDe('conta_banida').reativar(pedido), /desbanir primeiro/i);
  await assert.rejects(() => saldoDe('conta_encerrada_pelo_titular').reativar(pedido), /administrador/i);
  await assert.rejects(() => saldoDe('conta_encerrada_pelo_titular').desativar(pedido), /já está fora do ar/i);
});

test('desbanir conta que também estava desativada: funcionou, e ela segue bloqueada', async () => {
  const { fetchImpl } = apiFalsa(() => resposta({
    success: true, acao: 'desbanir', chavesRestauradas: 2,
    status: 'deactivated', banida: false, ativa: false,
    situacao: { permitida: false, motivo: 'desativada', mensagem: 'Sua conta está desativada. Contate o suporte.' },
  }));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  const r = await saldo.desbanir({ pin: 7712, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' });

  assert.equal(r.bloqueada, false, 'o desbanimento funcionou');
  assert.equal(r.situacao.permitida, false, 'e mesmo assim a conta não está usável');
  assert.equal(r.situacao.motivo, 'desativada');
  assert.equal(r.chavesRestauradas, 2);
});

test('conta já no estado pedido: vem semMudanca e nada foi cortado', async () => {
  const { fetchImpl } = apiFalsa(() => resposta({
    success: true, acao: 'desativar', semMudanca: true,
    status: 'deactivated', banida: false, ativa: false,
    situacao: { permitida: false, motivo: 'desativada', mensagem: 'Sua conta está desativada.' },
  }));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  const r = await saldo.desativar({ pin: 7712, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' });
  assert.equal(r.semMudanca, true);
  assert.equal(r.chavesRevogadas, 0);
});

test('idempotência: a repetição devolve o resultado guardado e a tela sabe disso', async () => {
  let vez = 0;
  const { fetchImpl } = apiFalsa(() => {
    vez += 1;
    return resposta(DESATIVADA, vez === 1 ? {} : { cabecalhos: { 'Idempotency-Replayed': 'true' } });
  });
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });
  const pedido = { pin: 7712, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'mesma-marca' };

  assert.equal((await saldo.desativar(pedido)).repetida, false);
  assert.equal((await saldo.desativar(pedido)).repetida, true);
});

test('sem marca de segurança ou com motivo curto, nada sai do CRM', async () => {
  const { chamadas, fetchImpl } = apiFalsa(() => resposta(DESATIVADA));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  await assert.rejects(() => saldo.banir({ pin: 7712, motivo: MOTIVO, atendente: ATENDENTE }),
    (e) => e.codigo === 'sem_idempotency_key');
  await assert.rejects(() => saldo.banir({ pin: 7712, motivo: 'curto', atendente: ATENDENTE, chaveIdempotencia: 'm' }),
    (e) => e.codigo === 'dados_invalidos');
  await assert.rejects(() => saldo.banir({ pin: 7712, motivo: MOTIVO, atendente: { id: 1, nome: 'X' }, chaveIdempotencia: 'm' }),
    (e) => e.codigo === 'dados_invalidos');
  assert.equal(chamadas.length, 0, 'pedido inválido nem chega ao site');
});

/* ================================================================
 * A situação da conta: o caso das contas que o status cru mente
 * ============================================================== */

test('conta marcada "active" e bloqueada de fato: a tela mostra a verdade', () => {
  const cli = resumirCliente({
    name: 'Carla', balanceCents: 1000, status: 'active', banned: false,
    ativa: false, encerradaPeloTitular: true,
    situacao: { permitida: false, motivo: 'encerrada', mensagem: 'Esta conta foi encerrada.' },
  });

  assert.equal(cli.status, 'active', 'o campo cru continua chegando como veio');
  assert.equal(cli.ativa, false);
  assert.equal(cli.encerradaPeloTitular, true);
  assert.equal(cli.situacao.permitida, false, 'e a decisão não mente');
  assert.equal(cli.situacao.motivo, 'encerrada');
});

test('conta em ordem vem permitida, sem motivo', () => {
  const cli = resumirCliente({
    name: 'Carla', balanceCents: 1000, status: 'active', banned: false, ativa: true,
    situacao: { permitida: true, motivo: null, mensagem: null },
  });
  assert.equal(cli.situacao.permitida, true);
  assert.equal(cli.situacao.motivo, null);
  assert.equal(cli.encerradaPeloTitular, false);
});

test('site antigo, sem a situação pronta: deduz o possível em vez de quebrar', () => {
  assert.deepEqual(situacaoDoCliente({ status: 'active', banned: true }).situacao,
    { permitida: false, motivo: 'banida', mensagem: 'Esta conta foi bloqueada.' });
  assert.deepEqual(situacaoDoCliente({ status: 'deactivated', banned: false }).situacao,
    { permitida: false, motivo: 'desativada', mensagem: 'Esta conta está desativada.' });
  assert.deepEqual(situacaoDoCliente({ status: 'active', banned: false }).situacao,
    { permitida: true, motivo: null, mensagem: null });
});

/* ================================================================
 * Pela rota do CRM
 * ============================================================== */

const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarWidget, assinar } = require('../src/widget');
const { gerarHashSenha } = require('../src/senha');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const ATENDENTE_COMUM = { email: 'ana@teste.com', senha: 'segredo123' };
const SEGREDO_SITE = 'segredo-do-site';

async function subirCrm({ responder = () => resposta(DESATIVADA) } = {}) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    const chamada = { url, corpo: JSON.parse(opcoes.body), marca: opcoes.headers['Idempotency-Key'] };
    chamadas.push(chamada);
    return responder(chamada);
  };
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Marina Alves', comDadosExemplo: false });
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });
  const widget = criarWidget(db, { segredo: SEGREDO_SITE });
  const app = criarApp(db, { saldo, widget, enviador: criarEnviador({ modo: 'silencioso' }) });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const entrar = async (quem) => {
    const r = await fetch(`${base}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quem),
    });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };
  const comoAdmin = await entrar(ADMIN);
  const chamar = async (caminho, metodo = 'GET', corpo, cookie = comoAdmin) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  // Uma atendente comum, sem papel de administrador.
  await db.prepare("INSERT INTO usuarios (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, 'atendente', 1, ?)")
    .run('Ana Souza', ATENDENTE_COMUM.email, gerarHashSenha(ATENDENTE_COMUM.senha), Date.now());

  const sessao = await fetch(`${base}/widget/sessao`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '4380402', nome: 'Carla Menezes', pin: '7712', assinatura: assinar(SEGREDO_SITE, '4380402') }),
  }).then((r) => r.json());
  await fetch(`${base}/widget/mensagens`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-token': sessao.token },
    body: JSON.stringify({ texto: 'Quero encerrar minha conta' }),
  });
  const conversa = await db.prepare("SELECT id FROM conversas WHERE canal = 'widget' ORDER BY id DESC LIMIT 1").get();

  return {
    db, chamadas, chamar, entrar, conversaId: Number(conversa.id),
    fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); },
  };
}

test('rota do CRM: banir é só de administrador, mesmo com a chave do site liberada', async () => {
  const s = await subirCrm();
  try {
    const comoAna = await s.entrar(ATENDENTE_COMUM);
    const r = await s.chamar(`/api/conversas/${s.conversaId}/conta/banir`, 'POST',
      { pin: '7712', motivo: MOTIVO, chaveIdempotencia: 'm' }, comoAna);

    assert.equal(r.status, 403);
    assert.match(r.dados.erro, /administrador/i);
    assert.equal(s.chamadas.length, 0, 'a recusa acontece no CRM: nada chega ao site');
  } finally { await s.fechar(); }
});

test('rota do CRM: desativar é liberado para o atendente comum', async () => {
  const s = await subirCrm();
  try {
    const comoAna = await s.entrar(ATENDENTE_COMUM);
    const r = await s.chamar(`/api/conversas/${s.conversaId}/conta/desativar`, 'POST',
      { pin: '7712', motivo: MOTIVO, chaveIdempotencia: 'm' }, comoAna);

    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(s.chamadas.at(-1).corpo.atendente.nome, 'Ana Souza', 'quem vale é a sessão do CRM');
  } finally { await s.fechar(); }
});

test('rota do CRM: a ação de conta fica na auditoria, com quem fez e o motivo', async () => {
  const s = await subirCrm();
  try {
    await s.chamar(`/api/conversas/${s.conversaId}/conta/desativar`, 'POST',
      { pin: '7712', motivo: MOTIVO, chaveIdempotencia: 'm' });

    const { eventos } = (await s.chamar('/api/auditoria')).dados;
    const linha = eventos.find((e) => e.acao === 'conta_desativar');
    assert.ok(linha, 'a ação precisa aparecer na auditoria do CRM');
    assert.equal(linha.usuario.nome, 'Marina Alves');
    assert.match(linha.descricao, /Desativou a conta/);
    assert.match(linha.descricao, new RegExp(MOTIVO));
  } finally { await s.fechar(); }
});

test('rota do CRM: recusa do site chega à tela com o código, sem virar erro genérico', async () => {
  const s = await subirCrm({ responder: () => recusa(409, 'conta_banida') });
  try {
    const r = await s.chamar(`/api/conversas/${s.conversaId}/conta/reativar`, 'POST',
      { pin: '7712', motivo: MOTIVO, chaveIdempotencia: 'm' });

    assert.equal(r.status, 409);
    assert.equal(r.dados.codigo, 'conta_banida');
    assert.equal(r.dados.podeRepetir, false);
    assert.match(r.dados.erro, /desbanir primeiro/i);
  } finally { await s.fechar(); }
});

test('rota do CRM: ação inventada não passa, e sem login ninguém mexe', async () => {
  const s = await subirCrm();
  try {
    assert.equal((await s.chamar(`/api/conversas/${s.conversaId}/conta/excluir`, 'POST',
      { pin: '7712', motivo: MOTIVO, chaveIdempotencia: 'm' })).status, 404);
    assert.equal(s.chamadas.length, 0, 'ação desconhecida nem chega ao site');

    const semLogin = await s.chamar(`/api/conversas/${s.conversaId}/conta/desativar`, 'POST',
      { pin: '7712', motivo: MOTIVO, chaveIdempotencia: 'm' }, 'sessao=invalida');
    assert.equal(semLogin.status, 401);
    assert.equal(s.chamadas.length, 0);
  } finally { await s.fechar(); }
});
