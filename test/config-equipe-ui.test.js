'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');

test('configurações da equipe não exibem opção para convidar alguém', () => {
  const js = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  const inicio = js.indexOf('/* ---------------- Configurações › Equipe ---------------- */');
  const fim = js.indexOf('/* ---------------- Configurações › Aparência ---------------- */', inicio);
  const bloco = js.slice(inicio, fim);

  assert.ok(inicio >= 0 && fim > inicio, 'seção de equipe deve existir');
  assert.doesNotMatch(bloco, /Convidar alguém|Enviar convite|Convites pendentes/);
  assert.doesNotMatch(bloco, /formConvite|enviarConvite|cancelarConvite/);
  assert.match(bloco, /Atendentes/);
});
