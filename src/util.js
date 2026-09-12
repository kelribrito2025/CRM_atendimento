'use strict';

// "Carla Menezes" -> "CM", "Studio Alfa ME" -> "SA", "Marina" -> "MA"
function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (!/[A-Za-zÀ-ÿ]/.test(partes.join(''))) return '☎';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// "Marina Alves" -> "Marina A."
function nomeCurto(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

module.exports = { iniciais, nomeCurto };
