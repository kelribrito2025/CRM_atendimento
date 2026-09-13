'use strict';

// "Abrir conta": o atendente entra na conta do cliente no site, já logado.
//
// O CRM não monta o endereço sozinho. Ele pede um link de uso único ao servidor
// do site, dizendo QUEM está abrindo e POR QUÊ — é isso que fica registrado lá.
// A identidade do atendente vem da sessão do CRM, nunca do navegador.

const URL_PADRAO = 'https://app.numero-virtual.com/api/agents/impersonar';
const TAMANHO_MINIMO_MOTIVO = 10;

class ErroAbrirConta extends Error {
  constructor(mensagem, { status = 502 } = {}) {
    super(mensagem);
    this.name = 'ErroAbrirConta';
    this.status = status;
  }
}

function criarAbrirConta({ url = URL_PADRAO, token = '', fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const endereco = String(url || URL_PADRAO).trim();
  const chave = String(token || '').trim();
  const configurado = Boolean(endereco && chave);

  async function pedirLink({ clienteId, atendente, motivo }) {
    const cliente = String(clienteId ?? '').trim();
    const razao = String(motivo ?? '').trim();
    if (!configurado) throw new ErroAbrirConta('Abrir conta não está configurado. Preencha ABRIR_CONTA_TOKEN no .env.', { status: 400 });
    if (!cliente) throw new ErroAbrirConta('Este cliente não veio do chat do site, então não dá para abrir a conta dele.', { status: 400 });
    if (razao.length < TAMANHO_MINIMO_MOTIVO) {
      throw new ErroAbrirConta(`Escreva o motivo com pelo menos ${TAMANHO_MINIMO_MOTIVO} caracteres. Ele fica registrado.`, { status: 400 });
    }

    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), timeoutMs);
    let resposta;
    try {
      resposta = await fetchImpl(endereco, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          clienteId: cliente,
          atendente: { id: String(atendente.id), nome: atendente.nome, email: atendente.email },
          motivo: razao,
        }),
        signal: controle.signal,
      });
    } catch (erro) {
      const porque = erro.name === 'AbortError' ? 'tempo esgotado' : erro.message;
      throw new ErroAbrirConta(`Não foi possível falar com o site (${porque}).`);
    } finally {
      clearTimeout(temporizador);
    }

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }

    if (resposta.status === 404) throw new ErroAbrirConta('Este cliente não existe mais no site.', { status: 404 });
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroAbrirConta('A chave de acesso ao site é inválida ou não tem permissão para abrir contas. Avise o administrador.', { status: 401 });
    }
    if (resposta.status === 400) throw new ErroAbrirConta(dados?.erro || dados?.message || 'O site recusou o pedido. Confira o motivo escrito.', { status: 400 });
    if (!resposta.ok) throw new ErroAbrirConta('O site respondeu com erro. Tente de novo em instantes.', { status: resposta.status });
    if (!dados?.url) throw new ErroAbrirConta('O site não devolveu o endereço para abrir a conta.');

    return { url: String(dados.url), expiraEm: dados.expiraEm || dados.expires_at || null };
  }

  return { configurado, pedirLink };
}

module.exports = { criarAbrirConta, ErroAbrirConta, URL_PADRAO, TAMANHO_MINIMO_MOTIVO };
