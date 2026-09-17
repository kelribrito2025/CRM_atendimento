'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { abrirBanco: abrirBancoRuntime } = require('../src/db');
const { abrirBanco: abrirBancoConexao } = require('../src/banco');

function criarDriverFalso() {
  const chamadas = [];
  const pool = {
    async query(rotulo) {
      chamadas.push({ alvo: 'pool', rotulo });
      return [[], []];
    },
    async end() {},
  };
  return {
    chamadas,
    driver: { createPool() { return pool; } },
  };
}

test('abrirBanco runtime recusa SQLite sem inicialização', async () => {
  await assert.rejects(
    abrirBancoRuntime('/tmp/railway-preparation-nao-criar.sqlite', { inicializar: false }),
    /destino MySQL\/TiDB/,
  );
});

test('abrirBanco de conexão não consulta o driver ao abrir sem uso', async () => {
  const falso = criarDriverFalso();
  const banco = await abrirBancoConexao('mysql://example.invalid/database', { driver: falso.driver });

  assert.deepEqual(falso.chamadas, []);
  await banco.fechar();
});
