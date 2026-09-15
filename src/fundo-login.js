'use strict';

// Único ativo decorativo aprovado para acesso público. Não é um proxy aberto
// de arquivos de clientes. O nome versionado permite cache longo no navegador.
const CAMINHO_FUNDO_LOGIN = '/manus-storage/login-rotina-equipe_2c5eff27.webp';
const MAX_BYTES = 100_000;

function criarFundoLogin({
  baseUrl,
  chave,
  fetchFn = globalThis.fetch,
} = {}) {
  let pendente = null;
  async function carregar() {
    const endereco = baseUrl ?? process.env.BUILT_IN_FORGE_API_URL;
    const credencial = chave ?? process.env.BUILT_IN_FORGE_API_KEY;
    if (!endereco || !credencial) throw new Error('Armazenamento indisponível.');
    const url = new URL('v1/storage/presign/get', `${String(endereco).replace(/\/+$/, '')}/`);
    url.searchParams.set('path', CAMINHO_FUNDO_LOGIN.slice('/manus-storage/'.length));
    const resposta = await fetchFn(url, { headers: { Authorization: `Bearer ${credencial}` }, signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) throw new Error('Imagem indisponível.');
    const { url: assinada } = await resposta.json();
    if (new URL(assinada).protocol !== 'https:') throw new Error('URL inválida.');
    // A chave da plataforma nunca é repassada ao servidor do arquivo.
    const arquivo = await fetchFn(assinada, { signal: AbortSignal.timeout(8000) });
    if (!arquivo.ok || !arquivo.body || Number(arquivo.headers.get('content-length')) > MAX_BYTES) throw new Error('Arquivo inválido.');
    const partes = [];
    let tamanho = 0;
    for await (const parte of arquivo.body) {
      tamanho += parte.byteLength;
      if (tamanho > MAX_BYTES) throw new Error('Arquivo muito grande.');
      partes.push(Buffer.from(parte));
    }
    const bytes = Buffer.concat(partes);
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Formato inválido.');
    return bytes;
  }
  return async (req, res) => {
    try {
      if (!pendente) pendente = carregar().catch(erro => { pendente = null; throw erro; });
      const bytes = await pendente;
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Length', bytes.length);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noimageindex');
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.statusCode = 503;
      res.setHeader('Cache-Control', 'no-store');
      res.end(); // O fundo verde continua disponível mesmo sem a decoração.
    }
  };
}

module.exports = { CAMINHO_FUNDO_LOGIN, criarFundoLogin };
