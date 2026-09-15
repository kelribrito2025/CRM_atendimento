'use strict';

// Agenda recorrente de segunda a sexta, no fuso de Brasília. Tudo é calculado
// a partir do instante do servidor: não depende de cron, sessão ou processo vivo.
const FUSO_ATENDIMENTO = 'America/Sao_Paulo';
const HORA_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_ATENDIMENTO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function minutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function normalizarHorario(valor) {
  if (valor === null) return null;
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Informe os quatro horários do atendimento.');
  const horario = { inicio: valor.inicio, pausaInicio: valor.pausaInicio, pausaFim: valor.pausaFim, fim: valor.fim };
  if (Object.values(horario).some((item) => typeof item !== 'string' || !HORA_RE.test(item))) {
    throw new Error('Preencha início, pausa, retorno e fim no formato HH:MM.');
  }
  const ordem = [horario.inicio, horario.pausaInicio, horario.pausaFim, horario.fim].map(minutos);
  if (!(ordem[0] < ordem[1] && ordem[1] < ordem[2] && ordem[2] < ordem[3])) {
    throw new Error('Use a ordem: início < pausa < retorno < fim do atendimento.');
  }
  return horario;
}

function horarioDoUsuario(usuario) {
  try {
    return normalizarHorario({ inicio: usuario?.horario_inicio, pausaInicio: usuario?.pausa_inicio,
      pausaFim: usuario?.pausa_fim, fim: usuario?.horario_fim });
  } catch { return null; }
}

function partesNoFuso(agora) {
  const p = Object.fromEntries(formatador.formatToParts(new Date(agora)).filter((item) => item.type !== 'literal').map((item) => [item.type, Number(item.value)]));
  return { ...p, diaSemana: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(), minutoDoDia: p.hour * 60 + p.minute };
}

// Converte horário civil no fuso para timestamp UTC, inclusive em limites de dia.
function instanteDoHorario(agoraMs, partes, minutoAlvo, diasAdiante = 0) {
  const alvoCivil = Date.UTC(partes.year, partes.month - 1, partes.day + diasAdiante, Math.floor(minutoAlvo / 60), minutoAlvo % 60);
  let instante = alvoCivil;
  for (let i = 0; i < 3; i += 1) {
    const p = partesNoFuso(instante);
    instante += alvoCivil - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return instante;
}

function proximoDiaUtil(diaSemana) {
  let dias = 1;
  while ([0, 6].includes((diaSemana + dias) % 7)) dias += 1;
  return dias;
}

function estadoDoHorario(horario, agora = Date.now()) {
  const h = horario && typeof horario === 'object' && 'inicio' in horario ? normalizarHorario(horario) : horarioDoUsuario(horario);
  const agoraMs = Number(agora);
  if (!h || !Number.isFinite(agoraMs)) return { configurado: false, fase: 'sem_horario', trabalhando: true };
  const p = partesNoFuso(agoraMs);
  const [inicio, pausaInicio, pausaFim, fim] = [h.inicio, h.pausaInicio, h.pausaFim, h.fim].map(minutos);
  const base = { configurado: true, horario: h, fuso: FUSO_ATENDIMENTO };
  const em = (minuto, dias = 0) => instanteDoHorario(agoraMs, p, minuto, dias);
  if ([0, 6].includes(p.diaSemana) || p.minutoDoDia >= fim) {
    return { ...base, fase: 'fora', trabalhando: false, proximaMudancaEm: em(inicio, proximoDiaUtil(p.diaSemana)) };
  }
  if (p.minutoDoDia < inicio) return { ...base, fase: 'fora', trabalhando: false, proximaMudancaEm: em(inicio) };
  if (p.minutoDoDia < pausaInicio) return { ...base, fase: 'trabalho', trabalhando: true, proximaMudancaEm: em(pausaInicio) };
  if (p.minutoDoDia < pausaFim) {
    return { ...base, fase: 'pausa', trabalhando: false, inicioDaPausaEm: em(pausaInicio), retornaEm: em(pausaFim), proximaMudancaEm: em(pausaFim) };
  }
  return { ...base, fase: 'trabalho', trabalhando: true, inicioDaPausaEm: em(pausaInicio), retornoDaPausaEm: em(pausaFim), proximaMudancaEm: em(fim) };
}

function estadoDoAtendente(usuario, agora = Date.now()) {
  const estado = estadoDoHorario(usuario, agora);
  if (estado.retornoDaPausaEm && Number(usuario?.retorno_confirmado_em || 0) < estado.retornoDaPausaEm) {
    return { ...estado, fase: 'retorno', trabalhando: false };
  }
  return estado;
}

function horaBrasilia(instante) {
  if (instante == null || !Number.isFinite(Number(instante))) return null;
  const p = partesNoFuso(Number(instante));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function retornoTexto(instante, agora = Date.now()) {
  if (instante == null || !Number.isFinite(Number(instante))) return null;
  const atual = partesNoFuso(agora);
  const retorno = partesNoFuso(Number(instante));
  const dias = Math.round((Date.UTC(retorno.year, retorno.month - 1, retorno.day) - Date.UTC(atual.year, atual.month - 1, atual.day)) / 86_400_000);
  const hora = horaBrasilia(instante);
  if (dias === 0) return `às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  return `${DIAS[retorno.diaSemana]} às ${hora}`;
}

async function disponibilidadeDaEquipe(db, agora = Date.now()) {
  const usuarios = await db.prepare(`SELECT horario_inicio, pausa_inicio, pausa_fim, horario_fim, retorno_confirmado_em
    FROM usuarios WHERE ativo = 1`).all();
  const estados = usuarios.map((u) => estadoDoAtendente(u, agora)).filter((e) => e.configurado);
  const base = { fuso: FUSO_ATENDIMENTO, agoraServidor: Number(agora) };
  // Contas administrativas sem agenda não mantêm o atendimento aberto 24 horas.
  // Sem nenhuma agenda, preserva integralmente o comportamento anterior.
  if (!estados.length) return { ...base, configurado: false, status: 'aberto', aberto: true };
  const proximaMudancaEm = Math.min(...estados.map((e) => e.proximaMudancaEm));
  if (estados.some((e) => e.trabalhando)) return { ...base, configurado: true, status: 'aberto', aberto: true, proximaMudancaEm };
  if (estados.some((e) => e.fase === 'retorno')) {
    return { ...base, configurado: true, status: 'retorno', aberto: false, proximaMudancaEm };
  }
  const status = estados.some((e) => e.fase === 'pausa') ? 'pausa' : 'fora';
  return { ...base, configurado: true, status, aberto: false, retornaEm: proximaMudancaEm,
    retornaAs: horaBrasilia(proximaMudancaEm), retornoTexto: retornoTexto(proximaMudancaEm, agora), proximaMudancaEm };
}

module.exports = { FUSO_ATENDIMENTO, normalizarHorario, horarioDoUsuario, estadoDoHorario, estadoDoAtendente,
  disponibilidadeDaEquipe, horaBrasilia, retornoTexto };
