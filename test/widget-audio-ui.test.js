'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

test('chat do site: botão de microfone e barra de gravação com lixeira, ondas e tempo', () => {
  const html = ler('client/widget.html');
  assert.match(html, /<button type="button" class="gravar" id="btn-gravar" aria-label="Gravar áudio"/);
  assert.match(html, /<div class="gravacao" id="gravacao" role="group" aria-label="Gravando áudio"/);
  assert.match(html, /id="gravar-cancelar" aria-label="Descartar gravação"/);
  assert.match(html, /<span class="onda" id="gravar-onda" aria-hidden="true">(<i><\/i>){10,}/);
  assert.match(html, /<span class="gravar-tempo" id="gravar-tempo">0:00<\/span>/);
});

test('chat do site: grava com MediaRecorder, envia pelo caminho dos anexos e toca áudio com player', () => {
  const js = ler('client/assets/js/widget-chat.js');
  assert.match(js, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(js, /new MediaRecorder\(stream/);
  assert.match(js, /const LIMITE_GRAVACAO_S = 300;/);
  assert.match(js, /await enviarArquivo\(new File\(pedacos, nome, \{ type: mime \}\)\);/);
  assert.match(js, /if \(gravacao\.recorder\) pararGravacao\(false\);\s+else enviar\(\);/, 'enviar encerra a gravação');
  assert.match(js, /\$\('#gravar-cancelar'\)\.addEventListener\('click', \(\) => pararGravacao\(true\)\);/);
  assert.match(js, /if \(cancelada\) return;/);
  assert.match(js, /gravacao\.stream\?\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\);/, 'o microfone é liberado ao parar');
  assert.match(js, /if \(midia\.tipo === 'audio'\) \{\s+const audio = document\.createElement\('audio'\);/);
  assert.match(js, /\$\('#btn-gravar'\)\.disabled = !pode \|\| !suporteGravacao\(\);/);
});

test('chat do site: iframe do site pede permissão de microfone e o visual respeita reduzir movimento', () => {
  assert.match(ler('client/public/widget.js'), /setAttribute\('allow', 'clipboard-write; microphone'\)/);
  const css = ler('client/assets/css/widget.css');
  assert.match(css, /\.compositor\.gravando textarea, \.compositor\.gravando \.anexar, \.compositor\.gravando \.gravar \{ display: none; \}/);
  assert.match(css, /\.compositor\.gravando \.gravacao \{ display: flex; \}/);
  assert.match(css, /@keyframes pulso-gravacao/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.gravar-tempo::before \{ animation: none; \}/);
  assert.match(css, /\.arquivo-audio \{/);
});
