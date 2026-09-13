'use strict';

// Banco usado pelos testes: arquivo em memória (padrão) ou o MySQL de BANCO_TESTE.
// No MySQL as tabelas são apagadas antes de cada teste, para cada um começar limpo.

const { abrirBanco } = require('../src/db');
const { abrirBanco: abrirConexao } = require('../src/banco');

const DESTINO = process.env.BANCO_TESTE || ':memory:';
const ehMysql = /^mysql/i.test(DESTINO);

async function limparTabelas() {
  const db = await abrirConexao(DESTINO);
  const tabelas = await db.prepare('SELECT table_name AS nome FROM information_schema.tables WHERE table_schema = DATABASE()').all();
  if (tabelas.length) {
    await db.exec('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tabelas) await db.exec(`DROP TABLE IF EXISTS \`${t.nome}\``);
    await db.exec('SET FOREIGN_KEY_CHECKS = 1');
  }
  await db.fechar();
}

async function abrirBancoDeTeste() {
  if (ehMysql) await limparTabelas();
  return abrirBanco(DESTINO);
}

module.exports = { abrirBancoDeTeste, ehMysql, DESTINO };
