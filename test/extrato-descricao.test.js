'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { personalizarReembolsos } = require('../src/extrato');

test('extrato: combina o primeiro nome do atendente com o motivo', () => {
  const transacoes = [{
    id: 1,
    tipo: 'reembolso',
    tipoTexto: 'Reembolso manual',
    ativacaoId: 13410372,
    descricao: 'Reembolso do atendimento: Número não recebeu o código',
  }];
  const auditorias = [{
    usuario_nome: 'Kely Brito',
    detalhe: 'Reembolsou R$ 14,90 (compra #13410372) — Número não recebeu o código',
  }];

  assert.equal(
    personalizarReembolsos(transacoes, auditorias)[0].descricao,
    'Kely: Número não recebeu o código',
  );
});

test('extrato: remove o prefixo antigo mesmo quando não encontra auditoria', () => {
  const transacoes = [{
    id: 2,
    tipo: 'reembolso_manual',
    ativacaoId: 99,
    descricao: 'Reembolso do atendimento: Cliente desistiu da compra',
  }];

  assert.equal(personalizarReembolsos(transacoes)[0].descricao, 'Cliente desistiu da compra');
});

test('extrato: não altera compras, recargas ou reembolsos automáticos', () => {
  const transacoes = [
    { tipo: 'compra', descricao: 'Opção 4 - Compra em andamento' },
    { tipo: 'recarga', descricao: 'Recarga via PIX' },
    { tipo: 'reembolso', descricao: 'Reembolso de ativação cancelada' },
  ];

  assert.deepEqual(personalizarReembolsos(transacoes), transacoes);
});
