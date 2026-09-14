'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const javascript = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');

test('ficha: ações e abas financeiras só aparecem após consultar o saldo', () => {
  const inicio = javascript.indexOf('const conteudoFinanceiro = cli');
  const fim = javascript.indexOf('painel.replaceChildren(', inicio);
  const regra = javascript.slice(inicio, fim);
  const painel = javascript.slice(fim, javascript.indexOf('ajustarAltura(textareaNota)', fim));

  assert.ok(inicio > 0, 'a regra de visibilidade financeira precisa existir');
  assert.match(regra, /cli\s*\?\s*\[acoesSaldo\(c\), abasFicha\(\), \.\.\.corpoAba\[ficha\.aba\]\(\)\]/);
  assert.match(regra, /:\s*corpoAba\.resumo\(\)/, 'antes da consulta mantém apenas o conteúdo comum do Resumo');
  assert.match(painel, /blocoSaldoEscuro\(c\),\s*\.\.\.conteudoFinanceiro/);
  assert.doesNotMatch(painel, /\n\s*acoesSaldo\(c\),/);
  assert.doesNotMatch(painel, /\n\s*abasFicha\(\),/);
});

test('ficha: nota interna continua visível antes da consulta', () => {
  const inicioResumo = javascript.indexOf('resumo: () => [');
  const fimResumo = javascript.indexOf('compras: () =>', inicioResumo);
  const resumo = javascript.slice(inicioResumo, fimResumo);

  assert.match(resumo, /blocoNotas/);
  assert.match(javascript, /const conteudoFinanceiro = cli[\s\S]*:\s*corpoAba\.resumo\(\)/);
});
