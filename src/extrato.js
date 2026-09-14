'use strict';

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

function idDaCompraNoDetalhe(detalhe) {
  const encontrado = String(detalhe || '').match(/\(compra #(\d+)\)/i);
  return encontrado ? Number(encontrado[1]) : null;
}

function motivoDaAuditoria(detalhe) {
  const texto = String(detalhe || '').trim();
  const separador = texto.indexOf('—');
  return separador >= 0 ? texto.slice(separador + 1).trim() : '';
}

function motivoDaDescricao(descricao) {
  return String(descricao || '')
    .replace(/^Reembolso do atendimento:\s*/i, '')
    .trim();
}

function ehReembolsoDoAtendimento(transacao) {
  return transacao?.tipo === 'reembolso_manual'
    || /^reembolso manual$/i.test(String(transacao?.tipoTexto || '').trim())
    || /^Reembolso do atendimento:/i.test(String(transacao?.descricao || '').trim());
}

function personalizarReembolsos(transacoes, auditorias = []) {
  const auditoriaPorCompra = new Map();
  for (const evento of auditorias) {
    const compraId = idDaCompraNoDetalhe(evento.detalhe);
    if (compraId && !auditoriaPorCompra.has(compraId)) auditoriaPorCompra.set(compraId, evento);
  }

  return (transacoes || []).map((transacao) => {
    if (!ehReembolsoDoAtendimento(transacao)) return transacao;

    const auditoria = auditoriaPorCompra.get(Number(transacao.ativacaoId));
    const motivo = motivoDaAuditoria(auditoria?.detalhe) || motivoDaDescricao(transacao.descricao);
    const nome = primeiroNome(auditoria?.usuario_nome);
    const descricao = nome && motivo ? `${nome}: ${motivo}` : (motivo || transacao.descricao);
    return { ...transacao, descricao };
  });
}

module.exports = { ehReembolsoDoAtendimento, personalizarReembolsos };
