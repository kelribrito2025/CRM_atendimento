'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulo = pathToFileURL(path.join(__dirname, '../client/assets/js/descricao-transacao.mjs')).href;

async function apresentar(transacao) {
  const { apresentarDescricaoTransacao } = await import(`${modulo}?t=${Date.now()}-${Math.random()}`);
  return apresentarDescricaoTransacao(transacao);
}

test('extrato: reembolso automático expirado mostra somente número e ID', async () => {
  assert.deepEqual(await apresentar({
    tipo: 'reembolso',
    tipoTexto: 'Reembolso',
    descricao: 'Reembolso automático - Ativação expirada #13560058',
    numero: '5588999467585',
    ativacaoId: 13560058,
  }), {
    descricao: '5588999467585 - #13560058',
    numero: '5588999467585',
    complemento: ' - #13560058',
  });
});

test('extrato: descrição antiga de cancelamento também fica enxuta', async () => {
  assert.deepEqual(await apresentar({
    tipo: 'reembolso',
    tipoTexto: 'Reembolso',
    descricao: 'Reembolso de ativação cancelada #77',
    numero: '5543976096055',
    ativacaoId: 77,
  }), {
    descricao: '5543976096055 - #77',
    numero: '5543976096055',
    complemento: ' - #77',
  });
});

test('extrato: motivo de reembolso manual não é ocultado', async () => {
  assert.deepEqual(await apresentar({
    tipo: 'reembolso_manual',
    tipoTexto: 'Reembolso manual',
    descricao: 'Kely: Número não recebeu o código',
    numero: '5588999467585',
    ativacaoId: 77,
  }), {
    descricao: 'Kely: Número não recebeu o código',
    numero: null,
    complemento: null,
  });
});

test('extrato: texto personalizado não some mesmo se a API usar tipo genérico', async () => {
  assert.deepEqual(await apresentar({
    tipo: 'reembolso',
    tipoTexto: 'Reembolso',
    descricao: 'Kely: Cliente solicitou o cancelamento',
    numero: '5588999467585',
    ativacaoId: 77,
  }), {
    descricao: 'Kely: Cliente solicitou o cancelamento',
    numero: null,
    complemento: null,
  });
});

test('extrato: compra mantém número, estado e serviço', async () => {
  assert.deepEqual(await apresentar({
    tipo: 'compra',
    descricao: 'Compra em andamento - Whatsapp (Brasil)',
    numero: '5588765464748',
  }), {
    descricao: '5588765464748 Em andamento - Whatsapp (Brasil)',
    numero: '5588765464748',
    complemento: ' Em andamento - Whatsapp (Brasil)',
  });
});
