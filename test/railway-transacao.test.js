'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { abrirBanco } = require('../src/banco');

function criarDriverFalso() {
  const conexoes = [];
  const pool = {
    async query() {
      throw new Error('consulta fora de transação não esperada neste teste');
    },
    async getConnection() {
      const conexao = {
        marca: `conexao-${conexoes.length + 1}`,
        consultas: [],
        async query(rotulo) {
          this.consultas.push(rotulo);
          return [[{ marca: this.marca, rotulo }], []];
        },
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
      };
      conexoes.push(conexao);
      return conexao;
    },
    async end() {},
  };
  return { conexoes, driver: { createPool() { return pool; } } };
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('transações concorrentes usam a conexão do próprio contexto', async () => {
  const falso = criarDriverFalso();
  const banco = await abrirBanco('mysql://example.invalid/database', { driver: falso.driver });

  const resultados = await Promise.all([
    banco.transacao(async () => {
      await esperar(5);
      return banco.prepare('rotulo-a').get();
    }),
    banco.transacao(async () => {
      await esperar(1);
      return banco.prepare('rotulo-b').get();
    }),
  ]);

  assert.equal(falso.conexoes.length, 2);
  assert.notEqual(resultados[0].marca, resultados[1].marca);
  assert.deepEqual(falso.conexoes.map((c) => c.consultas), [['rotulo-a'], ['rotulo-b']]);
  await banco.fechar();
});

test('transação aninhada é rejeitada sem commit parcial', async () => {
  const falso = criarDriverFalso();
  const banco = await abrirBanco('mysql://example.invalid/database', { driver: falso.driver });

  await banco.transacao(async () => {
    await assert.rejects(
      banco.transacao(async () => {}),
      /Transações aninhadas não são suportadas/,
    );
    const linha = await banco.prepare('rotulo-pai').get();
    assert.equal(linha.marca, falso.conexoes[0].marca);
  });

  assert.deepEqual(falso.conexoes.map((c) => c.consultas), [['rotulo-pai']]);
  await banco.fechar();
});

test('consulta criada no contexto não pode ser usada depois de concluído', async () => {
  const falso = criarDriverFalso();
  const banco = await abrirBanco('mysql://example.invalid/database', { driver: falso.driver });
  let liberar;
  const bloqueio = new Promise((resolve) => { liberar = resolve; });
  let consultaTardia;

  await banco.transacao(async () => {
    consultaTardia = (async () => {
      await bloqueio;
      return banco.prepare('rotulo-tardio').get();
    })();
  });

  liberar();
  await assert.rejects(consultaTardia, /contexto transacional já foi concluído/);
  assert.deepEqual(falso.conexoes.map((c) => c.consultas), [[]]);
  await banco.fechar();
});
