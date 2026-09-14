'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const raiz = path.resolve(__dirname, '..');
const modulo = pathToFileURL(path.join(raiz, 'client/assets/js/som-notificacoes.mjs')).href;

function armazenamento(valorInicial = null) {
  let valor = valorInicial;
  return {
    getItem() { return valor; },
    setItem(_chave, novoValor) { valor = novoValor; },
    valor() { return valor; },
  };
}

test('som das notificações começa ligado e guarda a preferência muda', async () => {
  const { lerSomAtivo, gravarSomAtivo } = await import(modulo);
  const memoria = armazenamento();

  assert.equal(lerSomAtivo(memoria), true);
  assert.equal(gravarSomAtivo(false, memoria), false);
  assert.equal(memoria.valor(), 'off');
  assert.equal(lerSomAtivo(memoria), false);
  assert.equal(gravarSomAtivo(true, memoria), true);
  assert.equal(memoria.valor(), 'on');
});

test('mensagem recebida só toca quando o som está ligado', async () => {
  const { deveTocarNotificacao } = await import(modulo);

  assert.equal(deveTocarNotificacao(true, true), true);
  assert.equal(deveTocarNotificacao(true, false), false);
  assert.equal(deveTocarNotificacao(false, true), false);
});

test('ícone da lista abre o menu acessível de som das notificações', () => {
  const html = fs.readFileSync(path.join(raiz, 'client/atendimento.html'), 'utf8');
  const js = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');

  assert.match(html, /id="btn-filtros"[^>]+aria-haspopup="menu"/);
  assert.match(js, /Som das notificações/);
  assert.match(js, /role: 'menuitemcheckbox'/);
  assert.match(js, /'aria-checked': somNotificacoesAtivo/);
  assert.match(js, /\$\('#btn-filtros'\)\.addEventListener\('click', abrirMenuNotificacoes\)/);
});
