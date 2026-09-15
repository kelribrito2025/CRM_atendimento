'use strict';

// Ações que mexem em dinheiro: crédito, débito e reembolso.
// O que mais importa aqui é a marca de idempotência — ela é o que impede
// creditar o cliente duas vezes quando a rede falha ou o atendente clica duas
// vezes. Os exemplos seguem o contrato publicado pelo dev.

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarSaldo } = require('../src/saldo');

const CHAVE = 'chave-de-teste';
const BASE = 'https://exemplo.internal/api/agents/customer/lookup';
const ATENDENTE = { id: 7, nome: 'Marina Alves', email: 'marina@bigteck.com.br' };
const MOTIVO = 'Recarga via PIX nao creditada no painel';

function apiFalsa(responder) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    const chamada = {
      url,
      corpo: JSON.parse(opcoes.body),
      marca: opcoes.headers['Idempotency-Key'],
      auth: opcoes.headers.Authorization,
    };
    chamadas.push(chamada);
    return responder(chamada);
  };
  return { chamadas, fetchImpl };
}

const ok = (extra = {}) => new Response(JSON.stringify({
  success: true, clienteId: 4242, valor: 5, valorCents: 500,
  saldoAnterior: 10, saldoAnteriorCents: 1000, saldoAtual: 15, saldoAtualCents: 1500, ...extra,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

const recusa = (status, codigo, message = 'recusado') => new Response(
  JSON.stringify({ error: true, codigo, message }), { status, headers: { 'Content-Type': 'application/json' } });

test('creditar: manda a marca de segurança, o PIN como número e o atendente da sessão', async () => {
  const { chamadas, fetchImpl } = apiFalsa(() => ok());
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  const r = await saldo.creditar({
    pin: '07712', valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE,
    chaveIdempotencia: 'marca-do-clique-1',
  });

  assert.equal(chamadas[0].url, 'https://exemplo.internal/api/agents/saldo/creditar');
  assert.equal(chamadas[0].marca, 'marca-do-clique-1');
  assert.equal(chamadas[0].corpo.pin, 7712);
  assert.equal(typeof chamadas[0].corpo.pin, 'number');
  assert.equal(chamadas[0].corpo.valorCents, 500);
  assert.equal(chamadas[0].corpo.atendente.email, 'marina@bigteck.com.br');
  assert.match(r.saldoAtual, /^R\$\s15,00$/);
  assert.equal(r.saldoAtualCentavos, 1500);
  assert.equal(r.repetida, false);
});

test('idempotência: a repetição não credita de novo e a tela avisa', async () => {
  const { chamadas, fetchImpl } = apiFalsa((c) => (chamadas.filter((x) => x.marca === c.marca).length > 1
    ? new Response(JSON.stringify({ success: true, clienteId: 4242, valorCents: 500, saldoAnteriorCents: 1000, saldoAtualCents: 1500 }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Idempotency-Replayed': 'true' } })
    : ok()));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });
  const pedido = { pin: 7712, valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'mesma-marca' };

  const primeira = await saldo.creditar(pedido);
  const segunda = await saldo.creditar(pedido);

  assert.equal(primeira.repetida, false);
  assert.equal(segunda.repetida, true, 'a segunda é a resposta guardada, não um novo crédito');
  assert.equal(segunda.saldoAtualCentavos, primeira.saldoAtualCentavos, 'o saldo não mudou de novo');
  assert.equal(chamadas[0].marca, chamadas[1].marca);
});

test('sem a marca de segurança o CRM nem chama a API', async () => {
  let chamou = false;
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl: async () => { chamou = true; return ok(); } });
  await assert.rejects(
    () => saldo.creditar({ pin: 7712, valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE }),
    (e) => e.codigo === 'sem_idempotency_key');
  assert.equal(chamou, false);
});

test('reembolso: manda a compra escolhida e nunca o valor', async () => {
  const { chamadas, fetchImpl } = apiFalsa(() => ok({ activationId: 555, valorCents: 1250, saldoAtualCents: 2250 }));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  const r = await saldo.reembolsar({
    pin: 7712, activationId: 555, valorCents: 999999, motivo: MOTIVO, atendente: ATENDENTE,
    chaveIdempotencia: 'marca-reembolso',
  });

  assert.equal(chamadas[0].url, 'https://exemplo.internal/api/agents/saldo/reembolsar');
  assert.equal(chamadas[0].corpo.activationId, 555);
  assert.equal('valorCents' in chamadas[0].corpo, false, 'quem decide quanto devolver é o servidor');
  assert.equal(r.activationId, 555);
  assert.match(r.valor, /^R\$\s12,50$/);
});

test('motivo de 5 a 300 nas sete ações: o CRM barra antes de a requisição sair', async () => {
  // O site exige motivo nas sete, de 5 a 300 caracteres. Se o CRM validasse mais
  // frouxo, não ficaria mais permissivo: o pedido sairia e voltaria como um 400
  // técnico, depois da viagem. O mínimo baixou de 10 para 5 porque "fraude" e
  // "duplicado" são motivos legítimos e cabem em menos de dez letras.
  const { chamadas, fetchImpl } = apiFalsa(() => ok({ activationId: 555 }));
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });
  const base = { pin: 7712, atendente: ATENDENTE };

  for (const motivo of ['', 'ok', 'erro', '  ok  ']) {
    await assert.rejects(
      () => saldo.creditar({ ...base, valorCents: 500, motivo, chaveIdempotencia: 'm' }),
      (e) => e.codigo === 'dados_invalidos' && /pelo menos 5/.test(e.message),
      `"${motivo}" não podia passar`);
  }
  await assert.rejects(
    () => saldo.debitar({ ...base, valorCents: 500, motivo: 'x'.repeat(301), chaveIdempotencia: 'm' }),
    (e) => e.codigo === 'dados_invalidos');
  assert.equal(chamadas.length, 0, 'nada disso pode chegar a sair do CRM');

  // E os curtos que o site aceita passam, com o espaço já aparado.
  await saldo.creditar({ ...base, valorCents: 500, motivo: 'fraude', chaveIdempotencia: 'm1' });
  await saldo.debitar({ ...base, valorCents: 500, motivo: 'golpe', chaveIdempotencia: 'm2' });
  await saldo.reembolsar({ ...base, activationId: 555, motivo: '  duplicado  ', chaveIdempotencia: 'm3' });

  assert.equal(chamadas.length, 3);
  assert.equal(chamadas[0].corpo.motivo, 'fraude');
  assert.equal(chamadas[1].corpo.motivo, 'golpe');
  assert.equal(chamadas[2].corpo.motivo, 'duplicado');
});

test('recusas: cada motivo vira um recado em português, e só duas valem repetir', async () => {
  const casos = [
    ['compra_ja_reembolsada', 409, /já foi reembolsada/i, false],
    ['saldo_insuficiente', 409, /não foi alterado/i, false],
    ['cliente_nao_encontrado', 404, /Nenhum cliente/i, false],
    ['compra_nao_reembolsavel', 404, /não existe ou não é deste cliente/i, false],
    ['chave_repetida_corpo_diferente', 409, /outros dados/i, false],
    ['operacao_em_andamento', 409, /Espere um instante/i, true],
    ['erro_interno', 500, /Pode tentar de novo/i, true],
  ];
  for (const [codigo, status, esperado, podeRepetir] of casos) {
    const { fetchImpl } = apiFalsa(() => recusa(status, codigo));
    const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });
    await assert.rejects(
      () => saldo.creditar({ pin: 7712, valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' }),
      (e) => {
        assert.match(e.message, esperado, codigo);
        assert.equal(e.codigo, codigo);
        assert.equal(e.podeRepetir, podeRepetir, `podeRepetir de ${codigo}`);
        return true;
      });
  }
});

test('conta bloqueada e sem permissão: recado do servidor, sem inventar texto', async () => {
  const { fetchImpl } = apiFalsa(() => recusa(409, 'conta_bloqueada', 'Conta bloqueada (fraude confirmada)'));
  await assert.rejects(
    () => criarSaldo({ url: BASE, token: CHAVE, fetchImpl }).creditar({ pin: 7712, valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' }),
    /Conta bloqueada \(fraude confirmada\)/);

  const { fetchImpl: semPermissao } = apiFalsa(() => new Response('{}', { status: 403 }));
  await assert.rejects(
    () => criarSaldo({ url: BASE, token: CHAVE, fetchImpl: semPermissao }).debitar({ pin: 7712, valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' }),
    /não tem permissão/i);
});

test('o CRM recusa antes de sair: valor zerado, compra sem escolha e atendente inválido', async () => {
  let chamou = false;
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl: async () => { chamou = true; return ok(); } });
  const base = { pin: 7712, valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' };

  await assert.rejects(() => saldo.creditar({ ...base, valorCents: 0 }), /maior que zero/i);
  await assert.rejects(() => saldo.creditar({ ...base, valorCents: 12.5 }), /maior que zero/i);
  await assert.rejects(() => saldo.reembolsar({ ...base, activationId: null }), /Escolha a compra/i);
  await assert.rejects(() => saldo.creditar({ ...base, atendente: { id: 1, nome: 'X', email: 'sem-arroba' } }), /identificar o atendente/i);
  assert.equal(chamou, false, 'nada disso pode chegar a sair do CRM');
});

test('rede caiu: o recado convida a repetir, porque repetir é seguro', async () => {
  const saldo = criarSaldo({
    url: BASE, token: CHAVE,
    fetchImpl: async () => { throw new Error('socket hang up'); },
  });
  await assert.rejects(
    () => saldo.creditar({ pin: 7712, valorCents: 500, motivo: MOTIVO, atendente: ATENDENTE, chaveIdempotencia: 'm' }),
    (e) => {
      assert.match(e.message, /não será feita duas vezes/i);
      assert.equal(e.podeRepetir, true);
      return true;
    });
});

/* ================================================================
 * Pela rota do CRM: quem está mexendo no dinheiro vem da sessão
 * ============================================================== */

const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const { criarWidget, assinar } = require('../src/widget');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const SEGREDO_SITE = 'segredo-do-site';

async function subirCrm({ responder = () => ok() } = {}) {
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

  const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const chamar = async (caminho, metodo = 'GET', corpo) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, dados: await r.json().catch(() => ({})) };
  };

  // Um cliente que chegou pelo chat do site, com conversa aberta.
  const sessao = await fetch(`${base}/widget/sessao`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '4380402', nome: 'Carla Menezes', pin: '7712', assinatura: assinar(SEGREDO_SITE, '4380402') }),
  }).then((r) => r.json());
  await fetch(`${base}/widget/mensagens`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-widget-token': sessao.token },
    body: JSON.stringify({ texto: 'Minha recarga nao caiu' }),
  });
  const conversa = await db.prepare("SELECT id FROM conversas WHERE canal = 'widget' ORDER BY id DESC LIMIT 1").get();

  return {
    db, chamadas, chamar, base, conversaId: Number(conversa.id),
    fechar: async () => { await new Promise((r) => servidor.close(r)); await db.fechar(); },
  };
}

test('rota do CRM: o navegador não escolhe quem está mexendo no dinheiro', async () => {
  const s = await subirCrm();
  try {
    const r = await s.chamar(`/api/conversas/${s.conversaId}/saldo/creditar`, 'POST', {
      pin: '7712', valorCents: 500, motivo: MOTIVO, chaveIdempotencia: 'marca-1',
      // o navegador tenta se passar por outra pessoa:
      atendente: { id: 999, nome: 'Impostor', email: 'impostor@fora.com' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const enviado = s.chamadas.at(-1);
    assert.equal(enviado.corpo.atendente.nome, 'Marina Alves', 'quem vale é a sessão do CRM');
    assert.equal(enviado.corpo.atendente.email, ADMIN.email);
    assert.equal(enviado.marca, 'marca-1', 'a marca do clique é repassada como veio');
  } finally { await s.fechar(); }
});

test('rota do CRM: a operação fica na auditoria, com valor e motivo', async () => {
  const s = await subirCrm();
  try {
    await s.chamar(`/api/conversas/${s.conversaId}/saldo/creditar`, 'POST', {
      pin: '7712', valorCents: 500, motivo: MOTIVO, chaveIdempotencia: 'marca-2',
    });
    const evento = await s.db.prepare("SELECT * FROM auditoria_eventos WHERE acao = 'saldo_creditar' ORDER BY id DESC LIMIT 1").get();
    assert.ok(evento, 'a ação precisa ficar registrada');
    assert.equal(evento.usuario_nome, 'Marina Alves');
    assert.match(String(evento.detalhe), /Creditou/);
    assert.match(String(evento.detalhe), /5,00/);
    assert.match(String(evento.detalhe), new RegExp(MOTIVO.slice(0, 20)));

    const { dados } = await s.chamar('/api/auditoria');
    assert.match(dados.eventos[0].descricao, /Creditou/);
  } finally { await s.fechar(); }
});

test('rota do CRM: sem motivo não sai, e o motivo curto vai inteiro para a auditoria', async () => {
  const s = await subirCrm();
  try {
    const vazio = await s.chamar(`/api/conversas/${s.conversaId}/saldo/debitar`, 'POST', {
      pin: '7712', valorCents: 500, motivo: '', chaveIdempotencia: 'marca-sem-motivo',
    });
    assert.equal(vazio.status, 400);
    assert.equal(vazio.dados.codigo, 'dados_invalidos');
    assert.equal(s.chamadas.length, 0, 'sem motivo nada chega ao site');

    const r = await s.chamar(`/api/conversas/${s.conversaId}/saldo/debitar`, 'POST', {
      pin: '7712', valorCents: 500, motivo: 'fraude', chaveIdempotencia: 'marca-com-motivo',
    });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(s.chamadas.at(-1).corpo.motivo, 'fraude');

    const evento = await s.db.prepare("SELECT detalhe FROM auditoria_eventos WHERE acao = 'saldo_debitar' ORDER BY id DESC LIMIT 1").get();
    assert.match(evento.detalhe, /^Debitou R\$\s5,00 — fraude$/);
  } finally { await s.fechar(); }
});

test('extrato: reembolso do atendimento mostra primeiro nome e motivo', async () => {
  const s = await subirCrm({
    responder: (chamada) => chamada.url.endsWith('/customer/transactions')
      ? new Response(JSON.stringify({
        transactions: [{
          id: 901, tipo: 'reembolso_manual', tipoLegivel: 'Reembolso manual',
          descricao: `Reembolso do atendimento: ${MOTIVO}`, valorCents: 1250,
          entrada: true, saldoDepoisCents: 2250, ativacaoId: 555, feitoPorAdmin: true,
        }],
        total: 1, proximoCursor: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : ok({ activationId: 555, valorCents: 1250, saldoAtualCents: 2250 }),
  });
  try {
    const reembolso = await s.chamar(`/api/conversas/${s.conversaId}/saldo/reembolsar`, 'POST', {
      pin: '7712', activationId: 555, motivo: MOTIVO, chaveIdempotencia: 'marca-extrato',
    });
    assert.equal(reembolso.status, 200, JSON.stringify(reembolso.dados));

    const extrato = await s.chamar('/api/suporte/transacoes', 'POST', { pin: '7712' });
    assert.equal(extrato.status, 200, JSON.stringify(extrato.dados));
    assert.equal(extrato.dados.transacoes[0].descricao, `Marina: ${MOTIVO}`);
    assert.doesNotMatch(extrato.dados.transacoes[0].descricao, /Reembolso do atendimento/i);
  } finally { await s.fechar(); }
});

test('rota do CRM: recusa do site chega à tela com o código, sem virar erro genérico', async () => {
  const s = await subirCrm({ responder: () => recusa(409, 'compra_ja_reembolsada', 'ja existe reembolso') });
  try {
    const r = await s.chamar(`/api/conversas/${s.conversaId}/saldo/reembolsar`, 'POST', {
      pin: '7712', activationId: 555, motivo: MOTIVO, chaveIdempotencia: 'marca-3',
    });
    assert.equal(r.status, 409);
    assert.equal(r.dados.codigo, 'compra_ja_reembolsada');
    assert.match(r.dados.erro, /já foi reembolsada/i);
    assert.equal(r.dados.podeRepetir, false);

    // e nada foi para a auditoria, porque nada aconteceu
    const n = await s.db.prepare("SELECT COUNT(*) AS n FROM auditoria_eventos WHERE acao LIKE 'saldo_%'").get();
    assert.equal(Number(n.n), 0);
  } finally { await s.fechar(); }
});

test('rota do CRM: sem login ninguém mexe em saldo', async () => {
  const s = await subirCrm();
  try {
    const r = await fetch(`${s.base}/api/conversas/${s.conversaId}/saldo/creditar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '7712', valorCents: 500, motivo: MOTIVO, chaveIdempotencia: 'm' }),
    });
    assert.equal(r.status, 401);
    assert.equal(s.chamadas.length, 0, 'nada pode chegar ao sistema do site');
  } finally { await s.fechar(); }
});

test('a confirmação de valor alto diz o lado certo da operação', () => {
  // A pergunta antes de mexer no dinheiro estava invertida: a condição comparava
  // com 'creditar', que é o nome da ação NA API, enquanto o tipo da tela é
  // 'adicionar'. Resultado: adicionar R$ 500 perguntava "Você está debitando
  // R$ 500,00. Confirma?". O atendente lia o contrário do que ia fazer.
  const fs = require('node:fs');
  const path = require('node:path');
  const tela = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');

  assert.doesNotMatch(tela, /tipo === 'creditar'/, "'creditar' nunca é o tipo da tela");
  assert.match(tela, /VERBO_DA_CONFIRMACAO = \{ adicionar: 'creditando', debitar: 'debitando' \}/);
  assert.match(tela, /Você está \$\{VERBO_DA_CONFIRMACAO\[tipo\]\}/);

  // E os tipos da tela e os verbos precisam continuar combinando.
  const tipos = tela.match(/const ACAO_NA_API = \{([^}]+)\}/)[1].match(/(\w+):/g).map((t) => t.slice(0, -1));
  const verbos = tela.match(/const VERBO_DA_CONFIRMACAO = \{([^}]+)\}/)[1].match(/(\w+):/g).map((t) => t.slice(0, -1));
  for (const v of verbos) assert.ok(tipos.includes(v), `${v} não é um tipo da tela`);
});
