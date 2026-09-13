'use strict';

// Gera um link de convite para uma pessoa criar a própria conta.
//
//   npm run convite -- --email joao@empresa.com.br
//   npm run convite -- --email joao@empresa.com.br --papel admin
//   npm run convite -- --email joao@empresa.com.br --equipes "Reembolso,Admin" --dias 7
//   npm run convite -- --listar

const path = require('node:path');
const { parseArgs } = require('node:util');
const { carregarEnv } = require('../src/env');
const { abrirBanco } = require('../src/db');
const acesso = require('../src/acesso');

carregarEnv(path.join(__dirname, '..', '.env'));

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    papel: { type: 'string', default: 'atendente' },
    equipes: { type: 'string' },
    dias: { type: 'string', default: '7' },
    listar: { type: 'boolean', default: false },
  },
});

const db = abrirBanco(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'crm.sqlite'));
const porta = process.env.PORT || 3100;
const base = String(process.env.BASE_URL || `http://localhost:${porta}`).replace(/\/$/, '');

function sair(mensagem) {
  console.error(`❌ ${mensagem}`);
  process.exit(1);
}

if (args.listar) {
  const lista = acesso.listarConvitesPendentes(db);
  if (!lista.length) console.log('Nenhum convite pendente.');
  else {
    console.table(lista.map((c) => ({
      email: c.email,
      papel: c.papel,
      convidadoPor: c.convidante || '—',
      expiraEm: new Date(c.expira_em).toLocaleString('pt-BR'),
    })));
  }
  process.exit(0);
}

if (!args.email || !/^\S+@\S+\.\S+$/.test(args.email)) {
  console.log('Uso: npm run convite -- --email <e-mail> [--papel admin|atendente] [--equipes "Reembolso,Admin"] [--dias 7]');
  console.log('     npm run convite -- --listar');
  process.exit(1);
}
if (!['admin', 'atendente'].includes(args.papel)) sair('O papel precisa ser "admin" ou "atendente".');

const dias = Number(args.dias);
if (!Number.isFinite(dias) || dias <= 0) sair('Informe --dias com um número maior que zero.');

const email = args.email.trim().toLowerCase();
const existente = db.prepare('SELECT id FROM usuarios WHERE email = ? AND ativo = 1').get(email);
if (existente) sair('Já existe uma conta ativa com este e-mail. Para trocar a senha use: npm run usuario -- --email ... --senha ...');

const equipeIds = [];
if (args.equipes) {
  const cadastradas = db.prepare('SELECT id, nome FROM equipes ORDER BY ordem, nome').all();
  for (const nome of args.equipes.split(',').map((s) => s.trim()).filter(Boolean)) {
    const equipe = cadastradas.find((e) => e.nome.toLowerCase() === nome.toLowerCase());
    if (!equipe) sair(`Equipe "${nome}" não existe. Equipes cadastradas: ${cadastradas.map((e) => e.nome).join(', ') || 'nenhuma'}.`);
    equipeIds.push(equipe.id);
  }
}

const admin = db.prepare("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo = 1 ORDER BY id LIMIT 1").get();
const { token, expira } = acesso.criarConvite(db, {
  email,
  papel: args.papel,
  equipeIds,
  criadoPor: admin ? admin.id : null,
  validadeMs: dias * 24 * 60 * 60 * 1000,
});

console.log(`✅ Convite criado para ${email} (vale até ${new Date(expira).toLocaleString('pt-BR')}).`);
console.log('Envie este link para a pessoa:');
console.log('');
console.log(`   ${base}/convite?token=${token}`);
console.log('');
