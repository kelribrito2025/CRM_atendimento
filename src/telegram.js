'use strict';

// Cliente da Bot API oficial do Telegram (https://core.telegram.org/bots/api).
// Só precisa do token do bot, criado no @BotFather. As mensagens chegam por
// consulta contínua (getUpdates), então o CRM não precisa de endereço público.

class ErroTelegram extends Error {
  constructor(mensagem, { status = 0, corpo = null, interrompido = false } = {}) {
    super(mensagem);
    this.name = 'ErroTelegram';
    this.status = status;
    this.corpo = corpo;
    this.interrompido = interrompido;
  }
}

const FORMATO_TOKEN = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

function tokenValido(token) {
  return FORMATO_TOKEN.test(String(token || '').trim());
}

function traduzirErro(status, descricao) {
  const d = String(descricao || '');
  if (status === 401 || status === 404) return 'Token do bot inválido ou revogado. Confira o token no @BotFather.';
  if (status === 409) return 'Outro sistema já está recebendo as mensagens deste bot. Feche-o ou use outro bot.';
  if (status === 429) return 'O Telegram pediu para aguardar um pouco (muitas requisições).';
  if (/blocked by the user/i.test(d)) return 'O cliente bloqueou o bot no Telegram.';
  if (/chat not found/i.test(d)) return 'Conversa não encontrada no Telegram.';
  if (/user is deactivated/i.test(d)) return 'A conta do cliente no Telegram foi desativada.';
  return d.replace(/^Bad Request:\s*/i, '') || `O Telegram respondeu com erro ${status}.`;
}

function esperar(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { signal?.removeEventListener('abort', fim); resolve(); }, ms);
    if (typeof t.unref === 'function') t.unref();
    function fim() { clearTimeout(t); resolve(); }
    if (signal) signal.addEventListener('abort', fim, { once: true });
  });
}

function criarTelegram({ fetchImpl = globalThis.fetch, base = 'https://api.telegram.org', timeoutMs = 20_000, esperaSondagemS = 25 } = {}) {
  async function chamar(token, metodo, corpo, { timeout = timeoutMs, signal } = {}) {
    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), timeout);
    const aoAbortar = () => controle.abort();
    if (signal) {
      if (signal.aborted) aoAbortar();
      else signal.addEventListener('abort', aoAbortar, { once: true });
    }
    let resposta;
    try {
      resposta = await fetchImpl(`${base}/bot${token}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo || {}),
        signal: controle.signal,
      });
    } catch (erro) {
      if (signal?.aborted) throw new ErroTelegram('Consulta interrompida.', { interrompido: true });
      const motivo = erro.name === 'AbortError' ? 'tempo esgotado' : erro.message;
      throw new ErroTelegram(`Não foi possível falar com o Telegram (${motivo}).`);
    } finally {
      clearTimeout(temporizador);
      if (signal) signal.removeEventListener('abort', aoAbortar);
    }

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = { bruto: texto };
    }
    if (!resposta.ok || !dados || dados.ok !== true) {
      throw new ErroTelegram(traduzirErro(resposta.status, dados?.description), { status: resposta.status, corpo: dados });
    }
    return dados.result;
  }

  // Confere o token no Telegram e devolve os dados do bot.
  async function validarToken(token) {
    const t = String(token || '').trim();
    if (!tokenValido(t)) {
      throw new ErroTelegram('Token do bot inválido. Ele tem o formato 123456789:AAAA… e é fornecido pelo @BotFather no Telegram.', { status: 400 });
    }
    const eu = await chamar(t, 'getMe');
    return { id: String(eu.id), usuario: eu.username || null, nome: eu.first_name || eu.username || 'Bot' };
  }

  function removerWebhook(token) {
    return chamar(token, 'deleteWebhook', { drop_pending_updates: false });
  }

  async function enviarTexto(token, chatId, texto) {
    const r = await chamar(token, 'sendMessage', { chat_id: chatId, text: String(texto) });
    return { messageId: r?.message_id ?? null, chatId: r?.chat?.id ?? chatId };
  }

  // Onde o arquivo está guardado no Telegram (vale ~1 hora).
  async function obterArquivo(token, fileId) {
    const r = await chamar(token, 'getFile', { file_id: String(fileId) });
    if (!r?.file_path) throw new ErroTelegram('O Telegram não informou onde está o arquivo.');
    return { caminho: r.file_path, tamanho: Number(r.file_size || 0) };
  }

  // Baixa o conteúdo do arquivo (limite do Telegram para bots: 20 MB).
  async function baixarArquivo(token, fileId, { timeout = 60_000 } = {}) {
    const { caminho } = await obterArquivo(token, fileId);
    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), timeout);
    let resposta;
    try {
      resposta = await fetchImpl(`${base}/file/bot${token}/${caminho}`, { signal: controle.signal });
    } catch (erro) {
      const motivo = erro.name === 'AbortError' ? 'tempo esgotado' : erro.message;
      throw new ErroTelegram(`Não foi possível baixar o arquivo do Telegram (${motivo}).`);
    } finally {
      clearTimeout(temporizador);
    }
    if (!resposta.ok) throw new ErroTelegram('O arquivo não está mais disponível no Telegram.', { status: resposta.status });
    const bytes = Buffer.from(await resposta.arrayBuffer());
    return { bytes, tipo: resposta.headers.get('content-type') || null, caminho };
  }

  // Foto de perfil do cliente (a menor versão serve para o avatar).
  async function obterFotoPerfil(token, usuarioId) {
    const r = await chamar(token, 'getUserProfilePhotos', { user_id: Number(usuarioId), limit: 1 });
    const foto = Array.isArray(r?.photos) ? r.photos[0] : null;
    if (!foto || !foto.length) return null;
    const escolhida = foto.find((f) => Number(f.width) >= 160) || foto[foto.length - 1];
    return escolhida?.file_id ? String(escolhida.file_id) : null;
  }

  function obterUpdates(token, offset, { signal } = {}) {
    return chamar(token, 'getUpdates', { offset, timeout: esperaSondagemS, allowed_updates: ['message'] },
      { timeout: (esperaSondagemS + 15) * 1000, signal });
  }

  /* ---------------- consulta contínua (uma por bot conectado) ---------------- */
  const ativas = new Map();

  async function executar(canal, item, { aoReceber, aoEstado }) {
    let offset = 0;
    let atraso = 2000;
    const { signal } = item.controle;
    while (!signal.aborted) {
      try {
        const updates = await obterUpdates(canal.instancia_token, offset, { signal });
        atraso = 2000;
        if (item.ultimoErro) {
          item.ultimoErro = null;
          aoEstado?.({ ok: true });
        }
        for (const u of updates || []) {
          if (typeof u.update_id === 'number') offset = u.update_id + 1;
          try {
            aoReceber?.(u);
          } catch (erro) {
            console.error('Erro ao processar mensagem do Telegram:', erro);
          }
        }
      } catch (erro) {
        if (signal.aborted || erro.interrompido) break;
        const fatal = erro.status === 401 || erro.status === 404;
        if (erro.message !== item.ultimoErro) {
          item.ultimoErro = erro.message;
          aoEstado?.({ ok: false, erro: erro.message, fatal });
        }
        if (fatal) {
          if (ativas.get(canal.id) === item) ativas.delete(canal.id);
          break;
        }
        await esperar(atraso, signal);
        atraso = Math.min(atraso * 2, 60_000);
      }
    }
  }

  const sondagem = {
    iniciar(canal, callbacks = {}) {
      sondagem.parar(canal.id);
      const item = { canalId: canal.id, controle: new AbortController(), ultimoErro: null, promessa: null };
      ativas.set(canal.id, item);
      item.promessa = executar(canal, item, callbacks).catch((erro) => console.error('Consulta ao Telegram interrompida:', erro));
      return item;
    },
    parar(canalId) {
      const item = ativas.get(canalId);
      if (!item) return false;
      ativas.delete(canalId);
      item.controle.abort();
      return true;
    },
    ativo: (canalId) => ativas.has(canalId),
    pararTodas() {
      for (const id of [...ativas.keys()]) sondagem.parar(id);
    },
  };

  return { base, validarToken, removerWebhook, enviarTexto, obterArquivo, baixarArquivo, obterFotoPerfil, obterUpdates, sondagem };
}

module.exports = { criarTelegram, tokenValido, traduzirErro, ErroTelegram };
