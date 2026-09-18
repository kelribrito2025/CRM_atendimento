'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { copiarBanco, identidade, AVISO_TELEGRAM } = require('../scripts/copiar-banco');

// Conexão de mentira: responde às consultas que o script faz e guarda o que recebeu.
function conexaoFalsa({ tabelas = {}, existentes = [] } = {}) {
  const consultas = [];
  return {
    consultas,
    async query(sql, params) {
      consultas.push({ sql, params });
      if (sql === 'SHOW TABLES') {
        const nomes = consultas.filter((c) => c.sql === 'SHOW TABLES').length === 1 && existentes.length ? existentes : Object.keys(tabelas);
        return [nomes.map((n) => ({ Tables_in_x: n }))];
      }
      let m = sql.match(/^SHOW CREATE TABLE `(\w+)`$/);
      if (m) return [[{ Table: m[1], 'Create Table': `CREATE TABLE \`${m[1]}\` (...)` }]];
      m = sql.match(/^SHOW KEYS FROM `(\w+)`/);
      if (m) return [(tabelas[m[1]]?.chave || []).map((c, i) => ({ Column_name: c, Seq_in_index: i + 1 }))];
      m = sql.match(/^SELECT \* FROM `(\w+)`(?: ORDER BY (.+?))? LIMIT (\d+) OFFSET (\d+)$/);
      if (m) {
        const linhas = tabelas[m[1]]?.linhas || [];
        return [linhas.slice(Number(m[4]), Number(m[4]) + Number(m[3]))];
      }
      if (/^UPDATE canais SET status = 'disconnected'/.test(sql)) return [{ affectedRows: 2 }];
      return [{ affectedRows: 0 }];
    },
  };
}

const ORIGEM = {
  usuarios: { chave: ['id'], linhas: [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bia' }, { id: 3, nome: 'Caio' }] },
  equipe_membros: { chave: ['equipe_id', 'usuario_id'], linhas: [{ equipe_id: 1, usuario_id: 2 }] },
  ajustes: { chave: [], linhas: [] },
  canais: { chave: ['id'], linhas: [{ id: 7, tipo: 'telegram', status: 'connected' }] },
};

test('copiar-banco: recria as tabelas e copia as linhas em lotes, na ordem da chave primária', async () => {
  const origem = conexaoFalsa({ tabelas: ORIGEM });
  const destino = conexaoFalsa();
  const r = await copiarBanco({ origem, destino, lote: 2 });

  assert.deepEqual(r.tabelas, { usuarios: 3, equipe_membros: 1, ajustes: 0, canais: 1 });
  const sqls = destino.consultas.map((c) => c.sql);
  assert.equal(sqls[0], 'SHOW TABLES');
  assert.equal(sqls[1], 'SET FOREIGN_KEY_CHECKS = 0');
  assert.ok(sqls.includes('CREATE TABLE `usuarios` (...)'));
  assert.ok(sqls.includes('CREATE TABLE `equipe_membros` (...)'));
  assert.equal(sqls.at(-1), 'SET FOREIGN_KEY_CHECKS = 1');

  const inserts = destino.consultas.filter((c) => c.sql.startsWith('INSERT INTO `usuarios`'));
  assert.equal(inserts.length, 2, 'três linhas com lote de 2 viram dois INSERTs');
  assert.equal(inserts[0].sql, 'INSERT INTO `usuarios` (`id`, `nome`) VALUES ?');
  assert.deepEqual(inserts[0].params, [[[1, 'Ana'], [2, 'Bia']]]);
  assert.deepEqual(inserts[1].params, [[[3, 'Caio']]]);

  const selects = origem.consultas.filter((c) => c.sql.startsWith('SELECT * FROM `equipe_membros`'));
  assert.equal(selects[0].sql, 'SELECT * FROM `equipe_membros` ORDER BY `equipe_id`, `usuario_id` LIMIT 2 OFFSET 0');
  assert.ok(origem.consultas.every((c) => !/^(INSERT|UPDATE|DROP|DELETE|CREATE)/.test(c.sql)), 'a origem só é lida');
  assert.ok(!destino.consultas.some((c) => c.sql.startsWith('DROP TABLE')), 'destino vazio não precisa apagar nada');
});

test('copiar-banco: desliga os bots do Telegram na cópia, a menos que --manter-telegram', async () => {
  const destino = conexaoFalsa();
  const r = await copiarBanco({ origem: conexaoFalsa({ tabelas: ORIGEM }), destino });
  const update = destino.consultas.find((c) => c.sql.startsWith('UPDATE canais'));
  assert.ok(update);
  assert.match(update.sql, /WHERE tipo = 'telegram' AND status = 'connected'/);
  assert.equal(update.params[0], AVISO_TELEGRAM);
  assert.equal(r.telegramDesligados, 2);

  const destino2 = conexaoFalsa();
  const r2 = await copiarBanco({ origem: conexaoFalsa({ tabelas: ORIGEM }), destino: destino2, manterTelegram: true });
  assert.ok(!destino2.consultas.some((c) => c.sql.startsWith('UPDATE canais')));
  assert.equal(r2.telegramDesligados, 0);
});

test('copiar-banco: recusa destino com tabelas, salvo com --substituir (que as apaga antes)', async () => {
  const cheio = conexaoFalsa({ existentes: ['usuarios', 'velha'] });
  await assert.rejects(
    copiarBanco({ origem: conexaoFalsa({ tabelas: ORIGEM }), destino: cheio }),
    /já tem 2 tabela\(s\)\. Use --substituir/,
  );
  assert.ok(!cheio.consultas.some((c) => /^(DROP|CREATE|INSERT)/.test(c.sql)), 'nada gravado no destino');

  const cheio2 = conexaoFalsa({ existentes: ['usuarios', 'velha'] });
  await copiarBanco({ origem: conexaoFalsa({ tabelas: ORIGEM }), destino: cheio2, substituir: true });
  const drops = cheio2.consultas.filter((c) => c.sql.startsWith('DROP TABLE')).map((c) => c.sql);
  assert.deepEqual(drops, ['DROP TABLE IF EXISTS `usuarios`', 'DROP TABLE IF EXISTS `velha`']);
  const i = cheio2.consultas.findIndex((c) => c.sql.startsWith('DROP TABLE'));
  assert.equal(cheio2.consultas[i - 1].sql, 'SET FOREIGN_KEY_CHECKS = 0', 'apaga com as chaves estrangeiras desligadas');
});

test('copiar-banco: origem sem tabelas é erro', async () => {
  await assert.rejects(copiarBanco({ origem: conexaoFalsa(), destino: conexaoFalsa() }), /origem não tem nenhuma tabela/);
});

test('copiar-banco: identidade do banco ignora senha, maiúsculas do host e parâmetros', () => {
  assert.equal(identidade('mysql://a:b@Gateway.TiDBcloud.com:4000/crm?ssl=false'), identidade('mysql://c:d@gateway.tidbcloud.com:4000/crm'));
  assert.notEqual(identidade('mysql://a:b@gateway.tidbcloud.com:4000/crm'), identidade('mysql://a:b@gateway.tidbcloud.com:4000/crm_dev'));
});
