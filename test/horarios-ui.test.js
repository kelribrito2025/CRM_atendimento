'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ler = (arquivo) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');

test('horários UI: configura quatro campos, informa fuso e só conclui após confirmação do servidor', () => {
  const js = ler('client/assets/js/atendimento.js');
  const editar = js.slice(js.indexOf('function editarHorarioDe'), js.indexOf('function adicionarAtendente'));
  for (const rotulo of ['Início do atendimento', 'Início da pausa', 'Retorno da pausa', 'Fim do atendimento']) assert.ok(editar.includes(rotulo));
  assert.match(editar, /type: 'time'/);
  assert.match(editar, /De segunda a sexta, no horário de Brasília/);
  assert.match(editar, /resultado\.usuario\?\.horario/);
  assert.match(editar, /salvo === undefined/);
  assert.match(editar, /O servidor ainda não confirmou os horários/);
  assert.match(js, /avisosHorario\.atualizar\(estado\.resumo\)/);
});

test('horários UI: pausa acessível, retorno explícito e relógio monotônico sem chamadas a cada segundo', () => {
  const js = ler('client/assets/js/horario-atendimento.mjs');
  assert.match(js, /setInterval\(atualizarTempo, 1000\)/);
  assert.match(js, /performance\.now\(\) - recebidoEm/);
  assert.match(js, /api\('\/horario\/retornar'/);
  assert.match(js, /setAttribute\('role', 'dialog'\)/);
  assert.match(js, /setAttribute\('role', 'timer'\)/);
  assert.match(js, /clearInterval\(intervalo\)/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /localStorage\.setItem/);
  assert.doesNotMatch(js, /setInterval\([^\n]*(api|sincronizar|recarregar)/);
});

test('horários UI: widget tem card discreto e não bloqueia envio durante a pausa', () => {
  const html = ler('client/widget.html');
  const js = ler('client/assets/js/widget-chat.js');
  const css = ler('client/assets/css/widget.css');
  assert.match(html, /id="aviso-horario"[^>]+hidden/);
  assert.ok(html.indexOf('id="aviso-horario"') < html.indexOf('id="form"'));
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none !important/);
  const aplicar = js.slice(js.indexOf('function aplicarAtendimento'), js.indexOf('async function baixarArquivo'));
  assert.match(aplicar, /Estamos em pausa/);
  assert.match(aplicar, /atendimento\.agoraServidor/);
  assert.doesNotMatch(aplicar, /liberarEnvio\(false\)/);
});
