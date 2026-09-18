'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Ativo decorativo aprovado, servido localmente para não depender de Forge,
// credenciais ou de um proxy genérico de armazenamento.
const CAMINHO_FUNDO_LOGIN = '/acesso/imagens/login-rotina-equipe.webp';
const NOME_ATIVO = 'login-rotina-equipe.webp';
const MAX_BYTES = 100_000;
const RAIZ = path.join(__dirname, '..');

function caminhosPadrao() {
  return [
    path.join(RAIZ, 'dist', 'public', 'imagens', NOME_ATIVO),
    path.join(RAIZ, 'client', 'public', 'imagens', NOME_ATIVO),
  ];
}

function validarWebp(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error('Arquivo muito grande.');
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Formato inválido.');
  }
  return bytes;
}

function criarFundoLogin({ arquivo = null } = {}) {
  let pendente = null;

  async function carregar() {
    const candidatos = arquivo ? [arquivo] : caminhosPadrao();
    let ultimoErro;
    for (const candidato of candidatos) {
      try {
        return validarWebp(await fs.promises.readFile(candidato));
      } catch (erro) {
        ultimoErro = erro;
        if (erro?.code !== 'ENOENT') break;
      }
    }
    throw ultimoErro || new Error('Imagem indisponível.');
  }

  return async (req, res) => {
    try {
      if (!pendente) pendente = carregar().catch((erro) => { pendente = null; throw erro; });
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
      res.end();
    }
  };
}

module.exports = { CAMINHO_FUNDO_LOGIN, criarFundoLogin };
