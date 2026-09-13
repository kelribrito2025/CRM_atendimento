import { icone, montarIcones } from './icones.js';

(() => {
  'use strict';

  /* ================================================================
   * Estado da tela
   * ============================================================== */
  const estado = {
    resumo: null,
    caixa: 'todas',          // todas | minhas | sem_resposta
    equipeId: null,
    busca: '',
    conversas: [],
    conversaId: null,
    conversa: null,
    modo: 'resposta',        // resposta | nota
    enviando: false,
  };

  const $ = (sel, raiz = document) => raiz.querySelector(sel);

  /* ================================================================
   * Ícones (SVG estáticos)
   * ============================================================== */
  const ICONE = {
    whatsapp: (t, cor, e = 2.2) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="${e}"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0121 11.5z"></path></svg>`,
    telegram: (t, cor, e = 2.2) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="${e}"><path d="M21 4L3 11l6 2 2 6z"></path><path d="M21 4l-10 9"></path></svg>`,
    seta: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"></path></svg>',
    mais: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    inbox: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4C6355" stroke-width="2"><path d="M4 4h16v16H4z"></path><path d="M4 13h5l2 3h2l2-3h5"></path></svg>',
    pessoa: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4C6355" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"></path></svg>',
    relogio: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8E1F16" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    pontos: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path></svg>',
    lapis: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6A16" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"></path></svg>',
    clipe: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.5l-8.6 8.6a5 5 0 01-7-7l9-9a3.3 3.3 0 014.7 4.7l-9 9a1.7 1.7 0 01-2.4-2.4l8.3-8.2"></path></svg>',
    raio: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9z"></path></svg>',
    enviar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4"><path d="M21 4L3 11l6 2 2 6z"></path></svg>',
    balao: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0121 11.5z"></path></svg>',
    busca: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.3-4.3"></path></svg>',
    cadeadoGrande: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 018 0v3"></path></svg>',
    cadeado: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 018 0v3"></path></svg>',
    alerta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E1F16" stroke-width="2.2"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9L2 19a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"></path></svg>',
    fechar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>',
  };

  const NOME_CANAL = { whatsapp: 'WhatsApp', telegram: 'Telegram' };

  /* ================================================================
   * Utilidades
   * ============================================================== */
  function el(tag, attrs = {}, ...filhos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) {
      if (f == null || f === false) continue;
      n.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return n;
  }

  function svg(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visivel'), ms);
  }

  function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[1][0]).toUpperCase();
  }

  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function horaCurta(ms) {
    return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function horaLista(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    if (mesmoDia(d, hoje)) return horaCurta(ms);
    if (mesmoDia(d, ontem)) return 'ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  function rotuloData(ms) {
    const d = new Date(ms);
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    const longa = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    if (mesmoDia(d, hoje)) return `Hoje · ${longa}`;
    if (mesmoDia(d, ontem)) return `Ontem · ${longa}`;
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function minutosTexto(min) {
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 24) return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
  function textoAberto(ms, status) {
    if (status === 'resolvida') return 'resolvida';
    const t = minutosTexto(Math.max(0, Math.round((Date.now() - ms) / 60000)));
    return t === 'agora' ? 'aberta agora' : `aberta há ${t}`;
  }

  async function api(caminho, { method = 'GET', body } = {}) {
    const resposta = await fetch(`/api${caminho}`, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (resposta.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error('Sessão expirada.');
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
    return dados;
  }

  /* ================================================================
   * Carregamento de dados
   * ============================================================== */
  async function carregarResumo() {
    estado.resumo = await api('/resumo');
    renderRail();
    renderSidebar();
  }

  function paramsLista() {
    const p = new URLSearchParams({ caixa: estado.caixa });
    if (estado.equipeId) p.set('equipe', estado.equipeId);
    if (estado.busca) p.set('q', estado.busca);
    return p.toString();
  }

  async function carregarConversas({ selecionarPrimeira = false } = {}) {
    const { conversas } = await api(`/conversas?${paramsLista()}`);
    estado.conversas = conversas;
    renderLista();
    const aindaExiste = conversas.some((c) => c.id === estado.conversaId);
    if (selecionarPrimeira && !aindaExiste) {
      if (conversas.length) await abrirConversa(conversas[0].id);
      else {
        estado.conversaId = null;
        estado.conversa = null;
        renderChat();
        renderPainel();
      }
    }
  }

  async function abrirConversa(id) {
    estado.conversaId = id;
    renderLista();
    const { conversa } = await api(`/conversas/${id}`);
    if (estado.conversaId !== id) return; // usuário já clicou em outra
    estado.conversa = conversa;
    const item = estado.conversas.find((c) => c.id === id);
    if (item) item.naoLidas = 0;
    renderLista();
    renderChat();
    renderPainel();
  }

  // Atualização periódica sem atrapalhar quem está digitando
  async function atualizarSilencioso() {
    if (document.hidden || estado.enviando) return;
    try {
      await carregarResumo();
      const { conversas } = await api(`/conversas?${paramsLista()}`);
      estado.conversas = conversas;
      renderLista();
      if (!estado.conversaId) return;
      const { conversa } = await api(`/conversas/${estado.conversaId}`);
      const atual = estado.conversa;
      const mudou = !atual
        || conversa.mensagens.length !== atual.mensagens.length
        || conversa.status !== atual.status
        || conversa.atendente?.id !== atual.atendente?.id
        || conversa.equipe?.id !== atual.equipe?.id
        || conversa.contato.pinValidadoEm !== atual.contato.pinValidadoEm;
      if (mudou) aplicarConversa(conversa);
    } catch {
      /* silencioso: tenta de novo no próximo ciclo */
    }
  }

  // Substitui a conversa aberta preservando o texto que está sendo digitado
  function aplicarConversa(conversa) {
    const textoMsg = $('#texto-msg')?.value;
    const textoNota = $('#texto-nota')?.value;
    estado.conversa = conversa;
    renderChat();
    renderPainel();
    if (textoMsg) $('#texto-msg').value = textoMsg;
    if (textoNota) $('#texto-nota').value = textoNota;
  }

  /* ================================================================
   * Ações
   * ============================================================== */
  async function selecionarCaixa(caixa) {
    estado.caixa = caixa;
    estado.equipeId = null;
    renderSidebar();
    await carregarConversas({ selecionarPrimeira: true });
  }

  async function selecionarEquipe(id) {
    estado.equipeId = id;
    estado.caixa = 'todas';
    renderSidebar();
    await carregarConversas({ selecionarPrimeira: true });
  }

  async function enviarMensagem(texto, tipo, campo) {
    const c = estado.conversa;
    if (!c || !texto.trim() || estado.enviando) return;
    estado.enviando = true;
    try {
      const r = await api(`/conversas/${c.id}/mensagens`, { method: 'POST', body: { texto: texto.trim(), tipo } });
      if (campo) campo.value = '';
      if (r.erroEnvio) toast(`Não foi possível enviar pelo WhatsApp: ${r.erroEnvio}`, 5000);
      c.mensagens.push(r.mensagem);
      Object.assign(c, { status: r.conversa.status, atendente: r.conversa.atendente, equipe: r.conversa.equipe, atualizadaEm: r.conversa.atualizadaEm });
      aplicarConversa(c);
      $('#texto-msg')?.focus();
      await Promise.all([carregarResumo(), carregarConversas()]);
    } catch (e) {
      toast(e.message);
    } finally {
      estado.enviando = false;
    }
  }

  async function atualizarConversa(corpo) {
    const c = estado.conversa;
    if (!c) return;
    try {
      const r = await api(`/conversas/${c.id}`, { method: 'PATCH', body: corpo });
      Object.assign(c, { atendente: r.conversa.atendente, equipe: r.conversa.equipe });
      aplicarConversa(c);
      await Promise.all([carregarResumo(), carregarConversas()]);
    } catch (e) {
      toast(e.message);
      renderChat();
    }
  }

  async function mudarStatus(status) {
    const c = estado.conversa;
    if (!c) return;
    try {
      const r = await api(`/conversas/${c.id}/status`, { method: 'POST', body: { status } });
      Object.assign(c, { status: r.conversa.status });
      aplicarConversa(c);
      toast(status === 'resolvida' ? 'Conversa marcada como resolvida.' : 'Conversa reaberta.');
      await Promise.all([carregarResumo(), carregarConversas()]);
    } catch (e) {
      toast(e.message);
    }
  }

  async function acaoPin(acao) {
    const c = estado.conversa;
    if (!c) return;
    try {
      const r = await api(`/conversas/${c.id}/pin`, { method: 'POST', body: { acao } });
      c.contato = r.conversa.contato;
      renderPainel();
      toast(acao === 'novo' ? 'Novo PIN gerado. Peça ao cliente para confirmar.' : 'PIN validado.');
    } catch (e) {
      toast(e.message);
    }
  }

  /* ================================================================
   * Render: topo e menu do usuário
   * ============================================================== */
  function renderRail() {
    const r = estado.resumo;
    $('#rail-badge').textContent = r.caixas.todas;
    $('#rail-badge').hidden = r.caixas.todas === 0;
    $('#btn-usuario').textContent = r.usuario.iniciais;
    $('#menu-nome').textContent = r.usuario.nome;
    $('#menu-email').textContent = r.usuario.email;
    const admin = r.usuario.papel === 'admin';
    $('#btn-conectar').hidden = !admin;
    const wa = (r.canais || []).find((c) => c.id === 'whatsapp');
    const status = $('#menu-whatsapp');
    status.hidden = !(admin && wa);
    if (admin && wa) {
      const conectados = wa.canais.filter((c) => c.status === 'connected').map((c) => c.numeroFormatado || c.nome);
      status.textContent = wa.conectado ? `WhatsApp conectado: ${conectados.join(', ')}` : (wa.configurado ? 'WhatsApp não conectado' : 'WhatsApp não configurado no servidor');
    }
    const tg = (r.canais || []).find((c) => c.id === 'telegram');
    const statusTg = $('#menu-telegram');
    statusTg.hidden = !(admin && tg);
    if (admin && tg) {
      const bots = tg.canais.filter((c) => c.status === 'connected').map((c) => c.numeroFormatado || c.nome);
      statusTg.textContent = tg.conectado ? `Telegram conectado: ${bots.join(', ')}` : 'Telegram não conectado';
    }
  }

  /* ================================================================
   * Render: sidebar (caixas, equipes, membros)
   * ============================================================== */
  function navItem({ icone: ic, cor, nome, cont, ativo, alerta, onclick }) {
    return el('button', { type: 'button', class: `nav-item${ativo ? ' ativo' : ''}`, onclick },
      cor ? el('span', { class: 'cor-equipe', style: `background:${cor}` }) : ic,
      el('span', { class: 'nome' }, nome),
      el('span', { class: `cont${alerta && !ativo && cont > 0 ? ' urgente' : ''}` }, String(cont)));
  }

  function renderSidebar() {
    const r = estado.resumo;
    if (!r) return;
    const equipeSel = r.equipes.find((e) => e.id === estado.equipeId) || null;
    const semEquipe = !estado.equipeId;
    const membros = equipeSel ? equipeSel.membros : r.atendentes;

    $('#sidebar').replaceChildren(
      el('span', { class: 'rotulo' }, 'Caixas de entrada'),
      el('div', { class: 'lista-nav' },
        navItem({ icone: icone('todas', ICONE.inbox), nome: 'Todas', cont: r.caixas.todas, ativo: semEquipe && estado.caixa === 'todas', onclick: () => selecionarCaixa('todas') }),
        navItem({ icone: icone('minhas', ICONE.pessoa), nome: 'Minhas', cont: r.caixas.minhas, ativo: semEquipe && estado.caixa === 'minhas', onclick: () => selecionarCaixa('minhas') }),
        navItem({ icone: icone('sem-resposta', ICONE.relogio, { classe: 'vermelho' }), nome: 'Sem resposta', cont: r.caixas.semResposta, alerta: true, ativo: semEquipe && estado.caixa === 'sem_resposta', onclick: () => selecionarCaixa('sem_resposta') })),
      el('span', { class: 'separador' }),
      el('div', { class: 'linha-rotulo' },
        el('span', { class: 'rotulo' }, 'Equipes'),
        el('button', { type: 'button', class: 'btn-mini hov', title: 'Nova equipe', onclick: () => toast('Cadastro de equipes: em breve.') }, icone('mais', ICONE.mais))),
      el('div', { class: 'lista-nav' },
        ...r.equipes.map((e) => navItem({ cor: e.cor, nome: e.nome, cont: e.abertas, ativo: estado.equipeId === e.id, onclick: () => selecionarEquipe(e.id) }))),
      el('span', { class: 'separador' }),
      el('span', { class: 'rotulo' }, equipeSel ? `Equipe de ${equipeSel.nome}` : 'Atendentes'),
      el('div', { class: 'membros' },
        ...membros.map((m) => el('div', { class: 'membro hov', title: m.email || '' },
          el('span', { class: 'avatar p' }, m.iniciais),
          el('div', { class: 'membro-info' },
            el('span', { class: 'membro-nome' }, m.nomeCurto),
            el('span', { class: `membro-status${m.presenca === 'online' ? ' online' : ''}` }, `${m.presenca} · ${m.ativas ? `${m.ativas} ativa${m.ativas === 1 ? '' : 's'}` : 'livre'}`)))),
        membros.length ? null : el('div', { class: 'vazio' }, 'Nenhum atendente nesta equipe.')),
      el('button', { type: 'button', class: 'btn-tracejado hov', onclick: () => toast('Gestão de membros: em breve.') }, icone('mais', ICONE.mais), 'Adicionar à equipe'),
    );
  }

  /* ================================================================
   * Render: lista de conversas
   * ============================================================== */
  function tituloLista() {
    const equipeSel = estado.resumo?.equipes.find((e) => e.id === estado.equipeId);
    if (equipeSel) return equipeSel.nome;
    return { todas: 'Todas as conversas', minhas: 'Minhas conversas', sem_resposta: 'Sem resposta' }[estado.caixa];
  }

  function itemConversa(c) {
    const ativa = c.id === estado.conversaId;
    const corAvatar = ativa ? 'verde' : (c.canal === 'telegram' ? 'azul' : 'cinza');
    const corCanal = c.canal === 'telegram' ? '#4FA3DA' : '#12B85C';

    let tag = null;
    if (c.status === 'resolvida') tag = ['Resolvida', ''];
    else if (c.semResposta) tag = [`Sem resposta ${minutosTexto(c.semRespostaMin)}`, 'vermelho'];
    else if (c.contato.empresa && c.contato.empresa !== c.contato.nome) tag = [c.contato.empresa, 'verde'];
    else if (c.atendente) tag = [c.atendente.nomeCurto, ''];

    const previa = c.ultimaTipo === 'atendente' && c.ultimaAutor
      ? `${c.ultimaAutor.split(' ')[0]}: ${c.ultimaTexto}`
      : (c.ultimaTexto || 'Sem mensagens');

    return el('button', { type: 'button', class: `conversa${ativa ? ' ativa' : ''}`, onclick: () => abrirConversa(c.id) },
      el('span', { class: 'avatar-wrap' },
        el('span', { class: `avatar m ${corAvatar}` }, c.contato.iniciais),
        el('span', { class: 'canal-badge', html: ICONE[c.canal]?.(10, corCanal, 2.6) || '' })),
      el('div', { class: 'conversa-corpo' },
        el('div', { class: 'conversa-linha' },
          el('span', { class: 'conversa-nome' }, c.contato.nome),
          el('span', { class: 'conversa-hora' }, horaLista(c.ultimaEm || c.atualizadaEm))),
        el('span', { class: 'conversa-previa' }, previa),
        tag ? el('span', { class: `tag ${tag[1]}`.trim() }, tag[0]) : null),
      c.naoLidas > 0 && !ativa ? el('span', { class: 'nao-lidas' }, String(c.naoLidas)) : null);
  }

  function renderLista() {
    const abertas = estado.conversas.filter((c) => c.status === 'aberta').length;
    const sem = estado.conversas.filter((c) => c.semResposta).length;
    $('#lista-titulo').textContent = tituloLista();
    $('#lista-sub').textContent = `${abertas} conversa${abertas === 1 ? '' : 's'} · ${sem} sem resposta`;
    const cont = $('#conversas');
    if (!estado.conversas.length) {
      cont.replaceChildren(listaVazia());
      return;
    }
    cont.replaceChildren(...estado.conversas.map(itemConversa));
  }

  function nomeCaixa() {
    const equipeSel = estado.resumo?.equipes.find((e) => e.id === estado.equipeId);
    if (equipeSel) return equipeSel.nome;
    return { todas: 'Todas', minhas: 'Minhas', sem_resposta: 'Sem resposta' }[estado.caixa] || 'Todas';
  }

  function limparBusca() {
    $('#busca').value = '';
    estado.busca = '';
    carregarConversas({ selecionarPrimeira: true }).catch((e) => toast(e.message));
  }

  // Texto e ação do estado vazio da lista, conforme a caixa escolhida.
  function descricaoVazia() {
    const verTodas = { acao: 'Ver todas as caixas', aoClicar: () => selecionarCaixa('todas') };
    if (estado.busca) return { titulo: 'Nada encontrado', texto: `Nenhuma conversa encontrada para "${estado.busca}".`, acao: 'Limpar busca', aoClicar: limparBusca };
    if (estado.equipeId) return { titulo: 'Caixa vazia', texto: `Nenhuma conversa aberta na equipe ${nomeCaixa()}.`, ...verTodas };
    if (estado.caixa === 'minhas') return { titulo: 'Caixa vazia', texto: 'Nenhuma conversa atribuída a você no momento.', ...verTodas };
    if (estado.caixa === 'sem_resposta') return { titulo: 'Tudo respondido', texto: 'Nenhum cliente aguardando resposta.', ...verTodas };
    return { titulo: 'Caixa vazia', texto: 'Nenhuma conversa aberta. Assim que um cliente escrever, ela aparece aqui.', acao: null };
  }

  function listaVazia() {
    const d = descricaoVazia();
    return el('div', { class: 'lista-vazia' },
      el('span', { class: 'lista-vazia-icone' }, icone('buscar', ICONE.busca)),
      el('div', { class: 'lista-vazia-texto' }, el('strong', {}, d.titulo), el('span', {}, d.texto)),
      d.acao ? el('button', { type: 'button', class: 'btn-branco hov', onclick: d.aoClicar }, d.acao) : null);
  }

  /* ================================================================
   * Render: chat
   * ============================================================== */
  function chatVazio() {
    let titulo;
    let texto;
    if (estado.busca && !estado.conversas.length) {
      titulo = 'Nada encontrado';
      texto = el('span', {}, 'Nenhuma conversa corresponde à busca. Tente outro nome, CNPJ ou protocolo.');
    } else if (!estado.conversas.length) {
      titulo = 'Tudo limpo por aqui';
      const fim = ' Assim que um cliente escrever pelo WhatsApp ou Telegram, a conversa aparece na lista ao lado e a equipe é avisada.';
      texto = estado.equipeId
        ? el('span', {}, 'A equipe ', el('strong', {}, nomeCaixa()), ' não tem nenhuma conversa aberta.', fim)
        : el('span', {}, { minhas: 'Você não tem nenhuma conversa em atendimento.', sem_resposta: 'Nenhum cliente está aguardando resposta.' }[estado.caixa] || 'Nenhuma conversa aberta no momento.', fim);
    } else {
      titulo = 'Nenhuma conversa selecionada';
      texto = el('span', {}, 'Escolha uma conversa na lista ao lado para começar o atendimento.');
    }
    return el('div', { class: 'chat-vazio' },
      el('span', { class: 'chat-vazio-icone' }, icone('atendimento', ICONE.balao)),
      el('div', { class: 'chat-vazio-texto' }, el('strong', {}, titulo), texto));
  }

  function construirMensagens(c) {
    const nos = [];
    let ultimoDia = null;
    for (const m of c.mensagens) {
      const dia = new Date(m.criadaEm).toDateString();
      if (dia !== ultimoDia) {
        nos.push(el('span', { class: 'data-sep' }, rotuloData(m.criadaEm)));
        ultimoDia = dia;
      }
      if (m.tipo === 'nota') {
        nos.push(el('div', { class: 'nota' }, icone('nota', ICONE.lapis),
          el('div', { class: 'nota-corpo' },
            el('span', { class: 'nota-texto' }, el('strong', {}, 'Nota interna'), ' — ', m.texto),
            el('span', { class: 'nota-meta' }, `${m.autor?.nomeCurto || 'Equipe'} · ${horaCurta(m.criadaEm)} · visível só para a equipe`))));
      } else if (m.tipo === 'atendente') {
        nos.push(el('div', { class: 'msg saida' },
          el('div', { class: 'balao' }, m.texto),
          el('span', { class: 'msg-meta' }, [horaCurta(m.criadaEm), m.autor?.nomeCurto || (m.tipo === 'atendente' ? 'pelo celular' : null), m.entrega === 'falhou' ? 'não enviada ⚠' : m.entrega].filter(Boolean).join(' · '))));
      } else {
        nos.push(el('div', { class: 'msg' },
          el('div', { class: 'balao' }, m.texto),
          el('span', { class: 'msg-meta' }, `${horaCurta(m.criadaEm)} · ${NOME_CANAL[c.canal] || c.canal}`)));
      }
    }
    if (!nos.length) nos.push(el('div', { class: 'vazio' }, 'Ainda não há mensagens nesta conversa.'));
    return nos;
  }

  function fecharMenus() {
    document.querySelectorAll('.menu-flutuante').forEach((m) => m.remove());
  }

  function abrirMenuAcoes(botao) {
    if ($('.menu-flutuante')) return fecharMenus();
    const c = estado.conversa;
    const menu = el('div', { class: 'menu-flutuante' },
      el('button', { type: 'button', onclick: () => { fecharMenus(); mudarStatus(c.status === 'resolvida' ? 'aberta' : 'resolvida'); } },
        c.status === 'resolvida' ? 'Reabrir conversa' : 'Marcar como resolvida'),
      el('button', { type: 'button', onclick: () => { fecharMenus(); atualizarConversa({ atendenteId: estado.resumo.usuario.id }); } }, 'Assumir esta conversa'),
      el('button', { type: 'button', onclick: () => { fecharMenus(); toast('Transferência entre canais: em breve.'); } }, 'Transferir canal'));
    botao.parentElement.append(menu);
  }

  function renderChat() {
    const chat = $('#chat');
    const c = estado.conversa;
    if (!c) {
      chat.replaceChildren(chatVazio());
      return;
    }
    const r = estado.resumo;
    const canalNome = NOME_CANAL[c.canal] || c.canal;
    const primeiroNome = c.contato.nome.split(' ')[0];
    const modoNota = estado.modo === 'nota';

    const cabecalho = el('div', { class: 'chat-topo' },
      el('div', { class: 'chat-cab' },
        el('span', { class: 'avatar g verde' }, c.contato.iniciais),
        el('div', { class: 'chat-info' },
          el('span', { class: 'chat-nome' }, c.contato.nome),
          el('span', { class: 'chat-sub' }, [c.contato.empresa, `protocolo #${c.protocolo}`, textoAberto(c.criadaEm, c.status)].filter(Boolean).join(' · '))),
        el('button', { type: 'button', class: 'btn-icone btn-info hov', title: 'Dados do cliente', onclick: () => $('#painel').classList.toggle('aberto') }, icone('info', ICONE.info)),
        el('button', { type: 'button', class: 'btn-icone hov', title: 'Mais ações', onclick: (e) => { e.stopPropagation(); abrirMenuAcoes(e.currentTarget); } }, icone('acoes', ICONE.pontos))));

    const mensagens = el('div', { class: 'rolagem mensagens', id: 'mensagens' }, ...construirMensagens(c));

    const textarea = el('textarea', {
      id: 'texto-msg', rows: '2', maxlength: '4000',
      placeholder: modoNota ? 'Escreva uma nota interna para a equipe…' : `Escreva para ${primeiroNome} pelo ${canalNome}…`,
      onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } },
    });
    const enviar = () => enviarMensagem(textarea.value, modoNota ? 'nota' : 'resposta', textarea);

    const compositor = el('div', { class: 'compositor' },
      el('div', { class: 'abas' },
        el('button', { type: 'button', class: `aba${!modoNota ? ' ativa' : ''}`, onclick: () => mudarModo('resposta') }, 'Responder'),
        el('button', { type: 'button', class: `aba${modoNota ? ' ativa' : ''}`, onclick: () => mudarModo('nota') }, 'Nota interna')),
      el('div', { class: `caixa-texto${modoNota ? ' modo-nota' : ''}` },
        textarea,
        el('div', { class: 'compositor-acoes' },
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Anexo', onclick: () => toast('Envio de anexos: em breve.') }, icone('anexo', ICONE.clipe)),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Respostas rápidas', onclick: () => toast('Respostas rápidas: em breve.') }, icone('raio', ICONE.raio)),
          modoNota ? null : el('span', { class: 'btn-suave', title: 'Canal desta conversa', html: ICONE[c.canal]?.(14, c.canal === 'telegram' ? '#4FA3DA' : '#12B85C') || '' }, canalNome),
          el('span', { class: 'empurrar' }),
          el('button', { type: 'button', class: 'btn-primario', id: 'btn-enviar', onclick: enviar }, modoNota ? 'Salvar nota' : 'Enviar', modoNota ? null : icone('enviar', ICONE.enviar, { animado: true, classe: 'branco' })))));

    chat.replaceChildren(cabecalho, mensagens, compositor);
    mensagens.scrollTop = mensagens.scrollHeight;
  }

  function mudarModo(modo) {
    const texto = $('#texto-msg')?.value || '';
    estado.modo = modo;
    renderChat();
    const ta = $('#texto-msg');
    if (ta) { ta.value = texto; ta.focus(); }
  }

  /* ================================================================
   * Render: painel do cliente
   * ============================================================== */
  function secao(titulo, ...filhos) {
    return el('div', { class: 'secao' }, el('span', { class: 'rotulo' }, titulo), ...filhos);
  }

  function blocoPin(c) {
    const ct = c.contato;
    const validado = Boolean(ct.pin && ct.pinValidadoEm);
    const cab = (selo, pendente) => el('div', { class: 'cab' },
      icone('pin', ICONE.cadeado, { classe: pendente ? 'suave' : 'verde' }),
      el('span', { class: 'rotulo' }, 'PIN do cliente'),
      el('span', { class: `selo${pendente ? ' pendente' : ''}` }, selo));

    if (!ct.pin) {
      return el('div', { class: 'bloco-pin pendente' }, cab('Sem PIN', true),
        el('div', { class: 'linha-pin' },
          el('span', { class: 'pin-info' }, 'Nenhum PIN gerado para este cliente.'),
          el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => acaoPin('novo') }, 'Gerar PIN')));
    }
    return el('div', { class: `bloco-pin${validado ? '' : ' pendente'}` },
      cab(validado ? 'Validado' : 'Pendente', !validado),
      el('div', { class: 'pin-digitos' }, ...ct.pin.split('').map((d) => el('span', { class: 'pin-digito' }, d))),
      el('div', { class: 'linha-pin' },
        el('span', { class: 'pin-info' }, validado
          ? `Conferido às ${horaCurta(ct.pinValidadoEm)} por ${ct.pinValidadoPor || 'equipe'}`
          : 'Aguardando o cliente confirmar o PIN.'),
        validado ? null : el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => acaoPin('validar') }, 'Validar PIN'),
        el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => acaoPin('novo') }, 'Pedir novo PIN')));
  }

  function renderPainel() {
    const painel = $('#painel');
    const c = estado.conversa;
    if (!c) {
      const itens = [
        ['PIN do cliente', '6 dígitos conferidos no atendimento'],
        ['Conta e saldo', 'plano, último pagamento e caixa'],
        ['Notas internas', 'histórico visível só para a equipe'],
      ];
      painel.replaceChildren(
        el('div', { class: 'painel-topo' },
          el('span', { class: 'avatar-quadrado neutro' }, icone('pin', ICONE.cadeadoGrande)),
          el('div', { class: 'membro-info' },
            el('span', { class: 'painel-nome suave' }, 'Ficha do cliente'),
            el('span', { class: 'painel-sub' }, 'Nenhuma conversa aberta'))),
        el('div', { class: 'painel-vazio' },
          el('span', {}, 'Ao abrir uma conversa, aparecem aqui o PIN de validação, o saldo em caixa, o plano e as notas internas da equipe.'),
          el('div', { class: 'painel-vazio-itens' },
            ...itens.map(([t, sub]) => el('div', { class: 'painel-vazio-item' }, el('strong', {}, t), el('span', {}, sub))))));
      return;
    }
    const ct = c.contato;
    const notas = c.mensagens.filter((m) => m.tipo === 'nota').slice().reverse();

    const textareaNota = el('textarea', { id: 'texto-nota', rows: '2', maxlength: '4000', placeholder: 'Escreva uma nota para a equipe…', 'aria-label': 'Nova nota interna' });
    const salvarNota = () => enviarMensagem(textareaNota.value, 'nota', textareaNota);

    painel.replaceChildren(
      el('div', { class: 'painel-topo' },
        el('span', { class: 'avatar-quadrado' }, iniciais(ct.empresa || ct.nome)),
        el('div', { class: 'membro-info' },
          el('span', { class: 'painel-nome' }, ct.empresa || ct.nome),
          el('span', { class: 'painel-sub' }, ct.cnpj || ct.telefone || (ct.telegramUsuario ? `Telegram @${ct.telegramUsuario}` : ''))),
        el('button', { type: 'button', class: 'link-btn', onclick: () => toast('Abrir conta do cliente: em breve.') }, 'Abrir conta')),
      el('div', { class: 'rolagem painel-corpo' },
        blocoPin(c),
        ct.dados?.length ? secao('Conta do cliente',
          el('div', {}, ...ct.dados.map(([k, v, cor]) => el('div', { class: 'linha-dado' },
            el('span', { class: 'k' }, k), el('span', { class: `v${cor ? ` ${cor}` : ''}` }, v))))) : null,
        c.alerta ? el('div', { class: 'alerta' }, icone('alerta', ICONE.alerta),
          el('span', {}, el('strong', {}, `${c.alerta.titulo} `), c.alerta.texto)) : null,
        secao('Notas internas',
          el('div', { class: 'caixa-nota' }, textareaNota,
            el('div', { class: 'rodape' },
              el('span', { class: 'dica' }, 'Só a equipe vê.'),
              el('button', { type: 'button', class: 'btn-escuro', onclick: salvarNota }, 'Salvar nota'))),
          ...notas.map((n) => el('div', { class: 'nota-item' },
            el('span', { class: 't' }, n.texto),
            el('span', { class: 'm' }, `${n.autor?.nomeCurto || 'Equipe'} · ${horaLista(n.criadaEm) === horaCurta(n.criadaEm) ? horaCurta(n.criadaEm) : `${horaLista(n.criadaEm)} ${horaCurta(n.criadaEm)}`}`))),
          notas.length ? null : el('span', { class: 'dica', style: 'font-size:12px;color:#4C6355' }, 'Nenhuma nota ainda.')),
        el('div', { class: 'acoes-grid' },
          el('button', { type: 'button', class: 'btn-primario pequeno', onclick: () => toast('Estorno pelo CRM: em breve.') }, 'Estornar'),
          el('button', { type: 'button', class: 'btn-branco pequeno hov', onclick: () => toast('Faturas do cliente: em breve.') }, 'Ver faturas'))));
  }


  /* ================================================================
   * Canais (WhatsApp via uazapi)
   * ============================================================== */
  let modalCanais = null;
  let sondagem = null;
  const conexao = { canalId: null, modo: 'qr', qrcode: null, paircode: null, telefone: '', status: null, erro: null, ocupado: false };

  function pararSondagem() {
    clearInterval(sondagem);
    sondagem = null;
  }

  function fecharModalCanais() {
    pararSondagem();
    if (modalCanais) modalCanais.remove();
    modalCanais = null;
    conexao.canalId = null;
    carregarResumo().catch(() => {});
  }

  async function abrirModalCanais() {
    if (estado.resumo?.usuario?.papel !== 'admin') return toast('Peça a um administrador para conectar os canais.');
    if (modalCanais) return;
    modalCanais = el('div', { class: 'modal-fundo', onclick: (e) => { if (e.target === modalCanais) fecharModalCanais(); } },
      el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Canais de atendimento' },
        el('div', { class: 'modal-corpo', id: 'modal-corpo' }, el('div', { class: 'vazio' }, 'Carregando…'))));
    document.body.append(modalCanais);
    await renderCanais();
  }

  function formatarPair(codigo) {
    const c = String(codigo || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : (codigo || '');
  }

  async function renderCanais() {
    const corpo = $('#modal-corpo');
    if (!corpo) return;
    let dados;
    try {
      dados = await api('/canais');
    } catch (e) {
      corpo.replaceChildren(el('div', { class: 'modal-cab' }, el('div', {}, el('h2', {}, 'Canais de atendimento')), el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: fecharModalCanais }, svg(ICONE.fechar))), el('div', { class: 'aviso erro' }, e.message));
      return;
    }
    const partes = [
      el('div', { class: 'modal-cab' },
        el('div', {}, el('h2', {}, 'Canais de atendimento'), el('p', {}, 'Conecte o WhatsApp e o Telegram da empresa para receber e responder as mensagens aqui no CRM.')),
        el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: fecharModalCanais }, svg(ICONE.fechar))),
    ];
    const whats = dados.canais.filter((c) => c.tipo !== 'telegram');
    const bots = dados.canais.filter((c) => c.tipo === 'telegram');
    const lista = el('div', { class: 'canais-lista' }, ...whats.map(itemCanal));
    if (!whats.length) lista.append(el('div', { class: 'vazio' }, 'Nenhum WhatsApp conectado ainda.'));
    partes.push(el('div', { class: 'secao' }, el('span', { class: 'rotulo' }, 'WhatsApp'),
      dados.configurado ? null : el('div', { class: 'aviso erro' }, 'Servidor do WhatsApp não configurado. Preencha UAZAPI_URL e UAZAPI_ADMIN_TOKEN no arquivo .env e reinicie o sistema.'),
      lista, dados.configurado ? formNovoCanal() : null));
    const canalConexao = whats.find((c) => c.id === conexao.canalId);
    if (canalConexao) partes.push(painelConexao(canalConexao));
    const listaTg = el('div', { class: 'canais-lista' }, ...bots.map(itemTelegram));
    if (!bots.length) listaTg.append(el('div', { class: 'vazio' }, 'Nenhum bot do Telegram conectado ainda.'));
    partes.push(el('div', { class: 'secao' }, el('span', { class: 'rotulo' }, 'Telegram'), listaTg, dados.telegram ? formNovoTelegram() : null));
    corpo.replaceChildren(...partes);
  }

  function itemCanal(c) {
    const rotulo = { connected: 'Conectado', connecting: 'Conectando…', disconnected: 'Desconectado' }[c.status] || c.status;
    const sub = [rotulo, c.numeroFormatado, c.perfil].filter(Boolean).join(' · ');
    return el('div', { class: 'canal-item' },
      el('span', { class: `status-ponto ${c.status}` }),
      el('div', { class: 'canal-info' }, el('span', { class: 'canal-nome' }, c.nome), el('span', { class: 'canal-sub' }, sub)),
      el('div', { class: 'canal-acoes' },
        c.status === 'connected'
          ? el('button', { type: 'button', class: 'btn-suave hov', onclick: () => acaoCanal(c.id, 'desconectar') }, 'Desconectar')
          : el('button', { type: 'button', class: 'btn-primario pequeno', style: 'height:34px', onclick: () => iniciarConexao(c.id, 'qr') }, 'Conectar'),
        el('button', { type: 'button', class: 'btn-suave hov', title: 'Reenviar a configuração do webhook ao servidor do WhatsApp', onclick: () => acaoCanal(c.id, 'webhook') }, 'Reconfigurar'),
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => verEventos(c) }, 'Eventos'),
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => excluirCanal(c) }, 'Excluir')),
      c.ultimoErro ? el('div', { class: 'canal-aviso' }, `Último erro: ${c.ultimoErro}`) : null,
      c.webhookAviso ? el('div', { class: 'canal-aviso' }, c.webhookAviso) : null,
      el('div', { class: 'canal-nota' }, `Endereço que recebe as mensagens: ${c.webhookUrl}`));
  }

  function itemTelegram(c) {
    const rotulo = c.status === 'connected' ? (c.recebendo === false ? 'Conectado (aguardando reinício)' : 'Conectado') : 'Desconectado';
    const sub = [rotulo, c.numeroFormatado, c.perfil && c.perfil !== c.nome ? c.perfil : null].filter(Boolean).join(' · ');
    return el('div', { class: 'canal-item' },
      el('span', { class: `status-ponto ${c.status}` }),
      el('div', { class: 'canal-info' }, el('span', { class: 'canal-nome' }, c.nome), el('span', { class: 'canal-sub' }, sub)),
      el('div', { class: 'canal-acoes' },
        c.status === 'connected'
          ? el('button', { type: 'button', class: 'btn-suave hov', onclick: () => acaoCanal(c.id, 'desconectar') }, 'Desconectar')
          : el('button', { type: 'button', class: 'btn-primario pequeno', style: 'height:34px', onclick: () => acaoCanal(c.id, 'conectar') }, 'Conectar'),
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => verEventos(c) }, 'Eventos'),
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => excluirCanal(c) }, 'Excluir')),
      c.ultimoErro ? el('div', { class: 'canal-aviso' }, `Último erro: ${c.ultimoErro}`) : null,
      el('div', { class: 'canal-nota' }, 'As mensagens enviadas ao bot chegam aqui automaticamente, sem precisar de endereço público.'));
  }

  function formNovoTelegram() {
    const input = el('input', { type: 'text', placeholder: 'Token do bot (ex.: 123456789:AAF…)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Token do bot do Telegram' });
    const botao = el('button', { type: 'button', class: 'btn-primario pequeno', style: 'height:40px', onclick: async () => {
      const token = input.value.trim();
      if (!token) return toast('Cole o token do bot fornecido pelo @BotFather.');
      botao.disabled = true;
      try {
        const { canal } = await api('/canais/telegram', { method: 'POST', body: { token } });
        toast(`Telegram conectado: ${canal.numeroFormatado || canal.nome}`);
        input.value = '';
        await renderCanais();
        carregarResumo().catch(() => {});
      } catch (e) {
        toast(e.message, 6000);
      } finally {
        botao.disabled = false;
      }
    } }, 'Adicionar Telegram');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') botao.click(); });
    return el('div', { class: 'secao' },
      el('div', { class: 'novo-canal' }, input, botao),
      el('div', { class: 'novo-canal-ajuda' },
        el('strong', {}, 'Como criar o bot (leva 1 minuto):'),
        el('ol', {},
          el('li', {}, 'No Telegram, abra o @BotFather e envie /newbot.'),
          el('li', {}, 'Escolha um nome (ex.: Bigteck Atendimento) e um usuário terminado em "bot".'),
          el('li', {}, 'Copie o token que ele mostra e cole no campo acima. Depois, divulgue o @usuário do bot para os clientes.'))));
  }

  function formNovoCanal() {
    const input = el('input', { type: 'text', placeholder: 'Nome do canal (ex.: WhatsApp principal)', maxlength: '60' });
    const botao = el('button', { type: 'button', class: 'btn-primario pequeno', style: 'height:40px', onclick: async () => {
      botao.disabled = true;
      try {
        const { canal } = await api('/canais', { method: 'POST', body: { nome: input.value.trim() || 'WhatsApp' } });
        toast('Canal criado. Agora conecte o WhatsApp.');
        await iniciarConexao(canal.id, 'qr');
      } catch (e) {
        toast(e.message, 5000);
        botao.disabled = false;
      }
    } }, 'Adicionar WhatsApp');
    return el('div', { class: 'novo-canal' }, input, botao);
  }

  async function acaoCanal(id, acao) {
    try {
      await api(`/canais/${id}/${acao}`, { method: 'POST', body: {} });
      toast({ desconectar: 'Canal desconectado.', webhook: 'Webhook reconfigurado.', conectar: 'Telegram conectado!' }[acao] || 'Pronto.');
      if (acao === 'desconectar') { pararSondagem(); conexao.canalId = null; }
      await renderCanais();
      carregarResumo().catch(() => {});
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async function excluirCanal(c) {
    if (!window.confirm(`Excluir o canal "${c.nome}"? As conversas ficam guardadas, mas o canal é desconectado.`)) return;
    try {
      await api(`/canais/${c.id}`, { method: 'DELETE' });
      if (conexao.canalId === c.id) { pararSondagem(); conexao.canalId = null; }
      toast('Canal excluído.');
      await renderCanais();
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async function verEventos(c) {
    try {
      const { eventos } = await api(`/canais/${c.id}/eventos`);
      const corpo = $('#modal-corpo');
      const lista = el('div', { class: 'eventos-lista' }, ...eventos.map((e) => el('div', { class: 'evento-item' },
        el('span', { class: 'm' }, `${new Date(e.recebidoEm).toLocaleString('pt-BR')} · ${e.tipo || 'sem tipo'}`),
        typeof e.corpo === 'string' ? e.corpo : JSON.stringify(e.corpo, null, 1).slice(0, 1500))));
      if (!eventos.length) lista.append(el('div', { class: 'vazio' }, 'Nenhum evento recebido ainda. Quando alguém mandar mensagem para este canal, o evento aparece aqui.'));
      corpo.replaceChildren(
        el('div', { class: 'modal-cab' }, el('div', {}, el('h2', {}, `Eventos recebidos · ${c.nome}`), el('p', {}, 'Últimos 50 avisos que este canal entregou ao CRM. Útil para diagnosticar problemas.')),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: fecharModalCanais }, svg(ICONE.fechar))),
        lista,
        el('div', {}, el('button', { type: 'button', class: 'btn-suave hov', onclick: renderCanais }, '← Voltar')));
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async function iniciarConexao(canalId, modo, telefone = '') {
    pararSondagem();
    Object.assign(conexao, { canalId, modo, telefone, qrcode: null, paircode: null, status: 'connecting', erro: null, ocupado: true });
    await renderCanais();
    try {
      const r = await api(`/canais/${canalId}/conectar`, { method: 'POST', body: telefone ? { telefone } : {} });
      Object.assign(conexao, { qrcode: r.qrcode, paircode: r.paircode, status: r.status, ocupado: false });
    } catch (e) {
      Object.assign(conexao, { erro: e.message, ocupado: false });
    }
    await renderCanais();
    if (!conexao.erro) sondagem = setInterval(sondarStatus, 3000);
  }

  async function sondarStatus() {
    if (!conexao.canalId || !modalCanais) return pararSondagem();
    try {
      const r = await api(`/canais/${conexao.canalId}/status`);
      const mudouCodigo = (r.qrcode && r.qrcode !== conexao.qrcode) || (r.paircode && r.paircode !== conexao.paircode);
      const mudouStatus = r.status !== conexao.status;
      if (r.qrcode) conexao.qrcode = r.qrcode;
      if (r.paircode) conexao.paircode = r.paircode;
      conexao.status = r.status;
      if (r.status === 'connected') {
        pararSondagem();
        toast('WhatsApp conectado!');
        conexao.canalId = null;
        await renderCanais();
        carregarResumo().catch(() => {});
        return;
      }
      if (mudouCodigo || mudouStatus) {
        const painel = $('#painel-conexao');
        if (painel) painel.replaceWith(painelConexao(r.canal));
      }
    } catch (e) {
      conexao.erro = e.message;
      const painel = $('#painel-conexao');
      if (painel) painel.replaceWith(painelConexao({ id: conexao.canalId, nome: '' }));
    }
  }

  function painelConexao(c) {
    const modoQr = conexao.modo === 'qr';
    const inputTel = el('input', { type: 'tel', placeholder: '55 31 99999-0000', value: conexao.telefone, 'aria-label': 'Número do WhatsApp com DDD' });
    const status = conexao.status === 'connected'
      ? el('div', { class: 'conexao-status ok' }, el('span', { class: 'status-ponto' }), 'Conectado!')
      : el('div', { class: 'conexao-status' }, el('span', { class: 'status-ponto' }), conexao.ocupado ? 'Gerando…' : (modoQr ? 'Aguardando a leitura do QR code…' : (conexao.paircode ? 'Aguardando você digitar o código no celular…' : 'Informe o número e gere o código.')));

    let conteudo;
    if (modoQr) {
      const qr = conexao.qrcode;
      conteudo = el('div', { class: 'conexao-corpo' },
        el('div', { class: 'qr-caixa' }, qr
          ? el('img', { src: qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`, alt: 'QR code para conectar o WhatsApp' })
          : el('span', { class: 'aguarde' }, conexao.ocupado ? 'Gerando o QR code…' : 'QR code ainda não disponível. Clique em "Gerar novo QR code".')),
        el('div', { class: 'conexao-passos' },
          el('strong', {}, 'No celular com o WhatsApp da empresa:'),
          el('ol', {},
            el('li', {}, 'Abra o WhatsApp e toque em Configurações (ou nos três pontos).'),
            el('li', {}, 'Toque em "Aparelhos conectados" › "Conectar um aparelho".'),
            el('li', {}, 'Aponte a câmera para o QR code ao lado.')),
          el('div', { style: 'margin-top:10px' }, el('button', { type: 'button', class: 'btn-suave hov', onclick: () => iniciarConexao(c.id, 'qr') }, 'Gerar novo QR code'))));
    } else {
      conteudo = el('div', { class: 'conexao-corpo' },
        el('div', { class: 'conexao-passos' },
          el('div', { class: 'telefone-linha' }, inputTel,
            el('button', { type: 'button', class: 'btn-primario pequeno', style: 'height:40px', onclick: () => {
              const tel = inputTel.value.trim();
              if (tel.replace(/\D/g, '').length < 10) return toast('Digite o número com o código do país e o DDD. Exemplo: 55 31 99999-0000.');
              iniciarConexao(c.id, 'numero', tel);
            } }, conexao.paircode ? 'Gerar outro código' : 'Gerar código')),
          conexao.paircode ? el('div', { class: 'paircode', style: 'margin-top:12px' }, formatarPair(conexao.paircode)) : null,
          el('strong', { style: 'display:block;margin-top:12px' }, 'No celular com o WhatsApp da empresa:'),
          el('ol', {},
            el('li', {}, 'Abra o WhatsApp › Configurações › "Aparelhos conectados" › "Conectar um aparelho".'),
            el('li', {}, 'Toque em "Conectar com número de telefone".'),
            el('li', {}, 'Digite o código mostrado acima.'))));
    }

    return el('div', { class: 'conexao', id: 'painel-conexao' },
      el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
        el('strong', { style: 'flex:1' }, `Conectar ${c.nome || 'WhatsApp'}`),
        el('div', { class: 'abas' },
          el('button', { type: 'button', class: `aba${modoQr ? ' ativa' : ''}`, onclick: () => iniciarConexao(c.id, 'qr') }, 'Ler QR code'),
          el('button', { type: 'button', class: `aba${!modoQr ? ' ativa' : ''}`, onclick: () => { pararSondagem(); Object.assign(conexao, { modo: 'numero', paircode: null, status: null, erro: null }); renderCanais(); } }, 'Digitar número'))),
      conexao.erro ? el('div', { class: 'aviso erro' }, conexao.erro) : null,
      conteudo,
      status);
  }

  /* ================================================================
   * Eventos globais
   * ============================================================== */
  function ligarEventos() {
    let timer = null;
    $('#busca').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        estado.busca = e.target.value.trim();
        carregarConversas({ selecionarPrimeira: true }).catch((err) => toast(err.message));
      }, 250);
    });

    $('#btn-filtros').addEventListener('click', () => toast('Filtros avançados: em breve.'));

    document.querySelectorAll('.rail-btn[data-modulo]').forEach((b) => {
      b.addEventListener('click', () => toast(`Módulo ${b.dataset.modulo}: em breve.`));
    });

    const menuUsuario = $('#menu-usuario');
    $('#btn-conectar').addEventListener('click', () => { menuUsuario.hidden = true; abrirModalCanais(); });
    $('#btn-usuario').addEventListener('click', (e) => {
      e.stopPropagation();
      menuUsuario.hidden = !menuUsuario.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!menuUsuario.hidden && !menuUsuario.contains(e.target)) menuUsuario.hidden = true;
      if (!e.target.closest('.menu-flutuante')) fecharMenus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { menuUsuario.hidden = true; fecharMenus(); $('#painel').classList.remove('aberto'); if (modalCanais) fecharModalCanais(); }
    });
  }

  async function iniciar() {
    montarIcones();
    ligarEventos();
    try {
      await carregarResumo();
      await carregarConversas({ selecionarPrimeira: true });
    } catch (e) {
      toast(e.message);
      $('#chat').replaceChildren(el('div', { class: 'chat-vazio' }, el('strong', {}, 'Não foi possível carregar'), el('span', {}, e.message)));
    }
    setInterval(atualizarSilencioso, 8000);
  }

  iniciar();
})();
