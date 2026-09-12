'use strict';

const path = require('node:path');
const { carregarEnv } = require('./src/env');

carregarEnv(path.join(__dirname, '.env'));

const { abrirBanco, semear } = require('./src/db');
const { criarApp } = require('./src/app');
const { criarEnviador } = require('./src/email');
const { limparSessoesExpiradas } = require('./src/sessoes');
const { limparAcessosExpirados } = require('./src/acesso');

const PORTA = Number(process.env.PORT || 3100);
const CAMINHO_BANCO = process.env.DB_PATH || path.join(__dirname, 'data', 'crm.sqlite');
const DOIS_FATORES = process.env.DOIS_FATORES === 'true';

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

const enviador = criarEnviador();

const app = criarApp(db, {
  cookieSeguro: process.env.COOKIE_SEGURO === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true' ? 1 : false,
  doisFatores: DOIS_FATORES,
  baseUrl: process.env.BASE_URL,
  enviador,
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
  console.log(`🔐 Verificação em duas etapas: ${DOIS_FATORES ? 'ativada' : 'desativada'} (DOIS_FATORES no .env)`);
  console.log('📧 E-mails (código de verificação, recuperação de senha) aparecem aqui nesta janela até um serviço de e-mail ser configurado.');
  console.log('');
});

// Limpeza periódica de sessões, códigos e links expirados.
setInterval(() => {
  limparSessoesExpiradas(db);
  limparAcessosExpirados(db);
}, 60 * 60 * 1000).unref();
