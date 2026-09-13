'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const carregar = () => import('../client/assets/js/acentos.mjs');

test('acentos: palavras do dia a dia do atendimento', async () => {
  const { corrigirPalavra } = await carregar();
  const esperado = {
    nao: 'não', voce: 'você', entao: 'então', tambem: 'também', ate: 'até',
    ola: 'olá', agua: 'água', aguas: 'águas', cafe: 'café', cafes: 'cafés',
    duvida: 'dúvida', codigo: 'código', numero: 'número', servico: 'serviço',
    endereco: 'endereço', cobranca: 'cobrança', sera: 'será', mes: 'mês',
  };
  for (const [antes, depois] of Object.entries(esperado)) {
    assert.equal(corrigirPalavra(antes), depois, `${antes} deveria virar ${depois}`);
  }
});

test('acentos: terminações comuns viram acento ou cedilha', async () => {
  const { corrigirPalavra } = await carregar();
  const esperado = {
    informacao: 'informação', informacoes: 'informações', cartao: 'cartão', cartoes: 'cartões',
    opcoes: 'opções', versao: 'versão', transferencia: 'transferência', importancia: 'importância',
    responsavel: 'responsável', disponivel: 'disponível', usuario: 'usuário', relatorio: 'relatório',
    bancaria: 'bancária', razao: 'razão', coracao: 'coração',
  };
  for (const [antes, depois] of Object.entries(esperado)) {
    assert.equal(corrigirPalavra(antes), depois, `${antes} deveria virar ${depois}`);
  }
});

test('acentos: não mexe no que pode mudar de sentido', async () => {
  const { corrigirPalavra } = await carregar();
  // "esta/está", "e/é", "a/à" e afins ficam como a pessoa escreveu
  for (const palavra of ['esta', 'e', 'a', 'de', 'casa', 'pessoa', 'saldo', 'ok', 'ao', 'para', 'porque']) {
    assert.equal(corrigirPalavra(palavra), null, `${palavra} não deveria ser alterada`);
  }
  // já acentuado ou com número/símbolo passa direto
  for (const palavra of ['não', 'você', 'R$', '5446', 'nao1']) {
    assert.equal(corrigirPalavra(palavra), null, `${palavra} não deveria ser alterada`);
  }
});

test('acentos: mantém maiúsculas como a pessoa escreveu', async () => {
  const { corrigirPalavra } = await carregar();
  assert.equal(corrigirPalavra('Nao'), 'Não');
  assert.equal(corrigirPalavra('NAO'), 'NÃO');
  assert.equal(corrigirPalavra('Informacao'), 'Informação');
  assert.equal(corrigirPalavra('VOCE'), 'VOCÊ');
});

test('acentos: corrige o texto inteiro sem mexer na pontuação', async () => {
  const { corrigirTexto } = await carregar();
  assert.equal(
    corrigirTexto('Ola! Nao recebi a confirmacao das opcoes no meu cartao. Voce pode verificar?'),
    'Olá! Não recebi a confirmação das opções no meu cartão. Você pode verificar?',
  );
  assert.equal(corrigirTexto('PIN 5446 - saldo R$ 314,21'), 'PIN 5446 - saldo R$ 314,21');
  assert.equal(corrigirTexto('Ola, quero agua e cafe.'), 'Olá, quero água e café.');
  assert.equal(corrigirTexto(''), '');
});
