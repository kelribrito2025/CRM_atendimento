function idDaAtivacao(valor) {
  return Number.isSafeInteger(Number(valor)) && Number(valor) > 0 ? `#${valor}` : '';
}

export function apresentarDescricaoTransacao(transacao) {
  const tipo = String(transacao?.tipo || '').toLowerCase();
  const tipoTexto = String(transacao?.tipoTexto || '');
  const textoOriginal = String(transacao?.descricao || '');
  const numero = transacao?.numero ? String(transacao.numero) : '';
  const ativacaoId = idDaAtivacao(transacao?.ativacaoId);
  const ehCompra = tipo.includes('compra');
  const ehReembolsoManual = tipo.includes('manual') || /^Reembolso manual$/i.test(tipoTexto);
  const ehReembolsoAutomatico = !ehReembolsoManual
    && /^Reembolso (?:autom[aá]tico|de ativa[cç][aã]o cancelada)\b/i.test(textoOriginal);

  if (ehReembolsoAutomatico) {
    return {
      descricao: [numero, ativacaoId].filter(Boolean).join(' - '),
      numero: numero || null,
      complemento: numero && ativacaoId ? ` - ${ativacaoId}` : (numero ? '' : ativacaoId),
    };
  }

  if (ehCompra && numero) {
    const detalhe = textoOriginal.replace(/^Compra\s+/i, '').trim();
    const detalheFormatado = detalhe ? detalhe.charAt(0).toLocaleUpperCase('pt-BR') + detalhe.slice(1) : '';
    return {
      descricao: `${numero}${detalheFormatado ? ` ${detalheFormatado}` : ''}`,
      numero,
      complemento: detalheFormatado ? ` ${detalheFormatado}` : '',
    };
  }

  return { descricao: textoOriginal, numero: null, complemento: null };
}
