export function deveSalvarNota(evento, texto) {
  return evento?.key === 'Enter'
    && !evento.shiftKey
    && !evento.isComposing
    && Boolean(String(texto || '').trim());
}
