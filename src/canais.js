'use strict';

// Canais de atendimento (WhatsApp via uazapi): tradução dos eventos recebidos
// por webhook em contatos, conversas e mensagens do CRM.

const crypto = require('node:crypto');

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// "5531998124471@s.whatsapp.net" -> "5531998124471"
function numeroDoChat(chatid) {
  return somenteDigitos(String(chatid || '').split('@')[0].split(':')[0]);
}

function ehGrupo(chatid) {
  const id = String(chatid || '');
  return id.endsWith('@g.us') || id.endsWith('@broadcast') || id === 'status@broadcast';
}

// "5531998124471" -> "+55 31 99812-4471"
function formatarNumero(digitos) {
  const d = somenteDigitos(digitos);
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (m) return `+55 ${m[1]} ${m[2]}-${m[3]}`;
  return d ? `+${d}` : '';
}

function novoSegredo() {
  return crypto.randomBytes(16).toString('hex');
}

const ROTULOS_MIDIA = [
  ['image', '[Imagem]'], ['video', '[Vídeo]'], ['ptt', '[Áudio]'], ['audio', '[Áudio]'],
  ['document', '[Documento]'], ['sticker', '[Figurinha]'], ['location', '[Localização]'],
  ['contact', '[Contato]'], ['poll', '[Enquete]'], ['reaction', '[Reação]'],
];

// Identifica o tipo do evento e o bloco de dados, aceitando os formatos do uazapi.
function extrairEvento(corpo) {
  const tipoBruto = corpo?.EventType || corpo?.event || corpo?.eventType || corpo?.type || null;
  const dados = corpo?.data && typeof corpo.data === 'object' ? corpo.data : corpo;
  return { tipo: tipoBruto ? String(tipoBruto).toLowerCase() : null, dados };
}

function extrairMensagem(dados) {
  const m = dados?.message && typeof dados.message === 'object'
    ? dados.message
    : (dados?.messageid || dados?.chatid ? dados : null);
  if (!m) return null;
  const chat = (dados?.chat && typeof dados.chat === 'object' ? dados.chat : m.chat) || {};
  const chatid = m.chatid || m.chatId || m.remoteJid || m.key?.remoteJid || chat.wa_chatid || chat.id || '';
  const messageid = m.messageid || m.messageId || m.id || m.key?.id || null;
  const fromMe = Boolean(m.fromMe ?? m.key?.fromMe ?? false);
  const tipoMsg = String(m.messageType || m.type || 'text').toLowerCase();

  let texto = '';
  if (typeof m.text === 'string') texto = m.text;
  else if (typeof m.content === 'string') texto = m.content;
  else if (m.content && typeof m.content === 'object') texto = m.content.text || m.content.caption || m.content.conversation || '';
  if (!texto && typeof m.caption === 'string') texto = m.caption;
  if (!texto && typeof m.body === 'string') texto = m.body;
  texto = String(texto || '').trim();

  const midia = ROTULOS_MIDIA.find(([chave]) => tipoMsg.includes(chave));
  if (midia) texto = texto ? `${midia[1]} ${texto}` : midia[1];
  if (!texto && !['text', 'conversation', 'extendedtextmessage', 'chat'].includes(tipoMsg)) texto = `[${tipoMsg}]`;

  const nome = String(m.senderName || m.pushName || m.notifyName || chat.name || chat.wa_contactName || chat.wa_name || dados?.pushName || '').trim();
  const ts = Number(m.messageTimestamp || m.timestamp || m.t || 0);
  const criadaEm = ts > 0 ? (ts > 1e12 ? ts : ts * 1000) : Date.now();

  return {
    chatid,
    messageid,
    fromMe,
    tipoMsg,
    texto,
    nome,
    criadaEm,
    grupo: ehGrupo(chatid) || Boolean(chat.wa_isGroup || m.isGroup),
    status: m.status || dados?.status || null,
  };
}

function interpretarEntrega(status) {
  const s = String(status || '').toUpperCase();
  if (!s) return null;
  if (s.includes('READ') || s.includes('PLAYED') || s === '4' || s === '5') return 'lida';
  if (s.includes('DELIVER') || s === '3') return 'entregue';
  if (s.includes('ERROR') || s.includes('FAIL')) return 'falhou';
  if (s.includes('SENT') || s.includes('SERVER') || s === '2') return 'enviada';
  return null;
}

function interpretarConexao(dados) {
  const bruto = dados?.status ?? dados?.state ?? dados?.instance?.status ?? dados?.connection ?? '';
  const s = String(typeof bruto === 'object' ? (bruto.connected ? 'connected' : 'disconnected') : bruto).toLowerCase();
  if (s === 'open' || s === 'connected' || s === 'online') return 'connected';
  if (s.includes('connecting') || s.includes('qr') || s.includes('pair')) return 'connecting';
  if (s) return 'disconnected';
  return null;
}

function proximoProtocolo(db) {
  const linha = db.prepare("SELECT MAX(CAST(protocolo AS INTEGER)) AS maximo FROM conversas WHERE protocolo GLOB '[0-9]*'").get();
  const maximo = Number(linha?.maximo || 4999);
  return String(Math.max(maximo, 4999) + 1);
}

// Aplica um evento do webhook ao banco. Retorna um resumo do que foi feito.
function processarEvento(db, canal, corpo) {
  const { tipo, dados } = extrairEvento(corpo);
  const agora = Date.now();

  if (tipo === 'connection' || tipo === 'status' || tipo === 'connection.update') {
    const status = interpretarConexao(dados);
    if (status) {
      db.prepare('UPDATE canais SET status = ?, atualizado_em = ? WHERE id = ?').run(status, agora, canal.id);
      return { resultado: 'status', status };
    }
    return { resultado: 'ignorado', motivo: 'status desconhecido' };
  }

  if (tipo === 'messages_update' || tipo === 'message_update' || tipo === 'messages.update' || tipo === 'ack') {
    const m = extrairMensagem(dados);
    const entrega = interpretarEntrega(m?.status);
    if (m?.messageid && entrega) {
      const info = db.prepare("UPDATE mensagens SET entrega = ? WHERE externo_id = ? AND tipo = 'atendente'").run(entrega, m.messageid);
      return { resultado: 'atualizacao', entrega, alteradas: Number(info.changes) };
    }
    return { resultado: 'ignorado', motivo: 'atualização sem id ou status' };
  }

  if (tipo === 'messages' || tipo === 'message' || tipo === 'messages.upsert' || (!tipo && dados?.message)) {
    const m = extrairMensagem(dados);
    if (!m || !m.chatid) return { resultado: 'ignorado', motivo: 'mensagem sem chat' };
    if (m.grupo) return { resultado: 'ignorado', motivo: 'grupo' };
    const numero = numeroDoChat(m.chatid);
    if (!numero) return { resultado: 'ignorado', motivo: 'número inválido' };
    if (!m.texto) return { resultado: 'ignorado', motivo: 'sem conteúdo' };
    if (m.messageid && db.prepare('SELECT 1 FROM mensagens WHERE externo_id = ?').get(m.messageid)) {
      return { resultado: 'ignorado', motivo: 'duplicada' };
    }

    // contato
    let contato = db.prepare('SELECT * FROM contatos WHERE wa_id = ?').get(numero);
    const telefone = formatarNumero(numero);
    if (!contato) {
      const id = Number(db.prepare('INSERT INTO contatos (nome, telefone, wa_id) VALUES (?, ?, ?)')
        .run(m.nome || telefone, telefone, numero).lastInsertRowid);
      contato = { id, nome: m.nome || telefone };
    } else if (m.nome && !m.fromMe && (!contato.nome || contato.nome === contato.telefone || contato.nome.startsWith('+'))) {
      db.prepare('UPDATE contatos SET nome = ? WHERE id = ?').run(m.nome, contato.id);
    }

    // conversa aberta neste canal (ou a última resolvida, que é reaberta)
    let conversa = db.prepare("SELECT id, status FROM conversas WHERE contato_id = ? AND canal_id = ? AND status = 'aberta' ORDER BY id DESC LIMIT 1")
      .get(contato.id, canal.id);
    let nova = false;
    if (!conversa) {
      const id = Number(db.prepare(`
        INSERT INTO conversas (protocolo, contato_id, equipe_id, atendente_id, canal, status, nao_lidas, criada_em, atualizada_em, canal_id, wa_chatid)
        VALUES (?, ?, ?, NULL, 'whatsapp', 'aberta', 0, ?, ?, ?, ?)`)
        .run(proximoProtocolo(db), contato.id, canal.equipe_padrao_id || null, m.criadaEm, m.criadaEm, canal.id, m.chatid).lastInsertRowid);
      conversa = { id, status: 'aberta' };
      nova = true;
    }

    db.prepare('INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, entrega, criada_em, externo_id) VALUES (?, ?, NULL, ?, ?, ?, ?)')
      .run(conversa.id, m.fromMe ? 'atendente' : 'cliente', m.texto, m.fromMe ? 'enviada' : null, m.criadaEm, m.messageid);
    db.prepare('UPDATE conversas SET atualizada_em = ?, nao_lidas = nao_lidas + ?, wa_chatid = COALESCE(wa_chatid, ?) WHERE id = ?')
      .run(Math.max(m.criadaEm, agora), m.fromMe ? 0 : 1, m.chatid, conversa.id);

    return { resultado: 'mensagem', conversaId: conversa.id, contatoId: contato.id, nova, fromMe: m.fromMe };
  }

  return { resultado: 'ignorado', motivo: `evento ${tipo || 'desconhecido'}` };
}

function registrarEvento(db, canalId, tipo, corpo) {
  let texto = '';
  try { texto = JSON.stringify(corpo); } catch { texto = String(corpo); }
  if (texto.length > 100_000) texto = `${texto.slice(0, 100_000)}…`;
  db.prepare('INSERT INTO canal_eventos (canal_id, tipo, corpo, recebido_em) VALUES (?, ?, ?, ?)').run(canalId, tipo || null, texto, Date.now());
  db.prepare('DELETE FROM canal_eventos WHERE canal_id = ? AND id NOT IN (SELECT id FROM canal_eventos WHERE canal_id = ? ORDER BY id DESC LIMIT 200)').run(canalId, canalId);
}

module.exports = {
  somenteDigitos,
  numeroDoChat,
  ehGrupo,
  formatarNumero,
  novoSegredo,
  extrairEvento,
  extrairMensagem,
  interpretarEntrega,
  interpretarConexao,
  processarEvento,
  registrarEvento,
};
