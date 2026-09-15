const PADRAO_URL = /https?:\/\/[^\s<>"']+/giu;
const PONTUACAO_FINAL = /[.,!?;:]+$/u;
const PARES = [['(', ')'], ['[', ']'], ['{', '}']];

function ocorrencias(texto, caractere) {
  return [...texto].filter((c) => c === caractere).length;
}

function separarFinal(endereco) {
  let url = endereco;
  let final = '';
  const pontuacao = url.match(PONTUACAO_FINAL)?.[0] || '';
  if (pontuacao) {
    url = url.slice(0, -pontuacao.length);
    final = pontuacao;
  }

  for (const [abre, fecha] of PARES) {
    while (url.endsWith(fecha) && ocorrencias(url, fecha) > ocorrencias(url, abre)) {
      url = url.slice(0, -1);
      final = `${fecha}${final}`;
    }
  }
  return { url, final };
}

export function partesDoTextoComLinks(valor) {
  const texto = String(valor || '');
  const partes = [];
  let inicio = 0;

  for (const correspondencia of texto.matchAll(PADRAO_URL)) {
    const bruto = correspondencia[0];
    const indice = correspondencia.index;
    const { url } = separarFinal(bruto);
    let destino;
    try {
      destino = new URL(url);
    } catch {
      continue;
    }
    if (destino.protocol !== 'http:' && destino.protocol !== 'https:') continue;

    if (indice > inicio) partes.push({ tipo: 'texto', texto: texto.slice(inicio, indice) });
    partes.push({ tipo: 'link', texto: url, href: destino.href });
    inicio = indice + url.length;
  }

  if (inicio < texto.length) partes.push({ tipo: 'texto', texto: texto.slice(inicio) });
  if (!partes.length && texto) partes.push({ tipo: 'texto', texto });
  return partes;
}
