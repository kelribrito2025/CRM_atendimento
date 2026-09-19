'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

test('perfil administrador UI: campo de senha aparece abaixo da lista só para o perfil que pede', () => {
  const html = ler('client/escolher-atendente.html');
  const acesso = ler('client/assets/js/acesso.js');
  assert.match(html, /<div class="campo" id="senha-admin" hidden>/);
  assert.match(html, /<input type="password" id="senha-perfil" name="senha"/);
  assert.match(html, /Só o perfil de administrador pede esta senha\./);
  assert.match(acesso, /pedeSenha = Object\.fromEntries\(dados\.atendentes\.map\(\(a\) => \[Number\(a\.id\), Boolean\(a\.pedeSenha\)\]\)\);/);
  assert.match(acesso, /campoSenha\.hidden = !precisa;/);
  assert.match(acesso, /senha: pedeSenha\[selecionadoId\] \? senha\.value : undefined/);
  assert.match(acesso, /'Administrador · pede senha'/);
});

test('excluir atendente UI: lixeira em cada atendente (não em si mesmo) com confirmação do CRM', () => {
  const tela = ler('client/assets/js/atendimento.js');
  const css = ler('client/assets/css/app.css');
  assert.match(tela, /class: 'btn-icone perigo hov', title: `Excluir \$\{u\.nome\}`/);
  assert.match(tela, /disabled: eu \|\| ehConta \? 'disabled' : null,\s+onclick: \(\) => excluirPessoa\(u\)/);
  const trecho = tela.slice(tela.indexOf('async function excluirPessoa(u)'), tela.indexOf('function editarHorarioDe'));
  assert.match(trecho, /rotuloConfirmar: 'Excluir atendente'/);
  assert.match(trecho, /method: 'DELETE'/);
  assert.match(trecho, /Promise\.all\(\[carregarEquipe\(\), carregarResumo\(\)\]\)/);
  assert.doesNotMatch(trecho, /window\.confirm|\bconfirm\(/);
  assert.match(css, /\.btn-icone\.perigo:hover:not\(:disabled\)/);
});
