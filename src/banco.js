'use strict';

// Camada única de acesso ao banco. Dois formatos, a mesma API:
//   - SQLite (arquivo local): usado no seu computador, sem instalar nada.
//   - MySQL/TiDB (DATABASE_URL): usado na publicação, onde o arquivo não sobrevive.
// Todas as consultas são assíncronas (com await), porque o MySQL responde pela rede.

const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');

const ERRO_CONTEXTO_ENCERRADO = 'O contexto transacional já foi concluído';
const ERRO_TRANSACAO_ANINHADA = 'Transações aninhadas não são suportadas';

function exigirContextoAtivo(armazenamento) {
  const contexto = armazenamento.getStore();
  if (contexto && contexto.estado !== 'ativo') throw new Error(ERRO_CONTEXTO_ENCERRADO);
  return contexto;
}

/* ------------------------------------------------------------------ */
/* SQLite (arquivo)                                                    */
/* ------------------------------------------------------------------ */

function abrirSqlite(caminho) {
  const { DatabaseSync } = require('node:sqlite');
  const emMemoria = caminho === ':memory:';
  if (!emMemoria) fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON;');
  if (!emMemoria) db.exec('PRAGMA journal_mode = WAL;');

  const cache = new Map();
  const preparar = (sql) => {
    let stmt = cache.get(sql);
    if (!stmt) { stmt = db.prepare(sql); cache.set(sql, stmt); }
    return stmt;
  };

  return {
    dialeto: 'sqlite',
    descricao: caminho,
    prepare(sql) {
      return {
        async get(...p) { return preparar(sql).get(...p); },
        async all(...p) { return preparar(sql).all(...p); },
        async run(...p) {
          const info = preparar(sql).run(...p);
          return { lastInsertRowid: Number(info.lastInsertRowid), changes: Number(info.changes) };
        },
      };
    },
    async exec(sql) { db.exec(sql); },
    async transacao(fn) {
      db.exec('BEGIN');
      try {
        const r = await fn();
        db.exec('COMMIT');
        return r;
      } catch (erro) {
        try { db.exec('ROLLBACK'); } catch { /* já desfeito */ }
        throw erro;
      }
    },
    async colunas(tabela) {
      return db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
    },
    async criarIndice(nome, tabela, colunas) {
      db.exec(`CREATE INDEX IF NOT EXISTS ${nome} ON ${tabela}(${colunas});`);
    },
    async fechar() { cache.clear(); db.close(); },
  };
}

/* ------------------------------------------------------------------ */
/* MySQL / TiDB (DATABASE_URL)                                         */
/* ------------------------------------------------------------------ */

// Converte as poucas construções que o SQLite escreve de um jeito e o MySQL de outro.
function traduzir(sql) {
  return sql
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO')
    .replace(/CAST\(([^)]+)\s+AS\s+INTEGER\)/gi, 'CAST($1 AS SIGNED)');
}

async function abrirMysql(url, driver) {
  const mysql = driver || require('mysql2/promise');
  const endereco = new URL(url);
  const pool = mysql.createPool({
    host: endereco.hostname,
    port: Number(endereco.port || 3306),
    user: decodeURIComponent(endereco.username),
    password: decodeURIComponent(endereco.password),
    database: decodeURIComponent(endereco.pathname.replace(/^\//, '')),
    ssl: endereco.searchParams.get('ssl') === 'false' ? undefined : (endereco.hostname.endsWith('.local') || endereco.hostname === '127.0.0.1' || endereco.hostname === 'localhost' ? undefined : { rejectUnauthorized: true }),
    waitForConnections: true,
    connectionLimit: Number(endereco.searchParams.get('pool') || 8),
    charset: 'utf8mb4_general_ci',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: false,
    namedPlaceholders: false,
  });

  // Em transação as consultas precisam ir pela mesma conexão. O armazenamento
  // é local a esta instância, para que transações concorrentes não troquem
  // de conexão entre si.
  const armazenamentoTransacao = new AsyncLocalStorage();

  async function rodar(sql, parametros) {
    const consulta = traduzir(sql);
    const contexto = exigirContextoAtivo(armazenamentoTransacao);
    const alvo = contexto ? contexto.conexao : pool;
    const [resultado] = await alvo.query(consulta, parametros.map((v) => (v === undefined ? null : v)));
    return resultado;
  }

  const banco = {
    dialeto: 'mysql',
    descricao: `${endereco.hostname}/${endereco.pathname.replace(/^\//, '')}`,
    prepare(sql) {
      return {
        async get(...p) { const linhas = await rodar(sql, p); return Array.isArray(linhas) ? linhas[0] : undefined; },
        async all(...p) { const linhas = await rodar(sql, p); return Array.isArray(linhas) ? linhas : []; },
        async run(...p) {
          const r = await rodar(sql, p);
          return { lastInsertRowid: Number(r?.insertId || 0), changes: Number(r?.affectedRows || 0) };
        },
      };
    },
    async exec(sql) {
      for (const parte of sql.split(';')) {
        const comando = parte.trim();
        if (comando) await rodar(comando, []);
      }
    },
    async transacao(fn) {
      const existente = armazenamentoTransacao.getStore();
      if (existente) {
        exigirContextoAtivo(armazenamentoTransacao);
        throw new Error(ERRO_TRANSACAO_ANINHADA);
      }

      const conexao = await pool.getConnection();
      const contexto = { conexao, estado: 'ativo' };
      return armazenamentoTransacao.run(contexto, async () => {
        try {
          await conexao.beginTransaction();
          const r = await fn();
          contexto.estado = 'encerrando';
          await conexao.commit();
          contexto.estado = 'concluido';
          return r;
        } catch (erro) {
          contexto.estado = 'encerrando';
          try { await conexao.rollback(); } catch { /* já desfeito */ }
          contexto.estado = 'concluido';
          throw erro;
        } finally {
          contexto.estado = 'concluido';
          conexao.release();
        }
      });
    },
    async colunas(tabela) {
      exigirContextoAtivo(armazenamentoTransacao);
      const linhas = await banco.prepare(
        'SELECT COLUMN_NAME AS nome FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
      ).all(tabela);
      return linhas.map((c) => c.nome);
    },
    async criarIndice(nome, tabela, colunas) {
      exigirContextoAtivo(armazenamentoTransacao);
      const existe = await banco.prepare(
        'SELECT 1 AS ok FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
      ).get(tabela, nome);
      if (!existe) await banco.exec(`CREATE INDEX ${nome} ON ${tabela}(${colunas})`);
    },
    async fechar() { await pool.end(); },
  };
  return banco;
}

// `destino` é um caminho de arquivo (SQLite) ou uma URL mysql:// (publicação).
async function abrirBanco(destino, opcoes = {}) {
  const alvo = String(destino || '').trim();
  if (/^mysql(2)?:\/\//i.test(alvo)) {
    const driver = opcoes.driver || opcoes.mysql;
    return abrirMysql(alvo.replace(/^mysql2:/i, 'mysql:'), driver);
  }
  return abrirSqlite(alvo || ':memory:');
}

module.exports = { abrirBanco, traduzir };
