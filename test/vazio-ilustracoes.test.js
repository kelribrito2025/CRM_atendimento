'use strict';

// As ilustrações das caixas vazias (turno 40).
//
// O ponto que estes testes guardam não é o desenho em si: é que cada um vai
// onde significa alguma coisa. Trocar as três de lugar deixaria a tela bonita
// e sem sentido — bandeja vazia é caixa sem nada, cartas respondidas é fila
// zerada, balão com check é a conversa em si.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tela = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../client/assets/css/app.css'), 'utf8');

test('as três ilustrações existem e nenhuma carrega gradiente com id fixo', () => {
  for (const nome of ['cartas', 'bandeja', 'balao']) {
    assert.match(tela, new RegExp(`${nome}: \`<svg viewBox="0 0 200 200"`), `falta a ilustração ${nome}`);
  }
  // Dois desenhos podem aparecer na mesma tela (lista e chat). Ids repetidos
  // de gradiente brigariam entre si; por isso os defs foram retirados.
  const bloco = tela.slice(tela.indexOf('const ILUSTRACAO = {'), tela.indexOf('function ilustracao('));
  assert.doesNotMatch(bloco, /<defs>|radialGradient|url\(#/);
});

test('cada caixa vazia recebe a ilustração que corresponde ao seu sentido', () => {
  const bloco = tela.slice(tela.indexOf('function descricaoVazia'), tela.indexOf('function listaVazia'));

  // Caixa sem nada: a bandeja.
  assert.match(bloco, /titulo: 'Caixa vazia'[^\n]*desenho: 'bandeja'/);
  assert.match(bloco, /titulo: 'Nenhuma conversa aberta'[^\n]*desenho: 'bandeja'/);
  // Fila zerada: as cartas respondidas.
  assert.match(bloco, /titulo: 'Tudo respondido'[^\n]*desenho: 'cartas'/);
  // Busca sem resultado NÃO é caixa vazia: continua com a lupa, senão quem
  // digitou errado veria "tudo respondido".
  assert.match(bloco, /titulo: 'Nada encontrado'[^\n]*lupa: true/);
});

test('a área do chat usa o balão com o check quando não há nenhuma conversa', () => {
  const bloco = tela.slice(tela.indexOf('function chatVazio'), tela.indexOf('const rapidas ='));
  assert.match(bloco, /ilustracao\(estado\.busca \? 'cartas' : 'balao'\)/);
  // Com conversas na lista a tela não está limpa, está esperando um clique:
  // ali fica o ícone pequeno, não a ilustração.
  assert.match(bloco, /const semNada = !estado\.conversas\.length;/);
});

test('a pérola antiga saiu inteira, desenho, imagem e texto', () => {
  assert.doesNotMatch(tela, /perola|pérola/i);
  assert.doesNotMatch(css, /perola/i);
});

test('as ilustrações acompanham o tema escuro em vez de estourar em branco', () => {
  assert.match(css, /\.ilustra-vazio \{/);
  assert.match(css, /\.ilustra-vazio\.pequena/);
  // Os tons claros do desenho viram os tons escuros da mesma paleta.
  assert.match(css, /:root\[data-tema="escuro"\] \.ilustra-vazio \[fill="#F1FBF6"\] \{ fill: var\(--verde-fundo\)/);
  assert.match(css, /:root\[data-tema="escuro"\] \.ilustra-vazio \[fill="#FFFFFF"\] \{ fill: var\(--superficie\)/);
});
