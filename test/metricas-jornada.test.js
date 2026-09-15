'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBancoDeTeste } = require('./apoio');
const { semear, migrar } = require('../src/db');
const { registrarTempo, metricasDoDia } = require('../src/metricas-jornada');
const { limitesDoDia, tempoDisponivel } = require('../src/horarios');
const em = (h, dia = '2026-09-15') => Date.parse(`${dia}T${h}-03:00`);
const agenda = { horario_inicio: '09:00', pausa_inicio: '12:00', pausa_fim: '13:00', horario_fim: '18:00', retorno_confirmado_em: em('13:05:00') };
async function banco() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: 'metricas@teste.com', adminSenha: 'SenhaTeste123', comDadosExemplo: false });
  const usuario = await db.prepare('SELECT * FROM usuarios LIMIT 1').get();
  return { db, usuario: { ...usuario, ...agenda } };
}

test('métricas: respostas do perfil por canal, sem duplicar conversa, nota ou falha', async () => {
  const { db, usuario } = await banco();
  try {
    const outro = Number((await db.prepare("INSERT INTO usuarios (nome,email,senha_hash,criado_em) VALUES ('Outro','outro@teste.com','inutilizavel','2026-09-15')").run()).lastInsertRowid);
    const contato = Number((await db.prepare("INSERT INTO contatos (nome) VALUES ('Teste')").run()).lastInsertRowid);
    const conversa = async (canal) => Number((await db.prepare('INSERT INTO conversas (protocolo,contato_id,canal,criada_em,atualizada_em,atendente_id) VALUES (?,?,?,?,?,?)').run(`teste-${canal}`,contato,canal,em('00:00:00'),em('18:00:00'),outro)).lastInsertRowid);
    const msg = async (c,tipo,hora,autor=null,entrega=null,dia) => db.prepare('INSERT INTO mensagens (conversa_id,tipo,autor_id,texto,entrega,criada_em) VALUES (?,?,?,?,?,?)').run(c,tipo,autor,'Texto de teste',entrega,em(hora,dia));
    const wa=await conversa('whatsapp'), tg=await conversa('telegram'), site=await conversa('widget');
    await msg(wa,'cliente','09:00:00'); await msg(wa,'cliente','09:00:30');
    await msg(wa,'nota','09:00:45',usuario.id); await msg(wa,'atendente','09:01:00',usuario.id,'falhou');
    await msg(wa,'atendente','09:02:00',usuario.id,'enviada');
    await msg(wa,'atendente','09:03:00',usuario.id,'lida');
    await msg(wa,'cliente','09:04:00'); await msg(wa,'atendente','09:05:00',outro,'entregue');
    await msg(wa,'atendente','09:06:00',usuario.id,'enviada');
    await msg(wa,'cliente','09:07:00'); await msg(wa,'atendente','09:08:00',usuario.id,'entregue');
    await msg(tg,'cliente','10:00:00'); await msg(tg,'atendente','10:01:00',usuario.id,'lida');
    await msg(site,'atendente','11:00:00',usuario.id,'enviada');
    await msg(site,'atendente','19:00:00',usuario.id,'enviada'); // futuro não entra
    const m=await metricasDoDia(db,usuario.id,em('18:00:00'));
    assert.deepEqual(m.porCanal,{whatsapp:1,telegram:1,widget:1});
    assert.equal(m.conversasAtendidas,3); assert.equal(m.respostasConsideradas,3);
    assert.equal(m.tempoMedioRespostaMs,(120000+60000+60000)/3);
    assert.equal(m.tempoOnlineMs,null,'histórico inexistente não vira horas inventadas');
    const ontem=await metricasDoDia(db,usuario.id,em('18:00:00','2026-09-14'));
    assert.equal(ontem.conversasAtendidas,0); assert.equal(ontem.tempoMedioRespostaMs,null);
    const b=await metricasDoDia(db,outro,em('18:00:00'));
    assert.equal(b.conversasAtendidas,1,'atribuição atual não muda autoria das métricas');
  } finally {await db.fechar();}
});

test('tempo no CRM: contador persistente, sem duplicar abas nem preencher ausência', async () => {
  const { db, usuario }=await banco();
  try {
    const registrar=(hora,continuo=true)=>registrarTempo(db,usuario,em(hora),continuo);
    await registrar('09:00:00',false);
    await Promise.all([registrar('09:00:20'),registrar('09:00:30')]);
    assert.equal((await metricasDoDia(db,usuario.id,em('09:01:00'))).tempoOnlineMs,30000);
    await registrar('09:00:30');
    await registrar('10:00:00'); // buraco de uma hora não é trabalho
    await registrar('10:00:20');
    await registrar('10:00:40',false); // retorno depois de fechar todas as abas
    assert.equal((await metricasDoDia(db,usuario.id,em('10:01:00'))).tempoOnlineMs,50000);
    await registrar('11:59:50'); await registrar('12:00:10'); // apenas 10s antes da pausa
    await registrar('12:00:30');
    await registrar('13:04:50'); await registrar('13:05:10'); // 10s após confirmar retorno
    assert.equal((await metricasDoDia(db,usuario.id,em('13:06:00'))).tempoOnlineMs,70000);
    await registrar('17:59:50'); await registrar('18:00:10'); await registrar('18:00:30');
    await migrar(db);
    assert.equal((await metricasDoDia(db,usuario.id,em('18:01:00'))).tempoOnlineMs,80000);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM jornada_tempo').get()).n,1);
    assert.equal((await metricasDoDia(db,usuario.id,em('18:01:00','2026-09-16'))).tempoOnlineMs,null);
  } finally {await db.fechar();}
});

test('tempo: limites de Brasília e disponibilidade excluem pausa, retorno pendente e final de semana', () => {
  assert.equal(limitesDoDia(Date.parse('2026-09-16T02:59:59Z')).inicio,em('00:00:00'));
  assert.equal(limitesDoDia(Date.parse('2026-09-16T03:00:00Z')).inicio,em('00:00:00','2026-09-16'));
  assert.equal(tempoDisponivel(agenda,em('12:00:00'),em('13:05:00')),0);
  assert.equal(tempoDisponivel({...agenda,retorno_confirmado_em:null},em('13:00:00'),em('14:00:00')),0);
  assert.equal(tempoDisponivel(agenda,em('09:00:00','2026-09-19'),em('10:00:00','2026-09-19')),0);
});

test('métricas UI: duração sem nota média nem valores fictícios', async () => {
  const {formatarTempoMetrica}=await import('../client/assets/js/horario-atendimento.mjs');
  assert.equal(formatarTempoMetrica(null),'—'); assert.equal(formatarTempoMetrica(0),'0h 00min');
  assert.equal(formatarTempoMetrica(3900000),'1h 05min');
  assert.equal(formatarTempoMetrica(80000,true),'1min 20s');
  assert.equal(formatarTempoMetrica(30000,true),'30s');
});
