'use strict';

// Carrega o arquivo .env (se existir) sem depender de bibliotecas externas.
function carregarEnv(caminho) {
  try {
    process.loadEnvFile(caminho);
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }
}

module.exports = { carregarEnv };
