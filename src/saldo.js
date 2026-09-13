'use strict';

// Consulta de saldo do cliente pelo PIN (API do Número Virtual).
// A chave do agente fica só no servidor: o navegador nunca a recebe.
// Documentação: POST /api/agents/customer/lookup com { pin } ou { email }.

const URL_PADRAO = 'https://app.numero-virtual.com/api/agents/customer/lookup';

class ErroSaldo extends Error {
  constructor(mensagem, { status = 0, naoEncontrado = false } = {}) {
    super(mensagem);
    this.name = 'ErroSaldo';
    this.status = status;
    this.naoEncontrado = naoEncontrado;
  }
}

// O PIN precisa ir como número; o campo da tela entrega texto.
function normalizarPin(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos || digitos.length > 12) return null;
  const numero = Number(digitos);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function emReais(centavos) {
  return (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Guarda o valor em centavos (inteiro) para nunca somar em reais.
function centavosDe(cliente) {
  if (Number.isFinite(cliente?.balanceCents)) return Math.round(cliente.balanceCents);
  if (Number.isFinite(cliente?.balance)) return Math.round(cliente.balance * 100);
  return 0;
}

const ROTULO_STATUS = { active: 'ativa', deactivated: 'desativada', deleted: 'excluída' };

// Devolve só o que a tela precisa mostrar.
function resumirCliente(cliente) {
  const centavos = centavosDe(cliente);
  const recargas = Array.isArray(cliente?.recharges) ? cliente.recharges : [];
  return {
    nome: cliente?.name || null,
    email: cliente?.email || null,
    pin: Number.isFinite(cliente?.pin) ? cliente.pin : null,
    saldoCentavos: centavos,
    saldo: emReais(centavos),
    status: cliente?.status || null,
    statusTexto: ROTULO_STATUS[cliente?.status] || cliente?.status || null,
    bloqueada: Boolean(cliente?.banned),
    totalRecargas: Number.isFinite(cliente?.totalRecharges) ? cliente.totalRecharges : recargas.length,
    ultimaRecarga: recargas.length ? resumirRecarga(recargas[0]) : null,
  };
}

function resumirRecarga(r) {
  const centavos = Number.isFinite(r?.amountCents) ? Math.round(r.amountCents)
    : (Number.isFinite(r?.valueCents) ? Math.round(r.valueCents)
      : (Number.isFinite(r?.amount) ? Math.round(r.amount * 100) : 0));
  const data = r?.createdAt || r?.created_at || r?.date || null;
  return { valor: emReais(centavos), valorCentavos: centavos, data };
}

function criarSaldo({ url = URL_PADRAO, token = '', fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const endereco = String(url || URL_PADRAO).trim();
  const chave = String(token || '').trim();
  const configurado = Boolean(endereco && chave);

  async function consultarPorPin(pinBruto) {
    const pin = normalizarPin(pinBruto);
    if (pin === null) throw new ErroSaldo('Digite um PIN válido (só números).', { status: 400 });
    if (!configurado) throw new ErroSaldo('Consulta de saldo não configurada. Preencha SALDO_TOKEN no arquivo .env e reinicie o sistema.', { status: 400 });

    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), timeoutMs);
    let resposta;
    try {
      resposta = await fetchImpl(endereco, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ pin }),
        signal: controle.signal,
      });
    } catch (erro) {
      const motivo = erro.name === 'AbortError' ? 'tempo esgotado' : erro.message;
      throw new ErroSaldo(`Não foi possível falar com o sistema de saldo (${motivo}).`);
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

    if (resposta.status === 404) throw new ErroSaldo('Nenhum cliente encontrado com este PIN.', { status: 404, naoEncontrado: true });
    if (resposta.status === 401) throw new ErroSaldo('A chave de acesso ao sistema de saldo é inválida ou expirou. Avise o administrador.', { status: 401 });
    if (resposta.status === 400) throw new ErroSaldo('Digite um PIN válido (só números).', { status: 400 });
    if (!resposta.ok) throw new ErroSaldo('O sistema de saldo respondeu com erro. Tente de novo em instantes.', { status: resposta.status });
    if (!dados || typeof dados !== 'object') throw new ErroSaldo('O sistema de saldo devolveu uma resposta inesperada.');

    return resumirCliente(dados);
  }

  return { configurado, consultarPorPin };
}

module.exports = { criarSaldo, normalizarPin, resumirCliente, emReais, ErroSaldo, URL_PADRAO };
