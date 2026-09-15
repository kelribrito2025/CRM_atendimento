// O status principal pertence à caixa de entrada; a equipe tem seu próprio
// encerramento. Versões antigas, sem statusEquipe, mantêm a leitura anterior.
export function statusNaInbox(conversa, equipeId = null) {
  if (equipeId != null && Number(conversa.equipe?.id) === Number(equipeId)) {
    return conversa.statusEquipe || conversa.status;
  }
  return conversa.status;
}

export function chaveDaInbox(conversaId, equipeId = null) {
  return `${equipeId == null ? 'entrada' : `equipe-${equipeId}`}:${conversaId}`;
}
