'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarRotasApi } = require('../src/rotas-api');

test('tidb: consulta de conversas não usa subconsulta dentro da condição ON', () => {
  const consultas = [];
  const db = {
    prepare(sql) {
      consultas.push(sql);
      return {
        async get() { return undefined; },
        async all() { return []; },
        async run() { return { lastInsertRowid: 0, changes: 0 }; },
      };
    },
  };

  criarRotasApi(db);

  const consulta = consultas.find((sql) => sql.includes('FROM conversas c'));
  assert.ok(consulta, 'a consulta de conversas deve ser preparada');
  assert.doesNotMatch(consulta, /ON\s+um\.id\s*=\s*\(\s*SELECT/i);
  assert.match(consulta, /ROW_NUMBER\(\)\s+OVER\s*\(/i);
  assert.match(consulta, /um\.conversa_id\s*=\s*c\.id\s+AND\s+um\.posicao\s*=\s*1/i);
});
