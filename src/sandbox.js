'use strict';

// Modo sandbox (MODO_SANDBOX=true): o CRM roda com dados reais, mas nada sai
// para fora. Pensado para o ambiente de desenvolvimento, que usa uma cópia do
// banco de produção: responder, excluir ou conectar canais no dev não pode
// chegar ao cliente nem mexer no WhatsApp/Telegram que produção usa.
//
// O que muda:
//   - WhatsApp (uazapi): envios são "entregues" de mentira; criar, conectar,
//     desconectar, excluir instância e configurar webhook viram no-op ou erro
//     amigável. Consultar status e baixar mídia continuam (só leitura).
//   - Telegram: nenhum bot fica recebendo mensagens (senão disputaria o
//     getUpdates com produção); envios são "entregues" de mentira. Validar
//     token e baixar arquivos continuam (só leitura).
//   - Abrir conta do cliente no site: desligado.
// Saldo por PIN (só leitura), S3 e chat do site continuam funcionando.

class ErroSandbox extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroSandbox';
    this.status = 400;
  }
}

const AVISO = 'Ambiente de teste: esta ação não é feita de verdade.';

function idFalso(prefixo) {
  return `sandbox:${prefixo}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function envolverUazapi(uazapi) {
  if (!uazapi) return uazapi;
  const bloqueado = async () => { throw new ErroSandbox(`${AVISO} Conectar ou alterar um WhatsApp só em produção.`); };
  return {
    ...uazapi,
    sandbox: true,
    criarInstancia: bloqueado,
    conectar: bloqueado,
    configurarWebhook: async () => ({ sandbox: true }),
    desconectar: async () => ({ sandbox: true }),
    excluir: async () => ({ sandbox: true }),
    enviarTexto: async () => ({ messageid: idFalso('wa') }),
    enviarMidia: async () => ({ messageid: idFalso('wa') }),
  };
}

function envolverTelegram(telegram) {
  if (!telegram) return telegram;
  const sondagem = {
    iniciar: () => null,
    parar: () => false,
    ativo: () => false,
    pararTodas: () => {},
  };
  return {
    ...telegram,
    sandbox: true,
    sondagem,
    removerWebhook: async () => ({ ok: true, sandbox: true }),
    enviarTexto: async () => ({ messageId: idFalso('tg') }),
    enviarArquivo: async () => ({ messageId: idFalso('tg') }),
  };
}

function envolverAbrirConta(abrirConta) {
  if (!abrirConta) return abrirConta;
  return {
    ...abrirConta,
    sandbox: true,
    configurado: false,
    pedirLink: async () => { throw new ErroSandbox(`${AVISO} Abrir a conta do cliente só em produção.`); },
  };
}

function aplicarSandbox({ uazapi, telegram, abrirConta } = {}) {
  return {
    uazapi: envolverUazapi(uazapi),
    telegram: envolverTelegram(telegram),
    abrirConta: envolverAbrirConta(abrirConta),
  };
}

module.exports = { aplicarSandbox, ErroSandbox, AVISO };
