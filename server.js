'use strict';

const path = require('node:path');
const { carregarEnv } = require('./src/env');

carregarEnv(path.join(__dirname, '.env'));

const { abrirBanco, semear } = require('./src/db');
const { criarApp } = require('./src/app');
const { limparSessoesExpiradas } = require('./src/sessoes');

const PORTA = Number(process.env.PORT || 3100);
const CAMINHO_BANCO = process.env.DB_PATH || path.join(__dirname, 'data', 'crm.sqlite');

const adminEmail = process.env.ADMIN_EMAIL || 'admin@bigteck.com.br';
const adminSenha = process.env.ADMIN_SENHA || 'admin123';
const adminNome = process.env.ADMIN_NOME || 'Gestor Bigteck';

const db = abrirBanco(CAMINHO_BANCO);
const resultado = semear(db, {
  adminEmail,
  adminSenha,
  adminNome,
  comDadosExemplo: process.env.DADOS_EXEMPLO !== 'false',
});

const app = criarApp(db, {
  cookieSeguro: process.env.COOKIE_SEGURO === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true' ? 1 : false,
});

app.listen(PORTA, () => {
  console.log('');
  console.log(`✅ CRM Atendimento rodando em http://localhost:${PORTA}`);
  if (resultado.adminCriado) {
    console.log(`👤 Primeiro acesso → e-mail: ${adminEmail} | senha: ${adminSenha}`);
    console.log('   Troque a senha depois com: npm run usuario -- --email <seu e-mail> --senha <nova senha>');
  }
  if (resultado.dadosExemploCriados) {
    console.log('📦 Conversas e equipes de exemplo foram criadas para você testar a tela.');
  }
  console.log('');
});

// Limpa sessões expiradas uma vez por hora.
setInterval(() => limparSessoesExpiradas(db), 60 * 60 * 1000).unref();
