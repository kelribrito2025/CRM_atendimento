'use strict';

// Cliente da API do uazapi (WhatsApp não oficial).
// Documentação: https://docs.uazapi.com — cabeçalhos `admintoken` (admin) e `token` (instância).

class ErroUazapi extends Error {
  constructor(mensagem, status = 0, corpo = null) {
    super(mensagem);
    this.name = 'ErroUazapi';
    this.status = status;
    this.corpo = corpo;
  }
}

function criarUazapi({ url, adminToken, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  const configurado = Boolean(base && adminToken);

  async function chamar(metodo, caminho, { token, admin, corpo } = {}) {
    if (!base) throw new ErroUazapi('Servidor do WhatsApp não configurado (UAZAPI_URL).');
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (admin) headers.admintoken = adminToken;
    if (token) headers.token = token;

    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), timeoutMs);
    let resposta;
    try {
      resposta = await fetchImpl(base + caminho, {
        method: metodo,
        headers,
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: controle.signal,
      });
    } catch (erro) {
      const motivo = erro.name === 'AbortError' ? 'tempo esgotado' : erro.message;
      throw new ErroUazapi(`Não foi possível falar com o servidor do WhatsApp (${motivo}).`);
    } finally {
      clearTimeout(temporizador);
    }

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = { bruto: texto };
    }
    if (!resposta.ok) {
      const bruto = dados?.error || dados?.message || dados?.erro || dados?.response;
      const mensagem = typeof bruto === 'string' && bruto ? bruto : `O servidor do WhatsApp respondeu com erro ${resposta.status}.`;
      throw new ErroUazapi(mensagem, resposta.status, dados);
    }
    return dados;
  }

  return {
    configurado,
    base,
    criarInstancia: (nome) => chamar('POST', '/instance/init', { admin: true, corpo: { name: nome } }),
    listarInstancias: () => chamar('GET', '/instance/all', { admin: true }),
    conectar: (token, telefone) => chamar('POST', '/instance/connect', { token, corpo: telefone ? { phone: telefone } : {} }),
    status: (token) => chamar('GET', '/instance/status', { token }),
    desconectar: (token) => chamar('POST', '/instance/disconnect', { token }),
    excluir: (token) => chamar('DELETE', '/instance', { token }),
    async configurarWebhook(token, config) {
      try {
        return await chamar('POST', '/webhook', { token, corpo: config });
      } catch (erro) {
        if (erro.status === 404 || erro.status === 405) return chamar('POST', '/webhook/set', { token, corpo: config });
        throw erro;
      }
    },
    enviarTexto: (token, numero, texto) => chamar('POST', '/send/text', { token, corpo: { number: numero, text: texto } }),

    // Envia um arquivo pelo endereço (URL assinada do S3): o servidor do uazapi
    // busca o arquivo e entrega ao cliente no WhatsApp.
    enviarMidia: (token, numero, { url, tipo = 'document', nome = '', legenda = '' } = {}) => chamar('POST', '/send/media', {
      token,
      corpo: { number: numero, type: tipo, file: url, text: legenda || '', docName: nome || undefined },
    }),
  };
}

// Traduz a resposta de status/connect do uazapi para um formato único.
function interpretarStatus(resposta) {
  const inst = resposta?.instance && typeof resposta.instance === 'object' ? resposta.instance : (resposta || {});
  const st = resposta?.status;
  let status = String(inst.status || inst.state || (typeof st === 'string' ? st : '') || '').toLowerCase();
  if (st && typeof st === 'object') {
    if (st.connected && st.loggedIn !== false) status = 'connected';
    else if (st.connected === false && !status) status = 'disconnected';
  }
  if (!['connected', 'connecting', 'disconnected'].includes(status)) {
    if (status === 'open' || status === 'online') status = 'connected';
    else if (status.includes('connecting') || status.includes('qr') || status.includes('pair')) status = 'connecting';
    else status = 'disconnected';
  }
  const dono = String(inst.owner || inst.jid || inst.wid || st?.jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return {
    status,
    qrcode: inst.qrcode || resposta?.qrcode || null,
    paircode: inst.paircode || resposta?.paircode || null,
    numero: dono || null,
    perfil: inst.profileName || inst.pushName || null,
    instanciaId: inst.id || null,
  };
}

module.exports = { criarUazapi, interpretarStatus, ErroUazapi };
