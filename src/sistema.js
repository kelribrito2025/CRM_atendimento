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
const { criarUazapi } = require('./uazapi');
const { criarTelegram } = require('./telegram');
const { criarSaldo, URL_PADRAO: SALDO_URL_PADRAO } = require('./saldo');
const { criarS3 } = require('./s3');
const { criarWidget } = require('./widget');
const canais = require('./canais');

const RAIZ = path.join(__dirname, '..');

function lerConfig() {
  carregarEnv(path.join(RAIZ, '.env'));
  return {
    porta: Number(process.env.PORT || 3100),
    caminhoBanco: process.env.DATABASE_URL || process.env.DB_PATH || path.join(RAIZ, 'data', 'crm.sqlite'),
    adminEmail: process.env.ADMIN_EMAIL || 'admin@bigteck.com.br',
    adminSenha: process.env.ADMIN_SENHA || 'admin123',
    adminNome: process.env.ADMIN_NOME || 'Gestor Bigteck',
    dadosExemplo: process.env.DADOS_EXEMPLO === 'true',
    doisFatores: process.env.DOIS_FATORES === 'true',
    baseUrl: process.env.BASE_URL || '',
    cookieSeguro: process.env.COOKIE_SEGURO === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true' ? 1 : false,
    uazapiUrl: process.env.UAZAPI_URL || '',
    uazapiAdminToken: process.env.UAZAPI_ADMIN_TOKEN || '',
    saldoUrl: process.env.SALDO_URL || SALDO_URL_PADRAO,
    saldoToken: process.env.SALDO_TOKEN || '',
    s3Bucket: process.env.S3_BUCKET || 'mindi-storage-bucket',
    s3Regiao: process.env.S3_REGION || 'us-east-1',
    s3Prefixo: process.env.S3_PREFIXO || 'chat-app-numeros',
    s3Chave: process.env.S3_ACCESS_KEY_ID || '',
    s3Segredo: process.env.S3_SECRET_ACCESS_KEY || '',
    widgetSegredo: process.env.WIDGET_SEGREDO || '',
    abrirContaUrl: process.env.ABRIR_CONTA_URL || '',
    widgetEquipeId: Number(process.env.WIDGET_EQUIPE_ID || 0) || null,
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

async function montarSistema(extras = {}) {
  const config = lerConfig();
  const db = await abrirBanco(config.caminhoBanco);
  const resultado = await semear(db, {
    adminEmail: config.adminEmail,
    adminSenha: config.adminSenha,
    adminNome: config.adminNome,
    comDadosExemplo: config.dadosExemplo,
  });
  const enviador = criarEnviador();
  const uazapi = criarUazapi({ url: config.uazapiUrl, adminToken: config.uazapiAdminToken });
  const telegram = criarTelegram();
  const saldo = criarSaldo({ url: config.saldoUrl, token: config.saldoToken });
  const arquivos = criarS3({
    bucket: config.s3Bucket,
    regiao: config.s3Regiao,
    prefixo: config.s3Prefixo,
    accessKeyId: config.s3Chave,
    secretAccessKey: config.s3Segredo,
  });
  const widget = criarWidget(db, { segredo: config.widgetSegredo, equipePadraoId: config.widgetEquipeId });
  const app = criarApp(db, {
    uazapi,
    telegram,
    saldo,
    arquivos,
    widget,
    abrirContaUrl: config.abrirContaUrl,
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
    Promise.all([limparSessoesExpiradas(db), limparAcessosExpirados(db), widget.limparSessoesExpiradas()])
      .catch((erro) => console.error('Limpeza automática falhou:', erro.message));
  }, 60 * 60 * 1000).unref();

  // Religa os bots do Telegram que já estavam conectados.
  resultado.botsTelegram = await canais.ligarTelegramTodos(db, telegram, arquivos);

  return { app, db, config, resultado, enviador, uazapi, telegram, saldo, arquivos, widget };
}

function mostrarBoasVindas({ config, resultado, db }, endereco) {
  console.log('');
  console.log(`✅ CRM Atendimento rodando em ${endereco}`);
  console.log(db?.dialeto === 'mysql'
    ? `🗄️  Banco de dados: MySQL/TiDB (${db.descricao}) — os dados ficam guardados entre publicações.`
    : `🗄️  Banco de dados: arquivo ${config.caminhoBanco}`);
  if (resultado.adminCriado) {
    console.log(`👤 Primeiro acesso → e-mail: ${config.adminEmail} | senha: ${config.adminSenha}`);
    console.log('   Troque a senha depois com: npm run usuario -- --email <seu e-mail> --senha <nova senha>');
  }
  if (resultado.dadosExemploCriados) {
    console.log('📦 Conversas e equipes de exemplo foram criadas para você testar a tela.');
  }
  const removidos = resultado.dadosExemploRemovidos;
  if (removidos && (removidos.conversas || removidos.contatos || removidos.usuarios)) {
    console.log(`🧹 Dados de exemplo removidos: ${removidos.conversas} conversas, ${removidos.contatos} contatos e ${removidos.usuarios} usuários de teste.`);
  }
  console.log(`🔐 Verificação em duas etapas: ${config.doisFatores ? 'ativada' : 'desativada'} (DOIS_FATORES no .env)`);
  console.log('📧 E-mails (código de verificação, recuperação de senha) aparecem aqui nesta janela até um serviço de e-mail ser configurado.');
  console.log(config.uazapiUrl && config.uazapiAdminToken
    ? `📱 WhatsApp (uazapi): configurado em ${config.uazapiUrl}`
    : '📱 WhatsApp (uazapi): não configurado. Preencha UAZAPI_URL e UAZAPI_ADMIN_TOKEN no .env para conectar.');
  console.log(resultado.botsTelegram
    ? `✈️  Telegram: ${resultado.botsTelegram} bot(s) recebendo mensagens.`
    : '✈️  Telegram: conecte um bot pelo menu da conta (avatar) › Conectar canal. Só precisa do token do @BotFather.');
  console.log(config.s3Chave && config.s3Segredo
    ? `🗂️  Arquivos das conversas: guardados no S3 (${config.s3Bucket}/${config.s3Prefixo}/).`
    : '🗂️  Arquivos das conversas: sem S3. Preencha S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY no .env.');
  console.log(config.widgetSegredo
    ? '💬 Chat do site: ligado. O site precisa assinar o id do usuário com o mesmo segredo.'
    : '💬 Chat do site: DESLIGADO. Preencha WIDGET_SEGREDO no .env para ligar (sem ele, nenhuma conversa abre).');
  console.log(config.saldoToken
    ? '💰 Consulta de saldo por PIN: configurada.'
    : '💰 Consulta de saldo por PIN: desligada. Preencha SALDO_TOKEN no .env (a chave fica só no servidor).');
  if (!config.baseUrl) console.log('🌐 BASE_URL não definida: o WhatsApp só consegue entregar mensagens quando o CRM tiver um endereço público.');
  console.log('');
}

module.exports = { RAIZ, lerConfig, pastaPaginas, pastaPublica, montarSistema, mostrarBoasVindas };
