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

// ===== Arquivos das conversas (anexo do atendente e do cliente) =====

const TAMANHO_MAXIMO_ANEXO = 20 * 1024 * 1024; // 20 MB: é o limite que o Telegram aceita de um bot

// Como o arquivo aparece na lista de conversas quando vai sem legenda.
const ROTULO_MIDIA = { imagem: '[Imagem]', video: '[Vídeo]', audio: '[Áudio]', documento: '[Documento]' };

// De que tipo é o arquivo, para o chat mostrar imagem, vídeo, áudio ou documento.
function tipoDoArquivo(mime, nome = '') {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'imagem';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(nome)) return 'imagem';
  if (/\.(mp4|mov|webm|mkv)$/i.test(nome)) return 'video';
  if (/\.(mp3|ogg|oga|m4a|wav|opus)$/i.test(nome)) return 'audio';
  return 'documento';
}

// O nome do arquivo chega codificado no cabeçalho (acentos não passam em cabeçalho puro).
function nomeDoCabecalho(valor, padrao = 'arquivo') {
  let nome = '';
  try {
    nome = decodeURIComponent(String(valor || ''));
  } catch {
    nome = String(valor || '');
  }
  nome = nome.replace(/[\r\n"\\/]+/g, ' ').trim().slice(0, 120);
  return nome || padrao;
}

function textoDoCabecalho(valor, limite = 1024) {
  let texto = '';
  try {
    texto = decodeURIComponent(String(valor || ''));
  } catch {
    texto = String(valor || '');
  }
  return texto.replace(/[\r\n]+/g, ' ').trim().slice(0, limite);
}

module.exports = { iniciais, nomeCurto, TAMANHO_MAXIMO_ANEXO, ROTULO_MIDIA, tipoDoArquivo, nomeDoCabecalho, textoDoCabecalho };
