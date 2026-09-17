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
const { criarAvisos } = require('./eventos');
const { criarAbrirConta, URL_PADRAO: ABRIR_CONTA_PADRAO } = require('./abrir-conta');
const canais = require('./canais');

const RAIZ = path.join(__dirname, '..');
const TEM_CHAVE = (nome) => Object.prototype.hasOwnProperty.call(process.env, nome);

function lerFlag(nome, padrao) {
  if (!TEM_CHAVE(nome)) return padrao;
  const valor = String(process.env[nome]).trim().toLowerCase();
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new Error(`${nome} deve ser true ou false.`);
}

function ehMysqlValido(valor) {
  if (!/^mysql2?:\/\//i.test(valor)) return false;
  try {
    const url = new URL(valor);
    return ['mysql:', 'mysql2:'].includes(url.protocol) && Boolean(url.hostname)
      && Boolean(url.pathname.replace(/^\/+/, ''));
  } catch {
    return false;
  }
}

function lerConfig() {
  carregarEnv(path.join(RAIZ, '.env'));
  const ambienteProducao = process.env.NODE_ENV === 'production' || TEM_CHAVE('RAILWAY_ENVIRONMENT_ID');
  const migracoesAutomaticas = lerFlag('MIGRACOES_AUTOMATICAS', !ambienteProducao);
  const integracoesAutomaticas = lerFlag('INTEGRACOES_AUTOMATICAS', !ambienteProducao);
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();

  // Railway/produção nunca usa o fallback de arquivo local.
  if (ambienteProducao && !ehMysqlValido(databaseUrl)) {
    throw new Error('Em produção, DATABASE_URL deve apontar para MySQL/TiDB.');
  }
  // Sem uma senha fornecida, não há bootstrap implícito do administrador.
  if (ambienteProducao && migracoesAutomaticas && !String(process.env.ADMIN_SENHA || '').trim()) {
    throw new Error('ADMIN_SENHA é obrigatória quando as migrações automáticas estão habilitadas em produção.');
  }

  return {
    ambienteProducao,
    migracoesAutomaticas,
    integracoesAutomaticas,
    porta: Number(process.env.PORT || 3100),
    caminhoBanco: databaseUrl || process.env.DB_PATH || path.join(RAIZ, 'data', 'crm.sqlite'),
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
    abrirContaUrl: process.env.ABRIR_CONTA_URL || ABRIR_CONTA_PADRAO,
    abrirContaToken: process.env.ABRIR_CONTA_TOKEN || '',
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
  // A opção é repassada para a camada DB; false não cria schema nem migra.
  const db = await abrirBanco(config.caminhoBanco, { inicializar: config.migracoesAutomaticas });
  let resultado = { adminCriado: false, dadosExemploCriados: false, dadosExemploRemovidos: null, botsTelegram: 0 };

  // Seed só pode acompanhar uma abertura explicitamente inicializadora.
  if (config.migracoesAutomaticas) {
    resultado = await semear(db, {
      adminEmail: config.adminEmail,
      adminSenha: config.adminSenha,
      adminNome: config.adminNome,
      comDadosExemplo: config.dadosExemplo,
    });
  }

  const enviador = criarEnviador({ modo: 'terminal' });
  const uazapi = criarUazapi({ url: config.uazapiUrl, adminToken: config.uazapiAdminToken });
  const telegram = criarTelegram();
  const saldo = criarSaldo({ url: config.saldoUrl, token: config.saldoToken });
  // A configuração S3 existente é preservada; a criação aqui não registra nem envia credenciais.
  const arquivos = criarS3({
    bucket: config.s3Bucket,
    regiao: config.s3Regiao,
    prefixo: config.s3Prefixo,
    accessKeyId: config.s3Chave,
    secretAccessKey: config.s3Segredo,
  });
  const avisos = criarAvisos();
  const widget = criarWidget(db, { segredo: config.widgetSegredo, equipePadraoId: config.widgetEquipeId, arquivos, avisos });
  const abrirConta = criarAbrirConta({ url: config.abrirContaUrl, token: config.abrirContaToken });
  const app = criarApp(db, {
    uazapi,
    telegram,
    saldo,
    arquivos,
    widget,
    abrirConta,
    avisos,
    cookieSeguro: config.cookieSeguro,
    trustProxy: config.trustProxy,
    doisFatores: config.doisFatores,
    baseUrl: config.baseUrl,
    enviador,
    paginasDir: pastaPaginas(),
    publicoDir: pastaPublica(),
    ...extras,
  });

  // A integração automática controla polling e manutenção; rotas HTTP autenticadas
  // e webhooks continuam funcionais quando ela está desligada.
  const automacoesAtivas = config.integracoesAutomaticas;
  let intervaloLimpeza = null;
  if (automacoesAtivas) {
    intervaloLimpeza = setInterval(() => {
      Promise.all([limparSessoesExpiradas(db), limparAcessosExpirados(db), widget.limparSessoesExpiradas()])
        .catch(() => console.error('Limpeza automática falhou.'));
    }, 60 * 60 * 1000);
    intervaloLimpeza.unref?.();
    resultado.botsTelegram = await canais.ligarTelegramTodos(db, telegram, arquivos, avisos);
  }

  let automacoesParadas = false;
  function pararAutomacoes() {
    if (automacoesParadas) return;
    automacoesParadas = true;
    if (intervaloLimpeza) clearInterval(intervaloLimpeza);
    telegram.sondagem?.pararTodas?.();
  }

  let fechamento = null;
  function fechar() {
    if (!fechamento) {
      pararAutomacoes();
      fechamento = Promise.resolve().then(() => db.fechar?.());
    }
    return fechamento;
  }

  return { app, db, config, resultado, enviador, uazapi, telegram, saldo, arquivos, widget, pararAutomacoes, fechar };
}

function mostrarBoasVindas({ config, resultado }, endereco) {
  console.log('');
  console.log(`CRM Atendimento rodando em ${endereco}`);
  console.log(`Banco configurado: ${config.ambienteProducao ? 'MySQL/TiDB' : 'ambiente local'}.`);
  if (resultado.adminCriado) console.log('Administrador inicial criado.');
  if (resultado.dadosExemploCriados) console.log('Dados de exemplo criados.');
  if (resultado.dadosExemploRemovidos && Object.values(resultado.dadosExemploRemovidos).some(Boolean)) {
    console.log('Dados de exemplo anteriores removidos.');
  }
  console.log(`Verificação em duas etapas: ${config.doisFatores ? 'ativada' : 'desativada'}.`);
  console.log('Serviço de e-mail: não configurado; mensagens de teste ficam somente em memória.');
  console.log(`Automações de integração: ${config.integracoesAutomaticas ? 'ativadas' : 'desativadas'}.`);
  console.log(`Telegram inicializado: ${resultado.botsTelegram ? 'sim' : 'não'}.`);
  console.log('');
}

module.exports = { RAIZ, lerConfig, pastaPaginas, pastaPublica, montarSistema, mostrarBoasVindas };
