export const DURACAO_CACHE_SALDO = 5 * 60 * 1000;
export const DURACAO_CACHE_ERRO_SALDO = 30 * 1000;

export function criarEntradaCacheSaldo({ conversaId, pin, cliente = null, contato = null, erro = null, em = Date.now() }) {
  return {
    conversaId: Number(conversaId),
    pin: String(pin || '').replace(/\D/g, ''),
    cliente,
    contato,
    erro: erro ? String(erro) : null,
    em: Number(em) || Date.now(),
  };
}

export function cacheSaldoValido(entrada, { conversaId, pin, agora = Date.now() }) {
  if (!entrada) return false;
  if (entrada.conversaId !== Number(conversaId)) return false;
  if (entrada.pin !== String(pin || '').replace(/\D/g, '')) return false;
  const duracao = entrada.erro ? DURACAO_CACHE_ERRO_SALDO : DURACAO_CACHE_SALDO;
  return agora >= entrada.em && agora - entrada.em < duracao;
}
