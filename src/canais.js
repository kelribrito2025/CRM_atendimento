'use strict';

// Canais de atendimento (WhatsApp via uazapi e Telegram via Bot API): tradução
// dos eventos recebidos em contatos, conversas e mensagens do CRM.

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
  // Alguns servidores do WhatsApp mandam o endereço da foto do contato.
  const fotoUrl = [chat.imagePreview, chat.image, chat.profilePicUrl, chat.wa_profilePicUrl, m.profilePicUrl, dados?.profilePicUrl]
    .find((v) => typeof v === 'string' && /^https?:\/\//.test(v)) || null;
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
    fotoUrl,
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

// O protocolo é um contador guardado em `ajustes`; na primeira vez ele parte do maior já usado.
async function proximoProtocolo(db) {
  const guardado = Number((await db.prepare("SELECT valor FROM ajustes WHERE chave = 'protocolo'").get())?.valor || 0);
  let maximo = guardado;
  if (!guardado) {
    const protocolos = await db.prepare('SELECT protocolo FROM conversas').all();
    for (const p of protocolos) {
      const n = /^\d+$/.test(String(p.protocolo)) ? Number(p.protocolo) : 0;
      if (n > maximo) maximo = n;
    }
  }
  const proximo = Math.max(maximo, 4999) + 1;
  const sql = db.dialeto === 'mysql'
    ? "INSERT INTO ajustes (chave, valor) VALUES ('protocolo', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)"
    : "INSERT INTO ajustes (chave, valor) VALUES ('protocolo', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor";
  await db.prepare(sql).run(String(proximo));
  return String(proximo);
}

// Aplica um evento do webhook ao banco. Retorna um resumo do que foi feito.
async function processarEvento(db, canal, corpo) {
  const { tipo, dados } = extrairEvento(corpo);
  const agora = Date.now();

  if (tipo === 'connection' || tipo === 'status' || tipo === 'connection.update') {
    const status = interpretarConexao(dados);
    if (status) {
      await db.prepare('UPDATE canais SET status = ?, atualizado_em = ? WHERE id = ?').run(status, agora, canal.id);
      return { resultado: 'status', status };
    }
    return { resultado: 'ignorado', motivo: 'status desconhecido' };
  }

  if (tipo === 'messages_update' || tipo === 'message_update' || tipo === 'messages.update' || tipo === 'ack') {
    const m = extrairMensagem(dados);
    const entrega = interpretarEntrega(m?.status);
    if (m?.messageid && entrega) {
      const info = await db.prepare("UPDATE mensagens SET entrega = ? WHERE externo_id = ? AND tipo = 'atendente'").run(entrega, m.messageid);
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
    if (m.messageid && await db.prepare('SELECT 1 FROM mensagens WHERE externo_id = ?').get(m.messageid)) {
      return { resultado: 'ignorado', motivo: 'duplicada' };
    }

    // contato
    let contato = await db.prepare('SELECT * FROM contatos WHERE wa_id = ?').get(numero);
    const telefone = formatarNumero(numero);
    if (!contato) {
      const id = Number((await db.prepare('INSERT INTO contatos (nome, telefone, wa_id) VALUES (?, ?, ?)')
        .run(m.nome || telefone, telefone, numero)).lastInsertRowid);
      contato = { id, nome: m.nome || telefone };
    } else if (m.nome && !m.fromMe && (!contato.nome || contato.nome === contato.telefone || contato.nome.startsWith('+'))) {
      await db.prepare('UPDATE contatos SET nome = ? WHERE id = ?').run(m.nome, contato.id);
    }
    if (m.fotoUrl && m.fotoUrl !== contato.wa_foto_url) {
      await db.prepare('UPDATE contatos SET wa_foto_url = ? WHERE id = ?').run(m.fotoUrl, contato.id);
      contato.wa_foto_url = m.fotoUrl;
    }

    return await guardarMensagem(db, canal, contato, m, 'whatsapp');
  }

  return { resultado: 'ignorado', motivo: `evento ${tipo || 'desconhecido'}` };
}

// Guarda uma mensagem recebida na conversa do contato neste canal (cria a conversa só na primeira vez).
// Se a conversa estava resolvida, ela reabre com todo o histórico: o mesmo cliente
// nunca começa do zero.
async function guardarMensagem(db, canal, contato, m, tipoCanal) {
  const agora = Date.now();
  let conversa = await db.prepare('SELECT id, status FROM conversas WHERE contato_id = ? AND canal_id = ? ORDER BY id DESC LIMIT 1')
    .get(contato.id, canal.id);
  let nova = false;
  if (conversa && conversa.status !== 'aberta' && !m.fromMe) {
    await db.prepare("UPDATE conversas SET status = 'aberta' WHERE id = ?").run(conversa.id);
    conversa.status = 'aberta';
  }
  if (!conversa) {
    const id = Number((await db.prepare(`
      INSERT INTO conversas (protocolo, contato_id, equipe_id, atendente_id, canal, status, nao_lidas, criada_em, atualizada_em, canal_id, wa_chatid)
      VALUES (?, ?, ?, NULL, ?, 'aberta', 0, ?, ?, ?, ?)`)
      .run(await proximoProtocolo(db), contato.id, canal.equipe_padrao_id || null, tipoCanal, m.criadaEm, m.criadaEm, canal.id, m.chatid)).lastInsertRowid);
    conversa = { id, status: 'aberta' };
    nova = true;
  }
  const fromMe = Boolean(m.fromMe);
  const arq = m.arquivo || null;
  const inserida = await db.prepare(`INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, entrega, criada_em, externo_id, midia_tipo, midia_id, midia_nome, midia_mime)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(conversa.id, fromMe ? 'atendente' : 'cliente', m.texto, fromMe ? 'enviada' : null, m.criadaEm, m.messageid,
      arq?.tipo || null, arq?.id || null, arq?.nome || null, arq?.mime || null);
  const mensagemId = Number(inserida.lastInsertRowid);
  await db.prepare('UPDATE conversas SET atualizada_em = ?, nao_lidas = nao_lidas + ?, wa_chatid = COALESCE(wa_chatid, ?) WHERE id = ?')
    .run(Math.max(m.criadaEm, agora), fromMe ? 0 : 1, m.chatid, conversa.id);
  return { resultado: 'mensagem', conversaId: conversa.id, contatoId: contato.id, nova, fromMe, mensagemId, midia: arq };
}

/* ------------------------------ Telegram ------------------------------ */

const ROTULOS_MIDIA_TELEGRAM = [
  ['photo', '[Imagem]'], ['video', '[Vídeo]'], ['video_note', '[Vídeo]'], ['animation', '[GIF]'],
  ['voice', '[Áudio]'], ['audio', '[Áudio]'], ['document', '[Documento]'], ['sticker', '[Figurinha]'],
  ['location', '[Localização]'], ['venue', '[Localização]'], ['contact', '[Contato]'], ['poll', '[Enquete]'],
];

// Campo do Telegram -> como o CRM mostra o arquivo.
const TIPOS_ARQUIVO_TELEGRAM = [
  ['photo', 'imagem'], ['sticker', 'imagem'], ['animation', 'video'], ['video', 'video'],
  ['video_note', 'video'], ['voice', 'audio'], ['audio', 'audio'], ['document', 'documento'],
];

// Encontra o arquivo da mensagem: id, tipo, nome e formato.
function extrairArquivoTelegram(m) {
  for (const [campo, tipo] of TIPOS_ARQUIVO_TELEGRAM) {
    const valor = m[campo];
    if (!valor) continue;
    // Fotos vêm em vários tamanhos: o último é o maior.
    const arquivo = Array.isArray(valor) ? valor[valor.length - 1] : valor;
    if (!arquivo?.file_id) continue;
    const mime = arquivo.mime_type || (campo === 'photo' ? 'image/jpeg' : null);
    const ehImagem = tipo === 'imagem' || (mime && mime.startsWith('image/'));
    return {
      tipo: ehImagem ? 'imagem' : tipo,
      id: String(arquivo.file_id),
      nome: arquivo.file_name || null,
      mime,
    };
  }
  return null;
}

// O PIN do cliente pode chegar junto da conversa no Telegram: no link de início
// (/start 5446) ou numa mensagem que é só o número. Tem de 4 a 8 dígitos.
function extrairPinTelegram(texto) {
  const t = String(texto || '').trim();
  const inicio = /^\/start(?:@\w+)?\s+(\S+)$/i.exec(t);
  const bruto = inicio ? inicio[1] : t;
  const digitos = String(bruto).replace(/\D/g, '');
  const soNumeros = /^[\s\d.-]+$/.test(bruto);
  if (!soNumeros && !inicio) return null;
  return digitos.length >= 4 && digitos.length <= 8 ? digitos : null;
}

// Traduz um update da Bot API do Telegram para o formato interno.
function extrairMensagemTelegram(update) {
  const m = update?.message;
  if (!m || typeof m !== 'object' || !m.chat) return null;
  const chat = m.chat;
  const de = m.from || {};
  let texto = String(m.text || m.caption || '').trim();
  const midia = ROTULOS_MIDIA_TELEGRAM.find(([chave]) => m[chave] !== undefined);
  if (midia) texto = texto ? `${midia[1]} ${texto}` : midia[1];
  const pinRecebido = extrairPinTelegram(texto);
  if (/^\/start(?:@\w+)?(\s|$)/i.test(texto)) {
    texto = pinRecebido ? `[Iniciou a conversa pelo Telegram · PIN ${pinRecebido}]` : '[Iniciou a conversa pelo Telegram]';
  }
  const nome = [de.first_name, de.last_name].filter(Boolean).join(' ').trim()
    || [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim()
    || (de.username ? `@${de.username}` : '');
  return {
    chatid: String(chat.id),
    messageid: `tg:${chat.id}:${m.message_id}`,
    texto,
    arquivo: extrairArquivoTelegram(m),
    nome,
    usuario: de.username || chat.username || null,
    criadaEm: m.date ? Number(m.date) * 1000 : Date.now(),
    grupo: chat.type !== 'private',
    deBot: Boolean(de.is_bot),
    pinRecebido,
  };
}

// Aplica um update do Telegram ao banco. Retorna um resumo do que foi feito.
async function processarUpdateTelegram(db, canal, update) {
  const m = extrairMensagemTelegram(update);
  if (!m) return { resultado: 'ignorado', motivo: update?.edited_message ? 'mensagem editada' : 'sem mensagem' };
  if (m.grupo) return { resultado: 'ignorado', motivo: 'grupo' };
  if (m.deBot) return { resultado: 'ignorado', motivo: 'mensagem de bot' };
  if (!m.texto && !m.arquivo) return { resultado: 'ignorado', motivo: 'sem conteúdo' };
  if (await db.prepare('SELECT 1 FROM mensagens WHERE externo_id = ?').get(m.messageid)) return { resultado: 'ignorado', motivo: 'duplicada' };

  const nomePadrao = m.nome || (m.usuario ? `@${m.usuario}` : `Telegram ${m.chatid}`);
  let contato = await db.prepare('SELECT * FROM contatos WHERE tg_id = ?').get(m.chatid);
  if (!contato) {
    const id = Number((await db.prepare('INSERT INTO contatos (nome, tg_id, tg_usuario) VALUES (?, ?, ?)').run(nomePadrao, m.chatid, m.usuario)).lastInsertRowid);
    contato = { id, nome: nomePadrao };
  } else if (m.usuario && m.usuario !== contato.tg_usuario) {
    await db.prepare('UPDATE contatos SET tg_usuario = ? WHERE id = ?').run(m.usuario, contato.id);
  }

  // PIN que veio pelo Telegram já preenche o card, sem sobrescrever um PIN conferido.
  if (m.pinRecebido && !(contato.pin && contato.pin_validado_em)) {
    await db.prepare('UPDATE contatos SET pin = ? WHERE id = ?').run(m.pinRecebido, contato.id);
    contato.pin = m.pinRecebido;
  }
  return await guardarMensagem(db, canal, contato, m, 'telegram');
}

// Arquivos maiores que isso não são guardados no S3 (o Telegram também não entrega).
const TAMANHO_MAXIMO_ARQUIVO = 25 * 1024 * 1024;

// Baixa o arquivo do Telegram e guarda no S3; no banco fica só a chave do objeto.
async function guardarArquivoNoS3(db, { telegram, arquivos }, canal, mensagemId, midia) {
  if (!arquivos?.configurado || !telegram?.baixarArquivo || !midia?.id) return null;
  try {
    const { bytes, tipo } = await telegram.baixarArquivo(canal.instancia_token, midia.id);
    if (!bytes?.length || bytes.length > TAMANHO_MAXIMO_ARQUIVO) return null;
    const enviado = await arquivos.enviar(bytes, {
      nome: midia.nome || `${midia.tipo || 'arquivo'}`,
      tipo: midia.mime || tipo || 'application/octet-stream',
      pasta: `canal-${canal.id}`,
    });
    await db.prepare('UPDATE mensagens SET midia_chave = ?, midia_tamanho = ?, midia_mime = COALESCE(midia_mime, ?) WHERE id = ?')
      .run(enviado.chave, enviado.tamanho, midia.mime || tipo || null, mensagemId);
    return enviado.chave;
  } catch (erro) {
    console.error('Não foi possível guardar o arquivo no S3:', erro.message);
    return null;
  }
}

const VALIDADE_FOTO_MS = 24 * 60 * 60 * 1000; // confere a foto do perfil uma vez por dia

// Guarda a foto de perfil do cliente (o arquivo fica no Telegram; aqui só o código dele).
async function atualizarFotoTelegram(db, telegram, canal, chatid) {
  if (!telegram?.obterFotoPerfil) return;
  const contato = await db.prepare('SELECT id, tg_foto_id, tg_foto_em FROM contatos WHERE tg_id = ?').get(String(chatid));
  if (!contato) return;
  if (contato.tg_foto_em && Date.now() - Number(contato.tg_foto_em) < VALIDADE_FOTO_MS) return;
  try {
    const fotoId = await telegram.obterFotoPerfil(canal.instancia_token, chatid);
    await db.prepare('UPDATE contatos SET tg_foto_id = ?, tg_foto_em = ? WHERE id = ?').run(fotoId, Date.now(), contato.id);
  } catch {
    // sem foto agora: tenta de novo no próximo dia
    await db.prepare('UPDATE contatos SET tg_foto_em = ? WHERE id = ?').run(Date.now(), contato.id);
  }
}

// Começa a receber as mensagens de um bot do Telegram e guarda tudo no banco.
async function ligarTelegram(db, telegram, canal, arquivos = null) {
  if (!telegram?.sondagem) return false;
  telegram.sondagem.iniciar(canal, {
    aoReceber: async (update) => {
      await registrarEvento(db, canal.id, 'telegram', update);
      const r = await processarUpdateTelegram(db, canal, update);
      const chatid = update?.message?.chat?.id;
      if (r.resultado === 'mensagem' && chatid) await atualizarFotoTelegram(db, telegram, canal, chatid);
      if (r.resultado === 'mensagem' && r.midia && r.mensagemId) {
        await guardarArquivoNoS3(db, { telegram, arquivos }, canal, r.mensagemId, r.midia);
      }
      return r;
    },
    aoEstado: async (estado) => {
      if (estado.ok) {
        await db.prepare("UPDATE canais SET ultimo_erro = NULL, status = 'connected', atualizado_em = ? WHERE id = ?").run(Date.now(), canal.id);
      } else {
        await db.prepare('UPDATE canais SET ultimo_erro = ?, status = ?, atualizado_em = ? WHERE id = ?')
          .run(String(estado.erro || 'erro').slice(0, 500), estado.fatal ? 'disconnected' : 'connected', Date.now(), canal.id);
      }
    },
  });
  return true;
}

// Ao iniciar o sistema: religa todos os bots do Telegram que estavam conectados.
async function ligarTelegramTodos(db, telegram, arquivos = null) {
  const lista = await db.prepare("SELECT * FROM canais WHERE tipo = 'telegram' AND status = 'connected'").all();
  let n = 0;
  for (const canal of lista) if (await ligarTelegram(db, telegram, canal, arquivos)) n += 1;
  return n;
}

async function registrarEvento(db, canalId, tipo, corpo) {
  let texto = '';
  try { texto = JSON.stringify(corpo); } catch { texto = String(corpo); }
  if (texto.length > 100_000) texto = `${texto.slice(0, 100_000)}…`;
  await db.prepare('INSERT INTO canal_eventos (canal_id, tipo, corpo, recebido_em) VALUES (?, ?, ?, ?)').run(canalId, tipo || null, texto, Date.now());
  await db.prepare(
    'DELETE FROM canal_eventos WHERE canal_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM canal_eventos WHERE canal_id = ? ORDER BY id DESC LIMIT 200) AS recentes)',
  ).run(canalId, canalId);
}

module.exports = {
  somenteDigitos,
  proximoProtocolo,
  numeroDoChat,
  ehGrupo,
  formatarNumero,
  novoSegredo,
  extrairEvento,
  extrairMensagem,
  interpretarEntrega,
  interpretarConexao,
  processarEvento,
  guardarMensagem,
  guardarArquivoNoS3,
  extrairMensagemTelegram,
  extrairPinTelegram,
  extrairArquivoTelegram,
  processarUpdateTelegram,
  ligarTelegram,
  atualizarFotoTelegram,
  ligarTelegramTodos,
  registrarEvento,
};
