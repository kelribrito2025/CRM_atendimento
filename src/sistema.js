'use strict';

// Monta o sistema completo (configuração, banco, e-mail e aplicação web).
// Usado tanto pelo `npm start` (server.js) quanto pelo Vite/Manus (vite.config.mjs).

const fs = require('node:fs');
const path = require('node:path');
const { carregarEnv } = require('./env');
const { abrirBanco, semear } = require('./db');
const { criarApp } = require('./app');
const { criarEnviador } = require('./email');
const { limparSessoesExpiradas } = require('./sessoes');
const { limparAcessosExpirados } = require('./acesso');

const RAIZ = path.join(__dirname, '..');

function lerConfig() {
  carregarEnv(path.join(RAIZ, '.env'));
  return {
    porta: Number(process.env.PORT || 3100),
    caminhoBanco: process.env.DB_PATH || path.join(RAIZ, 'data', 'crm.sqlite'),
    adminEmail: process.env.ADMIN_EMAIL || 'admin@bigteck.com.br',
    adminSenha: process.env.ADMIN_SENHA || 'admin123',
    adminNome: process.env.ADMIN_NOME || 'Gestor Bigteck',
    dadosExemplo: process.env.DADOS_EXEMPLO !== 'false',
    doisFatores: process.env.DOIS_FATORES === 'true',
    baseUrl: process.env.BASE_URL || '',
    cookieSeguro: process.env.COOKIE_SEGURO === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true' ? 1 : false,
  };
}

// Onde estão as páginas: a versão compilada (dist/public), se existir, senão a pasta client/.
function pastaPaginas() {
  const compilada = path.join(RAIZ, 'dist', 'public');
  return fs.existsSync(path.join(compilada, 'login.html')) ? compilada : path.join(RAIZ, 'client');
}

// Arquivos públicos (ícones do Iconly, bibliotecas): na versão compilada ficam
// na raiz de dist/public; no modo simples ficam em client/public.
function pastaPublica() {
  const paginas = pastaPaginas();
  return paginas.endsWith('client') ? path.join(paginas, 'public') : paginas;
}

function montarSistema(extras = {}) {
  const config = lerConfig();
  const db = abrirBanco(config.caminhoBanco);
  const resultado = semear(db, {
    adminEmail: config.adminEmail,
    adminSenha: config.adminSenha,
    adminNome: config.adminNome,
    comDadosExemplo: config.dadosExemplo,
  });
  const enviador = criarEnviador();
  const app = criarApp(db, {
    cookieSeguro: config.cookieSeguro,
    trustProxy: config.trustProxy,
    doisFatores: config.doisFatores,
    baseUrl: config.baseUrl,
    enviador,
    paginasDir: pastaPaginas(),
    publicoDir: pastaPublica(),
    ...extras,
  });

  // Limpeza periódica de sessões, códigos e links expirados.
  setInterval(() => {
    limparSessoesExpiradas(db);
    limparAcessosExpirados(db);
  }, 60 * 60 * 1000).unref();

  return { app, db, config, resultado, enviador };
}

function mostrarBoasVindas({ config, resultado }, endereco) {
  console.log('');
  console.log(`✅ CRM Atendimento rodando em ${endereco}`);
  if (resultado.adminCriado) {
    console.log(`👤 Primeiro acesso → e-mail: ${config.adminEmail} | senha: ${config.adminSenha}`);
    console.log('   Troque a senha depois com: npm run usuario -- --email <seu e-mail> --senha <nova senha>');
  }
  if (resultado.dadosExemploCriados) {
    console.log('📦 Conversas e equipes de exemplo foram criadas para você testar a tela.');
  }
  console.log(`🔐 Verificação em duas etapas: ${config.doisFatores ? 'ativada' : 'desativada'} (DOIS_FATORES no .env)`);
  console.log('📧 E-mails (código de verificação, recuperação de senha) aparecem aqui nesta janela até um serviço de e-mail ser configurado.');
  console.log('');
}

module.exports = { RAIZ, lerConfig, pastaPaginas, pastaPublica, montarSistema, mostrarBoasVindas };
