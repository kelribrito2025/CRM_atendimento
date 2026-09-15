'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const javascript = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../client/assets/css/app.css'), 'utf8');

test('PIN do WhatsApp: aceita de 1 a 99999 e consulta pela rota de saldo existente', () => {
  const inicio = javascript.indexOf('async function consultarSaldo');
  const fim = javascript.indexOf('function consultarSaldoAutomaticamente', inicio);
  const bloco = javascript.slice(inicio, fim);

  assert.match(bloco, /const pin = String\(pinDigitado \|\| ''\)\.replace\(\/\\D\/g, ''\)/);
  assert.match(bloco, /c\.canal === 'whatsapp'/);
  assert.match(bloco, /pin\.length > 5/);
  assert.match(bloco, /Number\(pin\) < 1/);
  assert.match(bloco, /Number\(pin\) > 99999/);
  assert.match(bloco, /api\('\/suporte\/saldo', \{ method: 'POST', body: \{ pin, conversaId: c\.id \} \}\)/);
  assert.match(bloco, /if \(r\.conversa\) c\.contato = r\.conversa\.contato/);
});

test('PIN do WhatsApp: Alterar PIN aparece só nesse canal e limpa dados financeiros antigos', () => {
  const inicioAlterar = javascript.indexOf('function alterarPinDoWhatsapp');
  const fimAlterar = javascript.indexOf('function guardarSaldoNoCache', inicioAlterar);
  const alterar = javascript.slice(inicioAlterar, fimAlterar);
  const inicioPin = javascript.indexOf('function blocoPin');
  const fimPin = javascript.indexOf('function botaoAbrirConta', inicioPin);
  const blocoPin = javascript.slice(inicioPin, fimPin);

  assert.match(alterar, /if \(c\?\.canal !== 'whatsapp'\) return/);
  assert.match(alterar, /pinsWhatsappEmEdicao\.add\(c\.id\)/);
  assert.match(alterar, /cacheSaldos\.delete\(c\.id\)/);
  assert.match(alterar, /limparSaldo\(c\.id\)/);
  assert.match(alterar, /ficha\.compras\.conversaId = null/);
  assert.match(alterar, /ficha\.transacoes\.conversaId = null/);
  assert.match(blocoPin, /c\.canal === 'whatsapp'[\s\S]*class: 'btn-alterar-pin'[\s\S]*'Alterar PIN'/);
  assert.match(blocoPin, /editandoWhatsapp \? '' : String\(saldo\.pin \|\| ct\.pin \|\| doCanal \|\| ''\)/);
  assert.match(blocoPin, /Digite o novo PIN informado pelo cliente/);
  assert.match(css, /\.btn-alterar-pin \{[^}]*white-space: nowrap;/);
});
