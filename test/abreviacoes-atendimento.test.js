'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const carregar = () => import('../client/assets/js/acentos.mjs');
const interfaceChat = fs.readFileSync(path.join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');

const APROVADAS = Object.freeze({
  vc: 'você', vcs: 'vocês', vce: 'você', vces: 'vocês', ce: 'você', 'cê': 'você',
  n: 'não', 'ñ': 'não', nao: 'não', tb: 'também', tbm: 'também', tmb: 'também', tmbm: 'também',
  q: 'que', oq: 'o que', qq: 'qualquer', qqr: 'qualquer', qlqr: 'qualquer', qquer: 'qualquer',
  qdo: 'quando', qnd: 'quando', qndo: 'quando', qto: 'quanto', qnt: 'quanto', qnts: 'quantos', qtas: 'quantas',
  pra: 'para', pro: 'para o', pros: 'para os', pras: 'para as', cmg: 'comigo', ctg: 'contigo',
  dnv: 'de novo', dps: 'depois', deps: 'depois', agr: 'agora', hj: 'hoje', amanha: 'amanhã',
  td: 'tudo', tdo: 'tudo', tds: 'todos', alg: 'algum', algm: 'alguém', ngm: 'ninguém', ning: 'ninguém',
  mt: 'muito', mto: 'muito', mta: 'muita', mtos: 'muitos', mtas: 'muitas',
  msm: 'mesmo', msma: 'mesma', msmos: 'mesmos', msmas: 'mesmas',
  pf: 'por favor', pfv: 'por favor', pff: 'por favor', obg: 'obrigado', obgd: 'obrigado', obgdo: 'obrigado',
  vlw: 'valeu', blz: 'beleza', tranq: 'tranquilo', dnd: 'de nada', att: 'atenciosamente', abs: 'abraços',
  msg: 'mensagem', msgs: 'mensagens', info: 'informação', infos: 'informações', doc: 'documento', docs: 'documentos',
  comprov: 'comprovante', pgto: 'pagamento', pagto: 'pagamento', transf: 'transferência', tel: 'telefone', cel: 'celular',
  num: 'número', nro: 'número', prot: 'protocolo', protoc: 'protocolo', atend: 'atendimento', solic: 'solicitação',
  cad: 'cadastro', confirm: 'confirmação', cancel: 'cancelamento', reemb: 'reembolso', recg: 'recarga', compr: 'compra',
  transac: 'transação', verif: 'verificar', cons: 'consultar', usu: 'usuário', cli: 'cliente', obs: 'observação',
  aq: 'aqui', aki: 'aqui', ta: 'está', to: 'estou',
});

test('abreviações: dicionário contém exatamente os 100 pares aprovados', async () => {
  const { ABREVIACOES } = await carregar();
  assert.equal(ABREVIACOES.size, 100);
  assert.deepEqual(Object.fromEntries(ABREVIACOES), APROVADAS);
});

test('abreviações: todos os 100 termos são corrigidos isoladamente', async () => {
  const { corrigirPalavra } = await carregar();
  for (const [antes, depois] of Object.entries(APROVADAS)) {
    assert.equal(corrigirPalavra(antes), depois, `${antes} deveria virar ${depois}`);
  }
});

test('abreviações: corrige espaço e pontuação sem alterar trechos de outras palavras', async () => {
  const { corrigirTexto } = await carregar();
  assert.equal(corrigirTexto('vc tb n ñ. pfv!'), 'você também não não. por favor!');
  assert.equal(corrigirTexto('N recebi, Vc pode verif?'), 'Não recebi, Você pode verificar?');
  assert.equal(corrigirTexto('nuvem trabalho quinta'), 'nuvem trabalho quinta');
  assert.equal(corrigirTexto('pq'), 'pq', 'pq ficou fora por ser ambíguo');
  assert.match(interfaceChat, /\(\\p\{L\}\+\)\(\[\\s\.,;:!/);
  assert.match(interfaceChat, /Correção automática ligada \(acentos e abreviações\)/);
});

test('abreviações: preserva o padrão de maiúsculas', async () => {
  const { corrigirPalavra } = await carregar();
  assert.equal(corrigirPalavra('Vc'), 'Você');
  assert.equal(corrigirPalavra('VC'), 'VOCÊ');
  assert.equal(corrigirPalavra('TB'), 'TAMBÉM');
  assert.equal(corrigirPalavra('Ñ'), 'Não');
});
