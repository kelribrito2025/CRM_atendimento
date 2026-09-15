'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const raiz = path.join(__dirname, '..');

async function modulo() {
  return import(pathToFileURL(path.join(raiz, 'client/assets/js/valor-monetario.mjs')).href);
}

test('valor monetário: trata cada dígito digitado como centavo', async () => {
  const { formatarValorEmCentavos } = await modulo();
  assert.equal(formatarValorEmCentavos('9'), '0,09');
  assert.equal(formatarValorEmCentavos('90'), '0,90');
  assert.equal(formatarValorEmCentavos('900'), '9,00');
  assert.equal(formatarValorEmCentavos('5000'), '50,00');
  assert.equal(formatarValorEmCentavos('123456'), '1.234,56');
});

test('valor monetário: converte o texto formatado de volta para centavos', async () => {
  const { centavosDoValorFormatado } = await modulo();
  assert.equal(centavosDoValorFormatado('9,00'), 900);
  assert.equal(centavosDoValorFormatado('50,00'), 5000);
  assert.equal(centavosDoValorFormatado('1.234,56'), 123456);
  assert.equal(centavosDoValorFormatado('0,00'), null);
  assert.equal(centavosDoValorFormatado(''), null);
});

test('ações de saldo: crédito e débito usam a máscara no campo de valor', () => {
  const tela = fs.readFileSync(path.join(raiz, 'client/assets/js/atendimento.js'), 'utf8');
  const inicioCampo = tela.indexOf("const campoValor = el('input'");
  const fimCampo = tela.indexOf('const campoMotivo', inicioCampo);
  const campo = tela.slice(inicioCampo, fimCampo);

  assert.match(tela, /formatarValorEmCentavos\(campoValor\.value\)/);
  assert.match(tela, /centavosDoValorFormatado\(campoValor\.value\)/);
  assert.match(tela, /inputmode: 'numeric'/);
  assert.match(campo, /value: tipo === 'reembolsar' \? '' : '0,00'/);
  assert.doesNotMatch(campo, /'50,00'/);
  assert.match(tela, /if \(tipo !== 'reembolsar'\) \{[\s\S]*campoValor\.select\(\)/);
  // O motivo voltou a ser obrigatório: o site exige nas sete ações, de 5 a 300.
  assert.doesNotMatch(tela, /'Motivo \(opcional\)'/);
  assert.match(tela, /const MINIMO_DO_MOTIVO = 5;/);
  assert.match(tela, /'Crédito manual para a conta'/);
  assert.match(tela, /'Ajuste manual para menos'/);
  assert.doesNotMatch(tela, /com motivo registrado/);

  // As duas folhas cobram o motivo, e pelo MESMO número: quando o site mudar de
  // ideia de novo, elas mudam juntas em vez de discordarem uma da outra.
  const inicioFolha = tela.indexOf('function abrirFolhaSaldo');
  const fimFolha = tela.indexOf('function abrirFolhaConta', inicioFolha);
  assert.ok(inicioFolha > 0 && fimFolha > inicioFolha, 'as duas folhas precisam existir');

  for (const folha of [tela.slice(inicioFolha, fimFolha), tela.slice(fimFolha)]) {
    assert.match(folha, /campoMotivo\.value\.trim\(\)\.length < MINIMO_DO_MOTIVO/);
    assert.match(folha, /pelo menos \$\{MINIMO_DO_MOTIVO\} caracteres/);
  }
  assert.match(tela, /minlength: '5'/);
  assert.doesNotMatch(tela, /campoMotivo[^\n]*length < 10/, 'o mínimo antigo não pode ter sobrado em lugar nenhum');
});
