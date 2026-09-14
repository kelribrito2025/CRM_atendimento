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
  assert.match(tela, /'Motivo \(opcional\)'/);
  assert.match(tela, /'Crédito manual para a conta'/);
  assert.match(tela, /'Ajuste manual para menos'/);
  assert.doesNotMatch(tela, /com motivo registrado/);

  // Só a folha de SALDO deixou de exigir o motivo. A folha das ações de conta
  // (desativar, banir) continua exigindo — lá o motivo é o que explica, meses
  // depois, por que a conta de alguém foi cortada. Por isso a conferência olha
  // a folha de saldo, e não o arquivo inteiro.
  const inicioFolha = tela.indexOf('function abrirFolhaSaldo');
  const fimFolha = tela.indexOf('function abrirFolhaConta', inicioFolha);
  const folhaSaldo = tela.slice(inicioFolha, fimFolha);
  assert.ok(inicioFolha > 0 && fimFolha > inicioFolha, 'as duas folhas precisam existir');
  assert.doesNotMatch(folhaSaldo, /campoMotivo\.value\.trim\(\)\.length < 10/);

  const folhaConta = tela.slice(fimFolha);
  assert.match(folhaConta, /campoMotivo\.value\.trim\(\)\.length < 10/, 'ação de conta sem motivo não pode sair do CRM');
});
