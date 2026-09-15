'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBancoDeTeste } = require('./apoio');
const { semear, migrar } = require('../src/db');
const { normalizarHorario, estadoDoHorario, estadoDoAtendente, disponibilidadeDaEquipe, retornoTexto } = require('../src/horarios');

const h = { inicio: '09:00', pausaInicio: '12:00', pausaFim: '13:00', fim: '18:00' };
const instante = (hora, dia = '2026-09-15') => Date.parse(`${dia}T${hora}-03:00`);
const u = { horario_inicio: h.inicio, pausa_inicio: h.pausaInicio, pausa_fim: h.pausaFim, horario_fim: h.fim };

test('horários: quatro horas válidas, ordenadas e estritas, ou null para remover', () => {
  assert.deepEqual(normalizarHorario(h), h);
  assert.equal(normalizarHorario(null), null);
  for (const invalido of [undefined, false, 10, [], {}, { ...h, inicio: '9:00' }, { ...h, inicio: '24:00' }, { ...h, pausaInicio: '12:60' }, { ...h, pausaFim: '12:00' }, { ...h, inicio: '18:00' }, { ...h, fim: '08:00' }]) {
    assert.throws(() => normalizarHorario(invalido));
  }
});

test('horários: fronteiras exatas, fuso de Brasília e próxima transição UTC', () => {
  for (const [hora, fase, proxima] of [
    ['08:59:59', 'fora', '09:00:00'], ['09:00:00', 'trabalho', '12:00:00'],
    ['11:59:59', 'trabalho', '12:00:00'], ['12:00:00', 'pausa', '13:00:00'],
    ['12:59:59', 'pausa', '13:00:00'], ['13:00:00', 'trabalho', '18:00:00'], ['17:59:59', 'trabalho', '18:00:00'],
  ]) {
    const e = estadoDoHorario(h, instante(hora));
    assert.equal(e.fase, fase, hora);
    assert.equal(e.proximaMudancaEm, instante(proxima), hora);
  }
  assert.equal(estadoDoHorario(h, instante('18:00:00')).proximaMudancaEm, instante('09:00:00', '2026-09-16'));
  assert.equal(estadoDoHorario(h, Date.parse('2026-09-15T15:00:00Z')).fase, 'pausa');
  assert.equal(estadoDoHorario(h, instante('12:00:00')).retornaEm, instante('13:00:00'));
  assert.equal(estadoDoHorario({}, instante('12:00:00')).configurado, false);
});

test('horários: sexta, sábado, domingo e virada de mês retornam no próximo dia útil', () => {
  for (const dia of ['2026-09-18', '2026-09-19', '2026-09-20']) {
    const e = estadoDoHorario(h, instante('18:00:00', dia));
    assert.equal(e.fase, 'fora');
    assert.equal(e.proximaMudancaEm, instante('09:00:00', '2026-09-21'));
  }
  assert.equal(estadoDoHorario(h, instante('18:01:00', '2026-07-31')).proximaMudancaEm, instante('09:00:00', '2026-08-03'));
  assert.equal(retornoTexto(instante('09:00:00', '2026-09-21'), instante('18:00:00', '2026-09-18')), 'segunda-feira às 09:00');
  assert.equal(retornoTexto(null), null);
});

test('horários: confirmação não antecipa retorno e só vale para a pausa do próprio dia', () => {
  const confirmado = { ...u, retorno_confirmado_em: instante('13:01:00') };
  assert.equal(estadoDoAtendente(u, instante('13:00:00')).fase, 'retorno');
  assert.equal(estadoDoAtendente(u, instante('17:00:00')).trabalhando, false);
  assert.equal(estadoDoAtendente(confirmado, instante('13:01:00')).fase, 'trabalho');
  assert.equal(estadoDoAtendente(confirmado, instante('12:00:00')).fase, 'pausa');
  assert.equal(estadoDoAtendente(confirmado, instante('13:01:00', '2026-09-16')).fase, 'retorno');
});

test('horários: timer diminui, não fica negativo e suporta pausa maior que uma hora', async () => {
  const { contagemRegressiva } = await import('../client/assets/js/horario-atendimento.mjs');
  const fim = instante('13:00:00');
  assert.equal(contagemRegressiva(fim, instante('12:00:13')), '59:47');
  assert.equal(contagemRegressiva(fim, instante('12:00:14')), '59:46');
  assert.equal(contagemRegressiva(fim, instante('11:00:00')), '120:00');
  assert.equal(contagemRegressiva(fim, fim), '00:00');
  assert.equal(contagemRegressiva(fim, fim + 90000), '00:00');
});

test('horários: migração idempotente, equipe com horários diferentes, bloqueados e sem horário', async () => {
  const db = await abrirBancoDeTeste();
  try {
    await semear(db, { adminEmail: 'hora@teste.com', adminSenha: 'teste123', comDadosExemplo: false });
    let d = await disponibilidadeDaEquipe(db, instante('12:30:00'));
    assert.equal(d.configurado, false);
    const { id } = await db.prepare('SELECT id FROM usuarios LIMIT 1').get();
    await db.prepare('UPDATE usuarios SET horario_inicio = ?, pausa_inicio = ?, pausa_fim = ?, horario_fim = ? WHERE id = ?').run(h.inicio, h.pausaInicio, h.pausaFim, h.fim, id);
    await migrar(db); await migrar(db);
    d = await disponibilidadeDaEquipe(db, instante('12:30:00'));
    assert.equal(d.status, 'pausa'); assert.equal(d.retornaAs, '13:00');
    assert.equal((await disponibilidadeDaEquipe(db, instante('13:00:00'))).status, 'retorno');
    await db.prepare('UPDATE usuarios SET retorno_confirmado_em = ? WHERE id = ?').run(instante('13:00:00'), id);
    assert.equal((await disponibilidadeDaEquipe(db, instante('13:00:00'))).status, 'aberto');
    const segundo = await db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, criado_em, horario_inicio, pausa_inicio, pausa_fim, horario_fim)
      VALUES ('Outro', 'outro@teste.com', 'inutilizavel', '2026-09-15', '12:45', '14:00', '15:00', '20:00')`).run();
    d = await disponibilidadeDaEquipe(db, instante('12:30:00'));
    assert.equal(d.status, 'pausa'); assert.equal(d.retornaAs, '12:45', 'considera quem começa antes do término da pausa');
    assert.equal((await disponibilidadeDaEquipe(db, instante('12:45:00'))).status, 'aberto');
    await db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(segundo.lastInsertRowid);
    assert.equal((await disponibilidadeDaEquipe(db, instante('12:45:00'))).status, 'pausa');
    const publico = JSON.stringify(d);
    assert.doesNotMatch(publico, /@teste|senha|usuarios|atendenteId/);
  } finally { await db.fechar(); }
});
