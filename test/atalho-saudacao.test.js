'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modulo = () => import('../client/assets/js/saudacao.mjs');
const tela = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');

test('atalho //: insere a saudação nos três períodos e posiciona o cursor no final', async () => {
  const { expandirAtalhoSaudacao } = await modulo();
  for (const [hora, periodo] of [[8, 'bom dia'], [14, 'boa tarde'], [20, 'boa noite']]) {
    const r = expandirAtalhoSaudacao('//', 2, 2, new Date(2026, 8, 16, hora));
    assert.equal(r.texto, `Olá, ${periodo}, tudo bem? Como podemos ajudar?`);
    assert.equal(r.cursor, r.texto.length);
  }
});

test('atalho //: substitui somente as barras e preserva o restante do rascunho', async () => {
  const { expandirAtalhoSaudacao } = await modulo();
  const prefixo = 'Cliente:\n';
  const sufixo = '\nMensagem já escrita';
  const r = expandirAtalhoSaudacao(`${prefixo}//${sufixo}`, prefixo.length + 2, prefixo.length + 2, new Date(2026, 8, 16, 8));
  assert.equal(r.texto, `${prefixo}Olá, bom dia, tudo bem? Como podemos ajudar?${sufixo}`);
  assert.equal(r.texto.slice(r.cursor), sufixo);
});

test('atalho //: não altera URLs, caminhos, barra simples ou seleção ativa', async () => {
  const { expandirAtalhoSaudacao } = await modulo();
  for (const texto of ['/', '/saudacao', 'https://', 'http://', 'Veja https://site.com/agua//', 'pasta//', '///']) {
    assert.equal(expandirAtalhoSaudacao(texto, texto.length), null, texto);
  }
  assert.equal(expandirAtalhoSaudacao('//site.com', 2), null);
  assert.equal(expandirAtalhoSaudacao('//', 1, 2), null);
  assert.equal(expandirAtalhoSaudacao('//', 4), null);
});

async function preparar(modo = 'resposta') {
  const { expandirAtalhoSaudacao } = await modulo();
  let fechou = 0;
  let ajustou = 0;
  const contexto = vm.createContext({
    estado: { modo }, expandirAtalhoSaudacao,
    ajustarAltura: () => ajustou++, fecharRapidas: () => fechou++,
    // Qualquer tentativa de enviar a mensagem pelo atalho deve reprovar o teste.
    enviarMensagem: () => assert.fail('Atalho não pode enviar mensagens'),
    api: () => assert.fail('Atalho deve preencher localmente, sem depender da API'),
  });
  const inicio = tela.indexOf('  function inserirSaudacaoAoDigitar(');
  const fim = tela.indexOf('  function atalhoBarra(', inicio);
  assert.ok(inicio > 0 && fim > inicio);
  const funcao = vm.runInContext(`${tela.slice(inicio, fim)}\ninserirSaudacaoAoDigitar;`, contexto);
  const campo = { value: '//', selectionStart: 2, selectionEnd: 2, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } };
  return { funcao, campo, contagem: () => ({ fechou, ajustou }) };
}

test('atalho //: digitação preenche sem enviar, fecha painel e mantém cursor', async () => {
  const s = await preparar();
  assert.equal(s.funcao({ inputType: 'insertText', data: '/', isComposing: false }, s.campo), true);
  assert.match(s.campo.value, /^Olá, (bom dia|boa tarde|boa noite), tudo bem\? Como podemos ajudar\?$/);
  assert.equal(s.campo.selectionStart, s.campo.value.length);
  assert.equal(s.campo.selectionEnd, s.campo.value.length);
  assert.deepEqual(s.contagem(), { fechou: 1, ajustou: 1 });
  assert.ok(tela.includes('if (inserirSaudacaoAoDigitar(e, textarea)) return;'));
});

test('atalho //: não dispara em colagem, desfazer, exclusão, composição ou nota interna', async () => {
  for (const evento of [
    { inputType: 'insertFromPaste', data: '//' },
    { inputType: 'historyUndo', data: null },
    { inputType: 'deleteContentBackward', data: null },
    { inputType: 'insertText', data: '/', isComposing: true },
    { inputType: 'insertText', data: 'x' },
  ]) {
    const s = await preparar();
    assert.equal(s.funcao(evento, s.campo), false);
    assert.equal(s.campo.value, '//');
    assert.deepEqual(s.contagem(), { fechou: 0, ajustou: 0 });
  }
  const nota = await preparar('nota');
  assert.equal(nota.funcao({ inputType: 'insertText', data: '/' }, nota.campo), false);
  assert.equal(nota.campo.value, '//');
});
