'use strict';

// Cria um usuário novo ou redefine a senha de um existente.
//
//   npm run usuario -- --email joao@empresa.com.br --senha 123456 --nome "João Silva"
//   npm run usuario -- --email joao@empresa.com.br --senha novaSenha        (redefine senha)
//   npm run usuario -- --email joao@empresa.com.br --papel admin            (torna administrador)
//   npm run usuario -- --email joao@empresa.com.br --desativar              (bloqueia o acesso)
//   npm run usuario -- --listar

const path = require('node:path');
const { parseArgs } = require('node:util');
const { carregarEnv } = require('../src/env');
const { abrirBanco, inserirUsuario } = require('../src/db');
const { gerarHashSenha } = require('../src/senha');
const { encerrarTodasDoUsuario } = require('../src/sessoes');

carregarEnv(path.join(__dirname, '..', '.env'));

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    senha: { type: 'string' },
    nome: { type: 'string' },
    papel: { type: 'string' },
    listar: { type: 'boolean', default: false },
    desativar: { type: 'boolean', default: false },
    ativar: { type: 'boolean', default: false },
  },
});

const db = abrirBanco(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'crm.sqlite'));

function sair(mensagem, codigo = 1) {
  console.error(`❌ ${mensagem}`);
  process.exit(codigo);
}

if (args.listar) {
  const usuarios = db.prepare('SELECT id, nome, email, papel, ativo, criado_em FROM usuarios ORDER BY id').all();
  console.table(usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, ativo: u.ativo ? 'sim' : 'não' })));
  process.exit(0);
}

if (!args.email) {
  console.log('Uso: npm run usuario -- --email <e-mail> --senha <senha> --nome "<Nome>" [--papel admin|atendente]');
  console.log('     npm run usuario -- --listar');
  process.exit(1);
}

const email = args.email.trim().toLowerCase();
if (args.papel && !['admin', 'atendente'].includes(args.papel)) sair('O papel precisa ser "admin" ou "atendente".');

const existente = db.prepare('SELECT id, nome FROM usuarios WHERE email = ?').get(email);

if (args.desativar || args.ativar) {
  if (!existente) sair(`Não existe usuário com o e-mail ${email}.`);
  db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(args.ativar ? 1 : 0, existente.id);
  if (args.desativar) encerrarTodasDoUsuario(db, existente.id);
  console.log(`✅ Usuário ${email} ${args.ativar ? 'ativado' : 'desativado'}.`);
  process.exit(0);
}

try {
  if (existente) {
    const campos = [];
    const valores = [];
    if (args.senha) { campos.push('senha_hash = ?'); valores.push(gerarHashSenha(args.senha)); }
    if (args.nome) { campos.push('nome = ?'); valores.push(args.nome.trim()); }
    if (args.papel) { campos.push('papel = ?'); valores.push(args.papel); }
    if (!campos.length) sair('Usuário já existe. Informe --senha, --nome ou --papel para alterar.');
    valores.push(existente.id);
    db.prepare(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
    if (args.senha) encerrarTodasDoUsuario(db, existente.id);
    console.log(`✅ Usuário ${email} atualizado${args.senha ? ' (senha redefinida)' : ''}.`);
  } else {
    if (!args.senha || !args.nome) sair('Para criar um usuário novo informe --senha e --nome.');
    inserirUsuario(db, { nome: args.nome, email, senha: args.senha, papel: args.papel || 'atendente' });
    console.log(`✅ Usuário ${email} criado.`);
  }
} catch (erro) {
  sair(erro.message);
}
