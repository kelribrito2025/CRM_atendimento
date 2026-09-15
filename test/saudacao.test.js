'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');

async function modulo() {
  return import('../client/assets/js/saudacao.mjs');
}

function horario(hora, minuto = 0) {
  return new Date(2026, 8, 15, hora, minuto, 0, 0);
}

test('saudação: escolhe manhã, tarde e noite pelo horário local', async () => {
  const { periodoDaSaudacao } = await modulo();
  assert.equal(periodoDaSaudacao(horario(4, 59)), 'boa noite');
  assert.equal(periodoDaSaudacao(horario(5)), 'bom dia');
  assert.equal(periodoDaSaudacao(horario(11, 59)), 'bom dia');
  assert.equal(periodoDaSaudacao(horario(12)), 'boa tarde');
  assert.equal(periodoDaSaudacao(horario(17, 59)), 'boa tarde');
  assert.equal(periodoDaSaudacao(horario(18)), 'boa noite');
});

test('saudação: gera a frase completa somente para a resposta dinâmica', async () => {
  const { textoDaRespostaRapida } = await modulo();
  const resposta = { dinamica: 'saudacao', texto: 'Texto persistido' };
  assert.equal(textoDaRespostaRapida(resposta, horario(8)), 'Olá, bom dia, tudo bem? Como podemos ajudar?');
  assert.equal(textoDaRespostaRapida(resposta, horario(14)), 'Olá, boa tarde, tudo bem? Como podemos ajudar?');
  assert.equal(textoDaRespostaRapida(resposta, horario(20)), 'Olá, boa noite, tudo bem? Como podemos ajudar?');
  assert.equal(textoDaRespostaRapida({ texto: 'Resposta comum' }, horario(8)), 'Resposta comum');
});

test('saudação: o chat usa o texto calculado ao clicar e a exibe como fixa', () => {
  const tela = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  assert.match(tela, /import \{ textoDaRespostaRapida \} from '\.\/saudacao\.mjs'/);
  assert.match(tela, /const textoResposta = textoDaRespostaRapida\(r\)/);
  assert.match(tela, /r\.dinamica \? 'automática por horário'/);
  assert.match(tela, /rr\.dinamica[\s\S]*'fixa'/);
});
