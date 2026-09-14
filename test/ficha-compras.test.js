'use strict';

// Compras e extrato do cliente: o CRM lê a API do site e entrega à ficha só o
// que a tela mostra. Os exemplos abaixo seguem o contrato publicado pelo dev.

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarSaldo } = require('../src/saldo');

const CHAVE = 'chave-de-teste';
const BASE = 'https://exemplo.internal/api/agents/customer/lookup';

// Faz as vezes da API do site, guardando o que foi pedido.
function apiFalsa(respostas) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    const corpo = JSON.parse(opcoes.body);
    chamadas.push({ url, corpo, auth: opcoes.headers.Authorization });
    const nome = url.split('/').pop();
    const r = respostas[nome];
    if (typeof r === 'number') return new Response('{}', { status: r });
    return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { chamadas, fetchImpl };
}

const UMA_COMPRA = {
  id: 555,
  descricao: 'Whatsapp (Brasil)',
  phoneNumber: '5511999999999',
  status: 'completed',
  smsCode: '123456',
  sellingPrice: 12.5,
  sellingPriceCents: 1250,
  costCents: 400,
  isRefunded: false,
  refundedAt: null,
  recebeuSms: true,
  podeReembolsar: true,
  motivoNaoPodeReembolsar: null,
  createdAt: '2026-09-14T11:00:00.000Z',
};

test('compras: o CRM pede pelo PIN como número e entende a paginação', async () => {
  const { chamadas, fetchImpl } = apiFalsa({
    activations: { customer: { id: 1 }, activations: [UMA_COMPRA], total: 42, nestaPagina: 1, proximoCursor: 554 },
  });
  const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });

  const r = await saldo.listarCompras('00555', { limite: 20 });
  assert.equal(chamadas[0].url, 'https://exemplo.internal/api/agents/customer/activations');
  assert.equal(chamadas[0].auth, `Bearer ${CHAVE}`);
  // PIN vai como número (aqui o endpoint recusa texto), sem o zero à esquerda.
  assert.equal(chamadas[0].corpo.pin, 555);
  assert.equal(typeof chamadas[0].corpo.pin, 'number');
  assert.equal(chamadas[0].corpo.limit, 20);
  assert.equal('cursor' in chamadas[0].corpo, false, 'primeira página vai sem cursor');

  assert.equal(r.total, 42);
  assert.equal(r.proximoCursor, 554);
  const c = r.compras[0];
  assert.equal(c.descricao, 'Whatsapp (Brasil)');
  assert.equal(c.numero, '5511999999999');
  assert.match(c.valor, /^R\$\s12,50$/);
  assert.equal(c.statusTexto, 'Concluída');
  assert.equal(c.data, '2026-09-14T11:00:00.000Z');
  assert.equal(c.podeReembolsar, true);
  assert.equal(c.recebeuSms, true);
  // A margem do fornecedor não passa para a tela.
  assert.equal('costCents' in c, false);
  assert.equal(JSON.stringify(c).includes('400'), false);

  await saldo.listarCompras(555, { cursor: 554 });
  assert.equal(chamadas[1].corpo.cursor, 554, 'a página seguinte manda o cursor');
});

test('compras: o motivo de não poder reembolsar chega pronto para o atendente', async () => {
  const { fetchImpl } = apiFalsa({
    activations: {
      activations: [{ ...UMA_COMPRA, id: 554, isRefunded: true, podeReembolsar: false, motivoNaoPodeReembolsar: 'Esta compra ja foi reembolsada', status: 'cancelled' }],
      total: 1, proximoCursor: null,
    },
  });
  const r = await criarSaldo({ url: BASE, token: CHAVE, fetchImpl }).listarCompras(555);
  assert.equal(r.compras[0].podeReembolsar, false);
  assert.equal(r.compras[0].motivoNaoPodeReembolsar, 'Esta compra ja foi reembolsada');
  assert.equal(r.compras[0].reembolsada, true);
  assert.equal(r.proximoCursor, null, 'sem próxima página');
});

test('extrato: valor com sinal, saldo que ficou e rótulo pronto', async () => {
  const { chamadas, fetchImpl } = apiFalsa({
    transactions: {
      saldoAtualCents: 4550,
      transactions: [
        { id: 900, tipo: 'recarga', tipoLegivel: 'Recarga', tipoBruto: 'credit', origem: 'customer', descricao: 'Recarga via PIX', valorCents: 3000, entrada: true, saldoAntesCents: 1550, saldoDepoisCents: 4550, ativacaoId: null, feitoPorAdmin: false, data: '2026-09-14T12:00:00.000Z' },
        { id: 899, tipo: 'compra', tipoLegivel: 'Compra', descricao: 'API v1 - Whatsapp (Brasil)', valorCents: -1250, entrada: false, saldoDepoisCents: 1550, ativacaoId: 555 },
        { id: 898, tipo: 'reembolso_manual', tipoLegivel: 'Reembolso manual', descricao: 'Reembolso manual', valorCents: 1250, saldoDepoisCents: 2800, ativacaoId: 554, feitoPorAdmin: true },
      ],
      total: 137, nestaPagina: 3, proximoCursor: 898,
    },
  });
  const r = await criarSaldo({ url: BASE, token: CHAVE, fetchImpl }).listarTransacoes(7712);
  assert.equal(chamadas[0].url, 'https://exemplo.internal/api/agents/customer/transactions');
  assert.equal(chamadas[0].corpo.limit, 30);

  const [recarga, compra, reembolso] = r.transacoes;
  assert.equal(recarga.tipoTexto, 'Recarga');
  assert.equal(recarga.entrada, true);
  assert.match(recarga.saldoDepois, /^R\$\s45,50$/);
  assert.equal(compra.entrada, false, 'saída mesmo sem o campo entrada explícito não muda o sinal');
  assert.match(compra.valor, /^-R\$\s12,50$/);
  assert.equal(compra.ativacaoId, 555);
  assert.equal(reembolso.feitoPorAdmin, true);
  assert.equal(reembolso.tipoTexto, 'Reembolso manual');
  assert.equal(r.total, 137);
});

test('extrato: tipo desconhecido vira "Movimentação" em vez de quebrar a lista', async () => {
  const { fetchImpl } = apiFalsa({
    transactions: { transactions: [{ id: 1, valorCents: -100, saldoDepoisCents: 0 }], total: 1, proximoCursor: null },
  });
  const r = await criarSaldo({ url: BASE, token: CHAVE, fetchImpl }).listarTransacoes(7712);
  assert.equal(r.transacoes[0].tipoTexto, 'Movimentação');
  assert.equal(r.transacoes[0].entrada, false);
});

test('compras e extrato: recados claros quando a API recusa', async () => {
  const casos = [
    [403, /permissão/i],
    [429, /Muitas consultas/i],
    [401, /chave de acesso/i],
    [404, /Nenhum cliente/i],
  ];
  for (const [status, esperado] of casos) {
    const { fetchImpl } = apiFalsa({ activations: status, transactions: status });
    const saldo = criarSaldo({ url: BASE, token: CHAVE, fetchImpl });
    await assert.rejects(() => saldo.listarCompras(555), esperado, `compras ${status}`);
    await assert.rejects(() => saldo.listarTransacoes(555), esperado, `extrato ${status}`);
  }
});

test('compras e extrato: sem chave configurada, o CRM nem chama a API', async () => {
  let chamou = false;
  const saldo = criarSaldo({ url: BASE, token: '', fetchImpl: async () => { chamou = true; return new Response('{}'); } });
  await assert.rejects(() => saldo.listarCompras(555), /não configurada/i);
  await assert.rejects(() => saldo.listarTransacoes(555), /não configurada/i);
  assert.equal(chamou, false);
});
