'use strict';

// A tela de Canais é página dentro de Configurações, não uma janela flutuante.
// Estes testes travam isso: se alguém trouxer o modal de volta, o teste quebra.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const javascript = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../client/assets/css/app.css'), 'utf8');

test('canais: é página de configurações, sem janela flutuante', () => {
  assert.doesNotMatch(javascript, /modalCanais/);
  assert.doesNotMatch(javascript, /abrirModalCanais|fecharModalCanais/);
  assert.match(javascript, /if \(id === 'canais'\) carregarCanais\(\);/);
  assert.match(javascript, /if \(config\.secao === 'canais'\) carregarCanais\(\);/);
  // O botão "Conectar canal" do menu do usuário leva para a página, não abre modal.
  assert.match(javascript, /abrirConfiguracoes\('canais'\)/);
});

test('canais: lista WhatsApp, Telegram e o chat do site em cartões', () => {
  assert.match(javascript, /function cartaoCanal\(/);
  assert.match(javascript, /function cartaoChatDoSite\(/);
  assert.match(javascript, /estado\.resumo\?\.widgetAtivo/);
  assert.match(css, /\.lista-canais/);
  assert.match(css, /\.cartao-canal/);
  assert.match(css, /\.estado-canal/);
  // O selo do canal no avatar da conversa é outra coisa e continua existindo.
  assert.match(css, /\.selo-canal \{ width: 18px/);
});

test('canais: tem a seção "Novo número de WhatsApp" com QR Code', () => {
  assert.match(javascript, /'Novo número de WhatsApp'/);
  assert.match(javascript, /'Gerar QR Code'/);
  assert.match(javascript, /function blocoNovoWhatsapp\(/);
  assert.match(javascript, /function blocoNovoTelegram\(/);
  assert.match(css, /\.linha-campos/);
  assert.match(css, /\.campo-canal/);
});

test('canais: a sondagem do QR code para quando se sai da página', () => {
  assert.match(javascript, /if \(!conexao\.canalId \|\| !naPaginaDeCanais\(\)\) return pararSondagem\(\);/);
  assert.match(javascript, /function fecharConfiguracoes\(\) \{\n    pararSondagem\(\);/);
  assert.match(javascript, /if \(config\.secao === 'canais' && id !== 'canais'\) pararSondagem\(\);/);
});
