'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tela = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');

test('saldo: consulta automaticamente uma vez ao abrir conversa com PIN e reutiliza cache', () => {
  const abrir = tela.slice(tela.indexOf('async function abrirConversa'), tela.indexOf('// Atualização periódica'));
  const automatica = tela.slice(tela.indexOf('function consultarSaldoAutomaticamente'), tela.indexOf('// Os quadradinhos do PIN'));
  const consulta = tela.slice(tela.indexOf('async function consultarSaldo'), tela.indexOf('function consultarSaldoAutomaticamente'));

  assert.match(abrir, /consultarSaldoAutomaticamente\(conversa\)/);
  assert.match(automatica, /estado\.resumo\?\.saldoAtivo/);
  assert.match(automatica, /c\?\.contato\?\.pin/);
  assert.match(automatica, /consultarSaldo\(pin, \{ forcar: false \}\)/);
  assert.match(consulta, /restaurarSaldoDoCache\(c, pin\)/);
  assert.match(consulta, /sequenciaConsultaSaldo/);
});

test('saldo: botão força atualização e Compras ou Transações continuam sob demanda', () => {
  assert.match(tela, /consultarSaldo\(pin, \{ forcar: true \}\)/);
  assert.match(tela, /'Atualizar saldo'/);
  assert.doesNotMatch(
    tela.slice(tela.indexOf('function consultarSaldoAutomaticamente'), tela.indexOf('// Os quadradinhos do PIN')),
    /carregarAba|suporte\/compras|suporte\/transacoes/,
  );
});
