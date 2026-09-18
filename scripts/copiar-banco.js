'use strict';

// Copia um banco MySQL/TiDB do CRM para outro (estrutura e dados).
//
//   node scripts/copiar-banco.js --de "mysql://.../crm" --para "mysql://.../crm_dev"
//
// Serve para dois momentos:
//   - montar/renovar o banco do ambiente de desenvolvimento a partir de produção;
//   - migrar produção de um servidor para outro (use --manter-telegram e pare o
//     CRM antigo antes, para os dois não disputarem os bots).
//
// Por segurança:
//   - recusa copiar quando origem e destino são o mesmo banco;
//   - só grava num destino vazio; --substituir apaga as tabelas do destino antes;
//   - a origem só é lida, nunca alterada;
//   - na cópia, os bots do Telegram ficam desconectados (senão dev e produção
//     recebem as mesmas mensagens). --manter-telegram deixa como está.
//
// Opções: --de <url> --para <url> [--substituir] [--manter-telegram] [--lote 500]

const { parseArgs } = require('node:util');
const { opcoesMysql } = require('../src/banco');

const AVISO_TELEGRAM = 'Desligado na cópia do banco. Reconecte o bot só se este ambiente for o único a usá-lo.';

function identidade(url) {
  const o = opcoesMysql(url);
  return `${o.host.toLowerCase()}:${o.port}/${o.database}`;
}

function crase(nome) {
  return `\`${String(nome).replace(/`/g, '``')}\``;
}

// Faz a cópia usando duas conexões já abertas (objetos com `query(sql, params)`).
// Separado da linha de comando para poder ser testado sem servidor.
async function copiarBanco({ origem, destino, substituir = false, manterTelegram = false, lote = 500, log = () => {} }) {
  const [tabelasOrigem] = await origem.query('SHOW TABLES');
  const tabelas = tabelasOrigem.map((linha) => Object.values(linha)[0]);
  if (tabelas.length === 0) throw new Error('A origem não tem nenhuma tabela.');

  const [tabelasDestino] = await destino.query('SHOW TABLES');
  const existentes = tabelasDestino.map((linha) => Object.values(linha)[0]);
  if (existentes.length > 0 && !substituir) {
    throw new Error(`O destino já tem ${existentes.length} tabela(s). Use --substituir para apagá-las antes de copiar.`);
  }

  await destino.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const tabela of existentes) {
      await destino.query(`DROP TABLE IF EXISTS ${crase(tabela)}`);
      log(`🗑️  ${tabela}: apagada no destino`);
    }

    const resumo = {};
    for (const tabela of tabelas) {
      const [[criacao]] = await origem.query(`SHOW CREATE TABLE ${crase(tabela)}`);
      const sql = criacao['Create Table'] || Object.values(criacao)[1];
      await destino.query(sql);

      const [chaves] = await origem.query(`SHOW KEYS FROM ${crase(tabela)} WHERE Key_name = 'PRIMARY'`);
      const ordem = chaves
        .sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
        .map((c) => crase(c.Column_name));
      const ordenacao = ordem.length ? ` ORDER BY ${ordem.join(', ')}` : '';

      let copiadas = 0;
      for (let deslocamento = 0; ; deslocamento += lote) {
        const [linhas] = await origem.query(`SELECT * FROM ${crase(tabela)}${ordenacao} LIMIT ${lote} OFFSET ${deslocamento}`);
        if (linhas.length === 0) break;
        const colunas = Object.keys(linhas[0]);
        const valores = linhas.map((linha) => colunas.map((c) => (linha[c] === undefined ? null : linha[c])));
        await destino.query(`INSERT INTO ${crase(tabela)} (${colunas.map(crase).join(', ')}) VALUES ?`, [valores]);
        copiadas += linhas.length;
        if (linhas.length < lote) break;
      }
      resumo[tabela] = copiadas;
      log(`📋 ${tabela}: ${copiadas} linha(s)`);
    }

    let telegramDesligados = 0;
    if (!manterTelegram && tabelas.includes('canais')) {
      const [r] = await destino.query(
        "UPDATE canais SET status = 'disconnected', ultimo_erro = ?, atualizado_em = ? WHERE tipo = 'telegram' AND status = 'connected'",
        [AVISO_TELEGRAM, Date.now()],
      );
      telegramDesligados = Number(r?.affectedRows || 0);
      if (telegramDesligados) log(`📴 Telegram: ${telegramDesligados} bot(s) marcados como desconectados na cópia`);
    }

    return { tabelas: resumo, telegramDesligados };
  } finally {
    await destino.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
  }
}

async function principal() {
  const { values: args } = parseArgs({
    options: {
      de: { type: 'string' },
      para: { type: 'string' },
      substituir: { type: 'boolean', default: false },
      'manter-telegram': { type: 'boolean', default: false },
      lote: { type: 'string', default: '500' },
    },
  });

  if (!args.de || !args.para) {
    console.error('Uso: node scripts/copiar-banco.js --de "mysql://.../origem" --para "mysql://.../destino" [--substituir] [--manter-telegram]');
    process.exit(1);
  }
  if (!/^mysql(2)?:\/\//i.test(args.de) || !/^mysql(2)?:\/\//i.test(args.para)) {
    console.error('❌ As duas URLs precisam começar com mysql:// (este script não copia o arquivo SQLite local).');
    process.exit(1);
  }
  if (identidade(args.de) === identidade(args.para)) {
    console.error('❌ Origem e destino são o mesmo banco. Nada foi feito.');
    process.exit(1);
  }

  const mysql = require('mysql2/promise');
  const origem = await mysql.createConnection(opcoesMysql(args.de));
  const destino = await mysql.createConnection(opcoesMysql(args.para));
  console.log(`📤 Origem:  ${identidade(args.de)}`);
  console.log(`📥 Destino: ${identidade(args.para)}`);
  console.log('');
  try {
    const r = await copiarBanco({
      origem,
      destino,
      substituir: args.substituir,
      manterTelegram: args['manter-telegram'],
      lote: Math.max(1, Number(args.lote) || 500),
      log: (m) => console.log(m),
    });
    const total = Object.values(r.tabelas).reduce((a, b) => a + b, 0);
    console.log('');
    console.log(`✅ ${Object.keys(r.tabelas).length} tabela(s) e ${total} linha(s) copiadas.`);
    if (!args['manter-telegram']) console.log('   Bots do Telegram ficaram desconectados no destino (use --manter-telegram para preservar).');
  } finally {
    await origem.end().catch(() => {});
    await destino.end().catch(() => {});
  }
}

if (require.main === module) {
  principal().catch((erro) => {
    console.error(`❌ ${erro.message}`);
    process.exit(1);
  });
}

module.exports = { copiarBanco, identidade, AVISO_TELEGRAM };
