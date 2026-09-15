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
