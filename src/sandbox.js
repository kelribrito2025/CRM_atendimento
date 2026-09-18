'use strict';

// Modo sandbox (MODO_SANDBOX=true): o CRM roda com dados reais, mas nada que
// envolva um canal de produção sai para fora. Pensado para o ambiente de
// desenvolvimento, que usa uma cópia do banco de produção: responder, excluir
// ou reconectar um canal copiado no dev não pode chegar ao cliente nem mexer no
// WhatsApp/Telegram que produção usa.
//
// A regra é por canal: os tokens dos canais copiados de produção ficam numa
// lista no banco (ajustes.sandbox_tokens_producao, gravada pelo script de
// cópia ou, na falta dela, no primeiro boot com tudo o que existir). Para esses:
//   - WhatsApp (uazapi): envios são "entregues" de mentira; conectar é bloqueado;
//     desconectar, excluir instância e configurar webhook viram no-op.
//   - Telegram: o bot não recebe mensagens (senão disputaria o getUpdates com
//     produção) e envios são "entregues" de mentira.
// Canais criados no próprio ambiente de teste (bot novo, instância nova) não
// estão na lista e funcionam de verdade, para testar de ponta a ponta.
// Abrir a conta do cliente no site fica sempre desligado. Consultas de saldo,
// S3 e chat do site continuam funcionando.

class ErroSandbox extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroSandbox';
    this.status = 400;
  }
}

const AVISO = 'Ambiente de teste: esta ação não é feita de verdade.';
const CHAVE_TOKENS_PROTEGIDOS = 'sandbox_tokens_producao';

function idFalso(prefixo) {
  return `sandbox:${prefixo}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

async function gravarTokensProtegidos(db, tokens) {
  const sql = db.dialeto === 'mysql'
    ? 'INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)'
    : 'INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor';
  await db.prepare(sql).run(CHAVE_TOKENS_PROTEGIDOS, JSON.stringify([...new Set(tokens.map(String))]));
}

// Lista de tokens dos canais copiados de produção. Sem a lista (cópia feita por
// uma versão antiga do script), tudo o que existe agora é tratado como de
// produção; canais criados depois ficam livres.
async function carregarTokensProtegidos(db) {
  const linha = await db.prepare('SELECT valor FROM ajustes WHERE chave = ?').get(CHAVE_TOKENS_PROTEGIDOS);
  if (linha) {
    try {
      const lista = JSON.parse(linha.valor);
      if (Array.isArray(lista)) return new Set(lista.map(String));
    } catch { /* lista corrompida: regrava abaixo */ }
  }
  const canais = await db.prepare("SELECT instancia_token FROM canais WHERE instancia_token IS NOT NULL AND instancia_token != ''").all();
  const tokens = [...new Set(canais.map((c) => String(c.instancia_token)))];
  await gravarTokensProtegidos(db, tokens);
  return new Set(tokens);
}

function envolverUazapi(uazapi, protegido) {
  if (!uazapi) return uazapi;
  const soProtegido = (metodo, falso) => async (token, ...resto) => (protegido(token) ? falso(token, ...resto) : uazapi[metodo](token, ...resto));
  return {
    ...uazapi,
    sandbox: true,
    conectar: soProtegido('conectar', async () => { throw new ErroSandbox(`${AVISO} Este WhatsApp veio de produção; conecte um número de testes.`); }),
    configurarWebhook: soProtegido('configurarWebhook', async () => ({ sandbox: true })),
    desconectar: soProtegido('desconectar', async () => ({ sandbox: true })),
    excluir: soProtegido('excluir', async () => ({ sandbox: true })),
    enviarTexto: soProtegido('enviarTexto', async () => ({ messageid: idFalso('wa') })),
    enviarMidia: soProtegido('enviarMidia', async () => ({ messageid: idFalso('wa') })),
  };
}

function envolverTelegram(telegram, protegido) {
  if (!telegram) return telegram;
  const soProtegido = (metodo, falso) => async (token, ...resto) => (protegido(token) ? falso(token, ...resto) : telegram[metodo](token, ...resto));
  const sondagem = {
    iniciar: (canal, callbacks) => (protegido(canal?.instancia_token) ? null : telegram.sondagem?.iniciar(canal, callbacks) ?? null),
    parar: (id) => telegram.sondagem?.parar(id) ?? false,
    ativo: (id) => telegram.sondagem?.ativo(id) ?? false,
    pararTodas: () => telegram.sondagem?.pararTodas(),
  };
  return {
    ...telegram,
    sandbox: true,
    sondagem,
    removerWebhook: soProtegido('removerWebhook', async () => ({ ok: true, sandbox: true })),
    enviarTexto: soProtegido('enviarTexto', async () => ({ messageId: idFalso('tg') })),
    editarTexto: soProtegido('editarTexto', async (token, chatId, messageId) => ({ messageId: Number(messageId), chatId, editado: true })),
    enviarArquivo: soProtegido('enviarArquivo', async () => ({ messageId: idFalso('tg') })),
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

function aplicarSandbox({ uazapi, telegram, abrirConta, protegidos = new Set() } = {}) {
  const protegido = (token) => protegidos.has(String(token ?? ''));
  return {
    uazapi: envolverUazapi(uazapi, protegido),
    telegram: envolverTelegram(telegram, protegido),
    abrirConta: envolverAbrirConta(abrirConta),
  };
}

module.exports = { aplicarSandbox, carregarTokensProtegidos, gravarTokensProtegidos, ErroSandbox, AVISO, CHAVE_TOKENS_PROTEGIDOS };
