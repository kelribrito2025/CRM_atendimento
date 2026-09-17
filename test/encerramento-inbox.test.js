'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBancoDeTeste } = require('./apoio');
const { semear, migrar } = require('../src/db');
const { criarApp } = require('../src/app');
const { criarAvisos } = require('../src/eventos');

async function ambiente() {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: 'inbox@teste.com', adminSenha: 'segredo123', adminNome: 'Admin Teste', comDadosExemplo: false });
  const atendente = await db.prepare('SELECT id FROM usuarios WHERE email = ?').get('inbox@teste.com');
  const equipeId = Number((await db.prepare("INSERT INTO equipes (nome, cor, ordem) VALUES ('Reembolso QA', '#12B85C', 100)").run()).lastInsertRowid);
  const outraId = Number((await db.prepare("INSERT INTO equipes (nome, cor, ordem) VALUES ('Prioridade QA', '#008877', 101)").run()).lastInsertRowid);
  const contatoId = Number((await db.prepare("INSERT INTO contatos (nome) VALUES ('Cliente fictício')").run()).lastInsertRowid);
  const tempo = Date.now();
  const id = Number((await db.prepare(`INSERT INTO conversas (protocolo, contato_id, equipe_id, atendente_id, canal, status, criada_em, atualizada_em)
    VALUES ('QA-100', ?, ?, ?, 'widget', 'aberta', ?, ?)`).run(contatoId, equipeId, atendente.id, tempo, tempo)).lastInsertRowid);
  await db.prepare("INSERT INTO mensagens (conversa_id, tipo, texto, criada_em) VALUES (?, 'cliente', 'Preciso de ajuda', ?)").run(id, tempo);
  const avisos = criarAvisos();
  const eventos = [];
  const parar = avisos.assinar(e => eventos.push(e));
  const arquivos = { configurado: true, enviar: async bytes => ({ chave: 'teste/arquivo.png', tamanho: bytes.length }) };
  const app = criarApp(db, { avisos, arquivos });
  const servidor = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'inbox@teste.com', senha: 'segredo123' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const api = async (url, method = 'GET', body, autenticado = true) => {
    const r = await fetch(`${base}/api${url}`, { method, headers: { 'Content-Type': 'application/json', ...(autenticado ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  };
  return { db, api, id, equipeId, outraId, atendenteId: atendente.id, eventos, base, cookie, fechar: async () => { parar(); servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); await db.fechar(); } };
}

async function temConversa(s, query = '') {
  return (await s.api(`/conversas?${query}`)).conversas.some(c => c.id === s.id);
}
async function badge(s, equipeId = s.equipeId) {
  return (await s.api('/resumo')).equipes.find(e => e.id === equipeId).abertas;
}

test('inbox: encerrar na entrada mantém conversa, histórico, gesto e badge da equipe até encerrar nela', async () => {
  const s = await ambiente();
  try {
    // NULL legado se materializa ao encerrar, mantendo a equipe aberta.
    const antes = (await s.api(`/conversas/${s.id}`)).conversa;
    assert.equal(antes.statusEquipe, 'aberta');
    const r = await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida' });
    assert.equal(r.status, 200);
    assert.equal(r.conversa.status, 'resolvida');
    assert.equal(r.conversa.statusEquipe, 'aberta');
    assert.equal(await temConversa(s), false);
    assert.equal(await temConversa(s, `equipe=${s.equipeId}`), true);
    assert.equal(await temConversa(s, 'caixa=encerradas'), true);
    assert.equal(await badge(s), 1);
    assert.equal((await s.api('/resumo')).caixas.todas, 0);
    assert.equal((await s.api('/resumo')).atendentes.find(a => a.id === s.atendenteId).ativas, 1);
    const detalhes = (await s.api(`/conversas/${s.id}`)).conversa;
    assert.deepEqual(detalhes.mensagens.map(m => m.id), antes.mensagens.map(m => m.id));
    assert.equal(detalhes.atendente.id, s.atendenteId);
    assert.equal(detalhes.semResposta, true);
    // Uma pendência da equipe não expira por causa do filtro de Encerradas.
    await s.db.prepare('UPDATE conversas SET atualizada_em = ? WHERE id = ?').run(Date.now() - 30 * 86400000, s.id);
    assert.equal(await temConversa(s, `equipe=${s.equipeId}`), true);
    const fechar = await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.equipeId });
    assert.equal(fechar.conversa.status, 'resolvida');
    assert.equal(fechar.conversa.statusEquipe, 'resolvida');
    assert.equal(await badge(s), 0);
    assert.equal(await temConversa(s, `equipe=${s.equipeId}`), false);
    assert.equal(await temConversa(s), false);
    assert.equal((await s.api('/resumo')).atendentes.find(a => a.id === s.atendenteId).ativas, 0);
    assert.equal(s.eventos.filter(e => e.origem === 'status' && e.conversaId === s.id).length, 2);
  } finally { await s.fechar(); }
});

test('inbox: encerrar primeiro na equipe não encerra a entrada; reatribuir reabre somente a equipe', async () => {
  const s = await ambiente();
  try {
    const r = await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.equipeId });
    assert.equal(r.conversa.status, 'aberta');
    assert.equal(r.conversa.statusEquipe, 'resolvida');
    assert.equal(await temConversa(s), false, 'encerrar na equipe não retira a atribuição');
    assert.equal(await badge(s), 0);
    await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida' });
    const atribuida = await s.api(`/conversas/${s.id}`, 'PATCH', { equipeId: s.equipeId });
    assert.equal(atribuida.conversa.status, 'resolvida');
    assert.equal(atribuida.conversa.statusEquipe, 'aberta');
    assert.equal(await badge(s), 1);
    assert.equal(await temConversa(s), false);
    await s.api(`/conversas/${s.id}`, 'PATCH', { equipeId: s.outraId });
    assert.equal(await badge(s), 0);
    assert.equal(await badge(s, s.outraId), 1);
    const obsoleto = await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.equipeId });
    assert.equal(obsoleto.status, 409);
    assert.equal(await badge(s, s.outraId), 1);
    const semEquipe = await s.api(`/conversas/${s.id}`, 'PATCH', { equipeId: null });
    assert.equal(semEquipe.conversa.statusEquipe, null);
    assert.equal(semEquipe.conversa.status, 'aberta');
    assert.equal(await temConversa(s), true, 'retirar explicitamente devolve para Todas');
    assert.equal(await badge(s, s.outraId), 0);
  } finally { await s.fechar(); }
});

test('inbox: exige login e valida o contexto sem encerrar outra caixa por engano', async () => {
  const s = await ambiente();
  try {
    assert.equal((await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.equipeId }, false)).status, 401);
    for (const equipeId of [0, '', -1, 'inválida', 1.5]) {
      assert.equal((await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId })).status, 400);
    }
    assert.equal((await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.outraId })).status, 409);
    assert.equal(await temConversa(s), false);
    assert.equal(await temConversa(s, `equipe=${s.equipeId}`), true);
    assert.equal(await badge(s), 1);
  } finally { await s.fechar(); }
});

test('inbox: responder com texto ou anexo na equipe não devolve a conversa encerrada à entrada', async () => {
  const s = await ambiente();
  try {
    await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida' });
    const mensagem = await s.api(`/conversas/${s.id}/mensagens`, 'POST', { texto: 'Estamos verificando seu reembolso.' });
    assert.equal(mensagem.status, 201);
    assert.equal(mensagem.conversa.status, 'resolvida');
    assert.equal(mensagem.conversa.statusEquipe, 'aberta');
    const anexo = await fetch(`${s.base}/api/conversas/${s.id}/anexos`, { method: 'POST', headers: { Cookie: s.cookie, 'Content-Type': 'image/png', 'x-nome-arquivo': 'teste.png' }, body: Buffer.from('arquivo falso para teste') });
    assert.equal(anexo.status, 201);
    assert.equal((await anexo.json()).conversa.status, 'resolvida');
    assert.equal(await badge(s), 1);
    assert.equal(await temConversa(s), false);
    await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.equipeId });
    // Reabertura tradicional, sem pendência da equipe, continua funcionando.
    const retomada = await s.api(`/conversas/${s.id}/mensagens`, 'POST', { texto: 'Retomando a conversa.' });
    assert.equal(retomada.conversa.status, 'aberta');
    assert.equal(retomada.conversa.statusEquipe, 'resolvida');
  } finally { await s.fechar(); }
});

test('inbox: migração não ressuscita conversas encerradas e não sobrescreve estados independentes', async () => {
  const s = await ambiente();
  try {
    await s.db.exec('ALTER TABLE conversas DROP COLUMN equipe_status');
    await s.db.prepare("UPDATE conversas SET status = 'resolvida' WHERE id = ?").run(s.id);
    await migrar(s.db);
    const legado = (await s.api(`/conversas/${s.id}`)).conversa;
    assert.equal(legado.statusEquipe, 'resolvida');
    assert.equal(await badge(s), 0);
    await s.api(`/conversas/${s.id}`, 'PATCH', { equipeId: s.equipeId });
    await migrar(s.db);
    assert.equal(await badge(s), 1);
    assert.equal(await temConversa(s), false);
  } finally { await s.fechar(); }
});

test('inbox UI: status e exclusão otimista são separados por caixa', async () => {
  const { statusNaInbox, chaveDaInbox } = await import('../client/assets/js/status-inbox.mjs');
  const c = { id: 9, equipe: { id: 2 }, status: 'resolvida', statusEquipe: 'aberta' };
  assert.equal(statusNaInbox(c), 'resolvida');
  assert.equal(statusNaInbox(c, 2), 'aberta');
  assert.equal(statusNaInbox(c, 3), 'resolvida');
  const pendente = new Set([chaveDaInbox(c.id)]);
  assert.equal(pendente.has(chaveDaInbox(c.id, 2)), false);
  const fs = require('node:fs');
  const js = fs.readFileSync(require('node:path').join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
  assert.match(js, /body: \{ status: 'resolvida', equipeId \}/);
  assert.match(js, /conversa\.statusEquipe !== atual\.statusEquipe/);
  assert.match(js, /statusNaInbox\(c, estado\.equipeId\) === 'resolvida'/);
});

// Recebimento real dos módulos, sempre em SQLite isolado e sem integrar contas externas.
async function entradaFicticia(s, origem) {
  const contato = await s.db.prepare('SELECT contato_id FROM conversas WHERE id = ?').get(s.id);
  if (origem.startsWith('widget')) {
    const { criarWidget } = require('../src/widget');
    await s.db.prepare("UPDATE contatos SET site_id = 'inbox-qa' WHERE id = ?").run(contato.contato_id);
    const widget = criarWidget(s.db, {
      segredo: 'segredo-apenas-de-teste',
      avisos: { avisar: e => s.eventos.push(e) },
      arquivos: { configurado: true, enviar: async bytes => ({ chave: 'teste/recebido.png', tamanho: bytes.length }) },
    });
    const aberta = await widget.abrirSessao({ id: 'inbox-qa', nome: 'Cliente fictício' });
    const sessao = await widget.sessaoDoToken(aberta.token);
    return async () => origem === 'widget-anexo'
      ? widget.enviarArquivo(sessao, { bytes: Buffer.from('midia de teste'), nome: 'teste.png', mime: 'image/png' })
      : widget.enviarMensagem(sessao, 'Nova mensagem do cliente');
  }
  const canais = require('../src/canais');
  const tempo = Date.now();
  const canalId = Number((await s.db.prepare(`INSERT INTO canais
    (tipo, nome, instancia_token, status, webhook_segredo, criado_em, atualizado_em)
    VALUES (?, 'Canal QA', 'token-ficticio', 'connected', 'segredo-ficticio', ?, ?)`)
    .run(origem, tempo, tempo)).lastInsertRowid);
  const canal = await s.db.prepare('SELECT * FROM canais WHERE id = ?').get(canalId);
  const externo = origem === 'whatsapp' ? '5511999990000' : '987654321';
  await s.db.prepare(`UPDATE contatos SET ${origem === 'whatsapp' ? 'wa_id' : 'tg_id'} = ? WHERE id = ?`).run(externo, contato.contato_id);
  await s.db.prepare('UPDATE conversas SET canal = ?, canal_id = ? WHERE id = ?').run(origem, canalId, s.id);
  let sequencia = 0;
  return async ({ fromMe = false, repetir = false } = {}) => {
    if (!repetir) sequencia++;
    if (origem === 'whatsapp') return canais.processarEvento(s.db, canal, {
      EventType: 'messages', message: { messageid: `inbox-${sequencia}`, chatid: `${externo}@s.whatsapp.net`,
        fromMe, messageType: 'text', text: `Mensagem ${sequencia}`, messageTimestamp: Math.floor(tempo / 1000) + sequencia },
    });
    return canais.processarUpdateTelegram(s.db, canal, {
      update_id: sequencia, message: { message_id: sequencia, date: Math.floor(tempo / 1000) + sequencia,
        text: `Mensagem ${sequencia}`, chat: { id: Number(externo), type: 'private' }, from: { id: Number(externo), first_name: 'Cliente fictício' } },
    });
  };
}

for (const origem of ['whatsapp', 'telegram', 'widget-texto', 'widget-anexo']) {
  test(`inbox: ${origem} mantém novas mensagens na equipe e só retorna a Todas após retirada`, async () => {
    const s = await ambiente();
    try {
      const receber = await entradaFicticia(s, origem);
      assert.equal(await temConversa(s), false, 'a atribuição já exclui da caixa geral');
      const canal = origem.startsWith('widget') ? 'widget' : origem;
      assert.equal(await temConversa(s, `canal=${canal}`), true, 'caixa do canal mantém comportamento anterior');
      assert.equal((await s.api('/resumo')).porCanal[canal], 1);
      await receber();
      assert.equal(await temConversa(s), false);
      await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida' });
      // Testa a equipe aberta e depois encerrada: ambas recebem na mesma inbox.
      for (const fecharEquipe of [false, true]) {
        if (fecharEquipe) await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.equipeId });
        const { detectarNovasMensagens } = await import('../client/assets/js/alerta-mensagem.mjs');
        const antes = detectarNovasMensagens((await s.api('/resumo')).notificacoes);
        await receber();
        const resumo = await s.api('/resumo');
        assert.equal(detectarNovasMensagens(resumo.notificacoes, antes.referencias, true).recebeuMensagem, true);
        const c = (await s.api(`/conversas/${s.id}`)).conversa;
        assert.equal(c.status, 'resolvida', 'mensagem não reabre a entrada geral');
        assert.equal(c.statusEquipe, 'aberta');
        assert.equal(c.equipe.id, s.equipeId);
        assert.equal(c.atendente.id, s.atendenteId);
        assert.equal(await temConversa(s), false);
        assert.equal(await temConversa(s, `equipe=${s.equipeId}`), true);
        assert.equal(await temConversa(s, 'q=Cliente%20fict%C3%ADcio'), true, 'busca explícita mantém o histórico');
        assert.equal(resumo.caixas.todas, 0);
        assert.equal(await badge(s), 1);
        if (origem === 'widget-anexo') assert.equal(c.mensagens.at(-1).midia.tipo, 'imagem');
      }
      assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM conversas').get()).n, 1, 'não duplica a conversa');
      const retirada = await s.api(`/conversas/${s.id}`, 'PATCH', { equipeId: null });
      assert.equal(retirada.conversa.equipe, null);
      assert.equal(retirada.conversa.statusEquipe, null);
      assert.equal(retirada.conversa.status, 'aberta');
      assert.equal(await temConversa(s), true);
      assert.equal((await s.api('/resumo')).caixas.todas, 1);
      assert.equal(await badge(s), 0);
      assert.ok(s.eventos.some(e => e.origem === 'atribuicao' && e.conversaId === s.id));
      await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida' });
      await receber();
      assert.equal(await temConversa(s), true, 'sem equipe, uma nova mensagem reabre normalmente');
    } finally { await s.fechar(); }
  });
}

test('inbox: eco fromMe e webhook duplicado não reabrem nenhuma das caixas', async () => {
  const s = await ambiente();
  try {
    const receber = await entradaFicticia(s, 'whatsapp');
    await receber();
    await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida' });
    await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida', equipeId: s.equipeId });
    assert.equal((await receber({ repetir: true })).motivo, 'duplicada');
    await receber({ fromMe: true });
    const c = (await s.api(`/conversas/${s.id}`)).conversa;
    assert.equal(c.status, 'resolvida');
    assert.equal(c.statusEquipe, 'resolvida');
    assert.equal(await badge(s), 0);
    assert.equal(await temConversa(s), false);
  } finally { await s.fechar(); }
});

test('inbox: Admin oculto não captura a reabertura na caixa geral', async () => {
  const s = await ambiente();
  try {
    const admin = await s.db.prepare("SELECT id FROM equipes WHERE nome = 'Admin'").get();
    assert.ok(admin);
    await s.api(`/conversas/${s.id}`, 'PATCH', { equipeId: admin.id });
    const receber = await entradaFicticia(s, 'widget-texto');
    await s.api(`/conversas/${s.id}/status`, 'POST', { status: 'resolvida' });
    await receber();
    const c = (await s.api(`/conversas/${s.id}`)).conversa;
    assert.equal(c.status, 'aberta');
    assert.equal(await temConversa(s), true);
    assert.equal((await s.api('/resumo')).caixas.todas, 1);
  } finally { await s.fechar(); }
});

test('inbox UI: retirada explícita, recuperação do modal e som independente da lista de Todas', () => {
  const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '../client/assets/js/atendimento.js'), 'utf8');
  assert.match(js, /id: 'retirar-inbox'/);
  assert.match(js, /atualizarConversa\(\{ equipeId: null \}\)/);
  assert.match(js, /temInboxAtual \? el\('button'/);
  assert.match(js, /b\.disabled = b\.classList\.contains\('atual'\)/);
  assert.match(js, /Conversa devolvida para Todas as conversas/);
  assert.match(js, /observarMensagens\(estado\.resumo\.notificacoes, true\)/);
  assert.match(js, /if \(!alertasAtivos\) observarMensagens\(estado\.resumo\.notificacoes, false\)/);
});
