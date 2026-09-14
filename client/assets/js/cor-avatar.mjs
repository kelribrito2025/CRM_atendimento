export function estiloAvatarDoCanal(c) {
  const cor = String(c?.canalCor || '').trim();
  if (c?.canal !== 'whatsapp' || !/^#[0-9A-F]{6}$/i.test(cor)) return '';

  const [r, g, b] = [cor.slice(1, 3), cor.slice(3, 5), cor.slice(5, 7)]
    .map((valor) => parseInt(valor, 16));
  const texto = ((r * 299 + g * 587 + b * 114) / 1000) >= 150 ? '#0B1F14' : '#FFFFFF';
  return `background:${cor.toUpperCase()};color:${texto}`;
}
