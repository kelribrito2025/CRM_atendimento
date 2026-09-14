import { PALAVRAS_ACENTUADAS } from './palavras-acentuadas.mjs';
import { ABREVIACOES_ATENDIMENTO } from './abreviacoes-atendimento.mjs';

// Acentuação automática do português: corrige a palavra quando o atendente
// termina de escrevê-la (espaço, ponto, vírgula…).
//
// Só corrige o que não tem outro sentido sem acento. Palavras como "esta/está",
// "e/é", "a/à", "de/dê" ficam de fora de propósito: sem saber a frase inteira,
// trocar essas mudaria o que a pessoa quis dizer.

// Terminações que quase sempre levam acento ou cedilha. A ordem importa:
// as mais específicas vêm primeiro ("coes" antes de "oes").
const REGRAS = [
  ['coes', 'ções'], // informacoes -> informações
  ['cao', 'ção'], // informacao -> informação
  ['oes', 'ões'], // cartoes -> cartões
  ['ao', 'ão'], // cartao -> cartão
  ['encias', 'ências'],
  ['encia', 'ência'], // transferencia -> transferência
  ['ancias', 'âncias'],
  ['ancia', 'ância'], // importancia -> importância
  ['aveis', 'áveis'],
  ['avel', 'ável'], // responsavel -> responsável
  ['iveis', 'íveis'],
  ['ivel', 'ível'], // disponivel -> disponível
  ['arios', 'ários'],
  ['ario', 'ário'], // usuario -> usuário
  ['arias', 'árias'],
  ['aria', 'ária'], // bancaria -> bancária
  ['orios', 'órios'],
  ['orio', 'ório'], // relatorio -> relatório
  ['orias', 'órias'],
  ['oria', 'ória'],
];

// Palavras explícitas ficam em um arquivo separado para facilitar consulta e edição.
const PALAVRAS = new Map(Object.entries(PALAVRAS_ACENTUADAS));
const ABREVIACOES = new Map(Object.entries(ABREVIACOES_ATENDIMENTO));

function ehMaiuscula(letra) {
  return letra === letra.toUpperCase() && letra !== letra.toLowerCase();
}

// Devolve a palavra com o mesmo tipo de letra da original (Maiúscula, MAIÚSCULA).
function manterCaixa(original, corrigida) {
  if (original === original.toUpperCase() && /[A-ZÀ-Ý]{2,}/.test(original)) return corrigida.toUpperCase();
  if (ehMaiuscula(original[0])) return corrigida[0].toUpperCase() + corrigida.slice(1);
  return corrigida;
}

// Corrige uma palavra; devolve null quando não há nada a mudar.
export function corrigirPalavra(palavra) {
  const original = String(palavra || '');
  if (!original || !/^\p{L}+$/u.test(original)) return null;
  const minuscula = original.toLocaleLowerCase('pt-BR');
  const abreviacao = ABREVIACOES.get(minuscula);
  if (abreviacao) return manterCaixa(original, abreviacao);

  if (original.length < 2) return null;
  // Fora das abreviações aprovadas, palavras já acentuadas passam sem mudança.
  if (!/^[A-Za-z]+$/.test(original)) return null;

  const daLista = PALAVRAS.get(minuscula);
  if (daLista && daLista !== minuscula) return manterCaixa(original, daLista);

  for (const [fim, troca] of REGRAS) {
    // Precisa sobrar pelo menos uma letra antes da terminação ("ao" sozinho não muda).
    if (minuscula.endsWith(fim) && minuscula.length > fim.length) {
      return manterCaixa(original, minuscula.slice(0, -fim.length) + troca);
    }
  }
  return null;
}

// Corrige o texto inteiro (usado ao colar ou antes de enviar).
export function corrigirTexto(texto) {
  return String(texto || '').replace(/\p{L}+/gu, (p) => corrigirPalavra(p) ?? p);
}

export { ABREVIACOES, PALAVRAS, REGRAS };
