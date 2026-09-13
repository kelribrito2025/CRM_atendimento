'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulo = pathToFileURL(path.resolve(__dirname, '../client/assets/js/foco-compositor.mjs')).href;

function campo(valor = '') {
  return {
    value: valor,
    selectionStart: valor.length,
    selectionEnd: valor.length,
    focado: false,
    opcoesFoco: null,
    selecaoAplicada: null,
    focus(opcoes) {
      this.focado = true;
      this.opcoesFoco = opcoes;
    },
    setSelectionRange(inicio, fim) {
      this.selectionStart = inicio;
      this.selectionEnd = fim;
      this.selecaoAplicada = [inicio, fim];
    },
  };
}

function documento(campos, ativo = null) {
  return {
    activeElement: ativo,
    querySelector(seletor) { return campos[seletor] || null; },
  };
}

test('atualização do chat preserva texto, foco e cursor da próxima mensagem', async () => {
  const { capturarCompositor, restaurarCompositor } = await import(modulo);
  const anterior = campo('próxima mensagem');
  anterior.selectionStart = 7;
  anterior.selectionEnd = 7;
  const campos = { '#texto-msg': anterior, '#texto-nota': campo('nota guardada') };
  const doc = documento(campos, anterior);
  const estado = capturarCompositor(doc);

  const novo = campo();
  campos['#texto-msg'] = novo;
  let alturaAjustada = null;
  restaurarCompositor(estado, { documento: doc, ajustarAltura: (alvo) => { alturaAjustada = alvo; } });

  assert.equal(novo.value, 'próxima mensagem');
  assert.equal(novo.focado, true);
  assert.deepEqual(novo.opcoesFoco, { preventScroll: true });
  assert.deepEqual(novo.selecaoAplicada, [7, 7]);
  assert.equal(alturaAjustada, novo);
});

test('atualização silenciosa não rouba foco de outro controle', async () => {
  const { capturarCompositor, restaurarCompositor } = await import(modulo);
  const anterior = campo('rascunho');
  const campos = { '#texto-msg': anterior };
  const doc = documento(campos, { id: 'busca' });
  const estado = capturarCompositor(doc);

  const novo = campo();
  campos['#texto-msg'] = novo;
  restaurarCompositor(estado, { documento: doc });

  assert.equal(novo.value, 'rascunho');
  assert.equal(novo.focado, false);
});
