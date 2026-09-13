export function assinaturaDaUltimaMensagem(conversa) {
  const momento = Number(conversa?.ultimaEm || 0);
  if (!conversa?.id || !momento) return null;
  return `${momento}:${conversa.ultimaTipo || ''}:${conversa.ultimaTexto || ''}`;
}

export function detectarNovasMensagens(conversas, referencias = new Map(), avisar = false) {
  const proximas = new Map(referencias);
  let recebeuMensagem = false;

  for (const conversa of conversas || []) {
    const assinatura = assinaturaDaUltimaMensagem(conversa);
    if (!assinatura) continue;

    const anterior = referencias.get(conversa.id);
    const recebidaDoCliente = conversa.ultimaTipo === 'cliente';
    const conversaNovaNaoLida = anterior == null && Number(conversa.naoLidas || 0) > 0;
    const mensagemMudou = anterior != null && anterior !== assinatura;

    if (avisar && recebidaDoCliente && (mensagemMudou || conversaNovaNaoLida)) {
      recebeuMensagem = true;
    }
    proximas.set(conversa.id, assinatura);
  }

  return { recebeuMensagem, referencias: proximas };
}
