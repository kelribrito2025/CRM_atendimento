'use strict';
const { limitesDoDia, tempoDisponivel, FUSO_ATENDIMENTO } = require('./horarios');
const MAX_INTERVALO_MS = 60_000;
const ENTREGAS = "('enviada', 'entregue', 'lida')";

// O intervalo entre sinais visíveis é uma estimativa de presença, não uma
// jornada presumida nem registro de ponto. Ausências maiores que 60s não contam.
// Compare-and-swap evita dupla contagem em abas/processos concorrentes, sem
// depender de locks ou transações locais ao processo WebDev.
async function registrarTempo(db, usuario, agora, continuo) {
  const { inicio } = limitesDoDia(agora);
  await db.prepare(`INSERT OR IGNORE INTO jornada_tempo
    (atendente_id, dia_inicio_em, primeiro_sinal_em, ultimo_sinal_em, total_ms)
    VALUES (?, ?, ?, ?, 0)`).run(usuario.id, inicio, agora, agora);
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    const atual = await db.prepare('SELECT ultimo_sinal_em FROM jornada_tempo WHERE atendente_id = ? AND dia_inicio_em = ?').get(usuario.id, inicio);
    const anterior = Number(atual.ultimo_sinal_em);
    if (agora <= anterior) return;
    const adicional = continuo && agora - anterior <= MAX_INTERVALO_MS
      ? tempoDisponivel(usuario, anterior, agora) : 0;
    const salvo = await db.prepare(`UPDATE jornada_tempo SET total_ms = total_ms + ?, ultimo_sinal_em = ?
      WHERE atendente_id = ? AND dia_inicio_em = ? AND ultimo_sinal_em = ?`)
      .run(adicional, agora, usuario.id, inicio, anterior);
    if (Number(salvo.changes)) return;
  }
  // Em contenção extrema preferimos subcontar um sinal a contar em dobro.
}

async function metricasDoDia(db, usuarioId, agora = Date.now()) {
  const dia = limitesDoDia(agora);
  // Cada resposta só conclui a espera desde a primeira mensagem do cliente
  // após a última resposta bem-sucedida (de qualquer atendente). Notas, falhas
  // e respostas consecutivas não encurtam artificialmente a média.
  const respostas = await db.prepare(`SELECT a.conversa_id, c.canal, a.criada_em,
      (SELECT MIN(i.criada_em) FROM mensagens i
        WHERE i.conversa_id = a.conversa_id AND i.tipo = 'cliente'
          AND i.id < a.id AND i.criada_em <= a.criada_em
          AND i.id > COALESCE((SELECT MAX(p.id) FROM mensagens p
            WHERE p.conversa_id = a.conversa_id AND p.id < a.id
              AND p.tipo = 'atendente' AND p.entrega IN ${ENTREGAS}), 0)) AS espera_em
    FROM mensagens a JOIN conversas c ON c.id = a.conversa_id
    WHERE a.autor_id = ? AND a.tipo = 'atendente' AND a.entrega IN ${ENTREGAS}
      AND a.criada_em >= ? AND a.criada_em <= ? AND a.criada_em < ?
      AND c.canal IN ('whatsapp', 'telegram', 'widget')`).all(usuarioId, dia.inicio, agora, dia.fim);
  const conversas = { whatsapp: new Set(), telegram: new Set(), widget: new Set() };
  const esperas = [];
  for (const r of respostas) {
    conversas[r.canal].add(Number(r.conversa_id));
    if (r.espera_em != null) esperas.push(Math.max(0, Number(r.criada_em) - Number(r.espera_em)));
  }
  const porCanal = Object.fromEntries(Object.entries(conversas).map(([canal, ids]) => [canal, ids.size]));
  const tempo = await db.prepare('SELECT total_ms, primeiro_sinal_em FROM jornada_tempo WHERE atendente_id = ? AND dia_inicio_em = ?').get(usuarioId, dia.inicio);
  return { atendenteId: Number(usuarioId), diaInicioEm: dia.inicio, ateEm: agora, fuso: FUSO_ATENDIMENTO,
    porCanal, conversasAtendidas: Object.values(porCanal).reduce((a, b) => a + b, 0),
    tempoMedioRespostaMs: esperas.length ? Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length) : null,
    respostasConsideradas: esperas.length,
    tempoOnlineMs: tempo ? Number(tempo.total_ms) : null,
    primeiroRegistroEm: tempo ? Number(tempo.primeiro_sinal_em) : null };
}

module.exports = { registrarTempo, metricasDoDia };
