'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const javascript = fs.readFileSync(path.join(raiz, 'client', 'assets', 'js', 'atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(raiz, 'client', 'assets', 'css', 'app.css'), 'utf8');
const api = fs.readFileSync(path.join(raiz, 'src', 'rotas-api.js'), 'utf8');

test('ações da conversa: oferece atribuição às inboxes existentes', () => {
  assert.match(javascript, /'Atribuir aos canais existentes'/);
  assert.doesNotMatch(javascript, /'Transferir canal'/);
  assert.doesNotMatch(javascript, /'Marcar como resolvida'/);
  assert.match(javascript, /c\.status === 'resolvida'[\s\S]*'Reabrir conversa'/);
  assert.match(javascript, /if \(c\.status === 'aberta'\) segurarParaEncerrar\(card, c, pressao\)/);
  assert.match(javascript, /function abrirAtribuicaoEquipe\(\)/);
  assert.match(javascript, /estado\.resumo\?\.equipes/);
  assert.match(javascript, /toLocaleLowerCase\('pt-BR'\) !== 'admin'/);
  assert.match(javascript, /atualizarConversa\(\{ equipeId: equipe\.id \}\)/);
});

test('atribuição: atualiza resumo, lista e informa o destino', () => {
  assert.match(javascript, /Promise\.all\(\[carregarResumo\(\), carregarConversas\(\)\]\)/);
  assert.match(javascript, /foi para a inbox \$\{equipe\.nome\}/);
  assert.match(css, /\.modal\.atribuir-inbox \{[^}]*max-width: 480px;/);
  assert.match(css, /\.atribuir-inbox-opcao\.atual/);
});

test('atribuição: avisa outras telas abertas em tempo real', () => {
  assert.match(api, /avisos\?\.avisar\(\{ origem: 'atribuicao', conversaId: req\.conversa\.id/);
});

test('menu da conversa: permite retirar diretamente da inbox sem abrir o modal', () => {
  const menu = javascript.slice(javascript.indexOf('  function abrirMenuAcoes('), javascript.indexOf('  function renderChat('));
  assert.match(menu, /const temInbox = Boolean\(c\?\.equipe\?\.id\)/);
  assert.match(menu, /toLocaleLowerCase\('pt-BR'\) !== 'admin'/);
  assert.match(menu, /temInbox \? el\('button'/);
  assert.match(menu, /id: 'menu-retirar-inbox'/);
  assert.match(menu, /Devolver para Todas as conversas/);
  assert.match(menu, /if \(item\.disabled\) return/);
  assert.match(menu, /item\.disabled = true/);
  assert.match(menu, /item\.textContent = 'Retirando…'/);
  assert.match(menu, /await atualizarConversa\(\{ equipeId: null \}\)/);
  assert.match(menu, /Conversa devolvida para Todas as conversas/);
});
