'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const javascript = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../client/assets/css/app.css'), 'utf8');

test('ficha: consultar saldo fica à direita do título na mesma linha', () => {
  const inicio = javascript.indexOf('function blocoSaldoEscuro');
  const fim = javascript.indexOf('// As três ações que mexem no saldo', inicio);
  const bloco = javascript.slice(inicio, fim);

  assert.match(bloco, /class: 'saldo-cabecalho'/);
  assert.match(bloco, /class: 'saldo-cabecalho-texto'/);
  assert.match(bloco, /class: 'saldo-rotulo' \}, 'Saldo em conta'/);
  assert.match(bloco, /cabecalho\(recado, podeConsultar && pin \? 'Consultar saldo' : null\)/);
  assert.match(bloco, /cabecalho\(saldo\.erro, podeConsultar && pin \? 'Tentar de novo' : null, 'saldo-erro'\)/);
  assert.match(bloco, /class: 'saldo-atualizacao'/);
  assert.match(bloco, /consultarSaldo\(pin, \{ forcar: true \}\)/);
  assert.match(bloco, /'Atualizar saldo'/);
  assert.match(css, /\.saldo-cabecalho \{[^}]*display: flex;[^}]*justify-content: space-between;/);
  assert.match(css, /\.saldo-cabecalho-texto \{[^}]*flex-direction: column;[^}]*gap: 3px;/);
  assert.match(css, /\.saldo-acao \{\s*flex-shrink: 0;/);
});
