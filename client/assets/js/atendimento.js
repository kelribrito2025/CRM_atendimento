import { icone, montarIcones } from './icones.js';
import { detectarNovasMensagens } from './alerta-mensagem.mjs';
import { corrigirPalavra, corrigirTexto } from './acentos.mjs';
import { capturarCompositor, restaurarCompositor } from './foco-compositor.mjs';

(() => {
  'use strict';

  /* ================================================================
   * Estado da tela
   * ============================================================== */
  const estado = {
    resumo: null,
    caixa: 'todas',          // todas | minhas | sem_resposta | encerradas
    equipeId: null,
    canal: null,             // whatsapp | telegram | widget (inbox por canal)
    busca: '',
    conversas: [],
    conversaId: null,
    conversa: null,
    modo: 'resposta',        // resposta | nota
    enviando: false,
  };

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const somNovaMensagem = new Audio(new URL('../sons/sound4-soft.mp3', import.meta.url).href);
  somNovaMensagem.preload = 'auto';
  somNovaMensagem.volume = 0.72;
  let somLiberado = false;
  let alertasAtivos = false;
  let referenciasMensagens = new Map();

  /* ================================================================
   * Ícones (SVG estáticos)
   * ============================================================== */
  const ICONE = {
    // Marcas do WhatsApp e do Telegram desenhadas cheias, como os logos de verdade.
    whatsapp: (t, cor) => `<svg width="${t}" height="${t}" viewBox="0 0 32 32" fill="${cor}" aria-hidden="true"><path d="M16.03 3.2c-7.02 0-12.72 5.7-12.72 12.72 0 2.24.59 4.43 1.71 6.36L3.2 28.8l6.69-1.75a12.67 12.67 0 006.14 1.56h.01c7.01 0 12.72-5.7 12.72-12.72 0-3.4-1.33-6.6-3.73-9a12.63 12.63 0 00-9-3.73zm0 23.26h-.01a10.56 10.56 0 01-5.38-1.47l-.39-.23-4 1.05 1.07-3.9-.25-.4a10.53 10.53 0 01-1.62-5.62c0-5.83 4.75-10.57 10.58-10.57 2.82 0 5.48 1.1 7.47 3.1a10.5 10.5 0 013.1 7.48c0 5.83-4.75 10.56-10.57 10.56zm5.8-7.92c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.71.16-.21.31-.82 1.02-1 1.23-.19.21-.37.24-.68.08-.32-.16-1.34-.5-2.56-1.58-.94-.84-1.58-1.88-1.77-2.2-.18-.31-.02-.48.14-.64.15-.14.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.25-.62-.51-.53-.7-.54l-.6-.01c-.21 0-.55.08-.83.4-.29.31-1.09 1.07-1.09 2.6s1.12 3.02 1.27 3.23c.16.21 2.2 3.36 5.33 4.71.74.32 1.32.51 1.78.66.75.24 1.43.2 1.97.12.6-.09 1.85-.76 2.11-1.49.26-.73.26-1.35.18-1.48-.08-.13-.29-.21-.6-.37z"></path></svg>`,
    telegram: (t, cor) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="${cor}" aria-hidden="true"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"></path></svg>`,
    widget: (t, cor) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="${cor}" aria-hidden="true"><path d="M3.6 4.3h16.8c.77 0 1.4.63 1.4 1.4v9.5c0 .77-.63 1.4-1.4 1.4h-6.5v1.6h2.4c.5 0 .9.4.9.9s-.4.9-.9.9H7.7c-.5 0-.9-.4-.9-.9s.4-.9.9-.9h2.4v-1.6H3.6c-.77 0-1.4-.63-1.4-1.4V5.7c0-.77.63-1.4 1.4-1.4z"></path></svg>`,
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
    perola: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10.9" r="3.2"></circle><path d="M2.8 14.6h18.4c0 3.3-4.12 5.9-9.2 5.9s-9.2-2.6-9.2-5.9z"></path><path d="M12 14.6v5.9"></path><path d="M7.3 14.6c.16 2.1.72 3.9 1.64 5.2"></path><path d="M16.7 14.6c-.16 2.1-.72 3.9-1.64 5.2"></path></svg>',
    balao: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0121 11.5z"></path></svg>',
    busca: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.3-4.3"></path></svg>',
    cadeadoGrande: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 018 0v3"></path></svg>',
    alerta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E1F16" stroke-width="2.2"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9L2 19a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"></path></svg>',
    fechar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>',
    pessoas: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 00-3-3.9"></path></svg>',
    elo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1 1"></path><path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1-1"></path></svg>',
    tela: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path></svg>',
    sino: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 01-3.4 0"></path></svg>',
    engrenagem: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 00.3 1.9 2 2 0 11-2.8 2.8 1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2 2 2 0 11-2.8-2.8A1.7 1.7 0 002.6 14a2 2 0 110-4 1.7 1.7 0 001.2-2.9 2 2 0 112.8-2.8A1.7 1.7 0 0010 2.6a2 2 0 114 0 1.7 1.7 0 002.9 1.2 2 2 0 112.8 2.8A1.7 1.7 0 0021.4 10a2 2 0 110 4 1.7 1.7 0 00-2 1z"></path></svg>',
    olho: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    cadeado: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="10" width="16" height="10" rx="2.4"></rect><path d="M8 10V7a4 4 0 018 0v3"></path></svg>',
    checkCaixa: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4C6355" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8.2 12.3l2.6 2.6 5-5.2"></path></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>',
    lapisPequeno: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"></path></svg>',
    lixeira: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 13h10l1-13"></path><path d="M9 7V4h6v3"></path></svg>',
  };

  const NOME_CANAL = { whatsapp: 'WhatsApp', telegram: 'Telegram', widget: 'Chat do site' };
  // Cores das marcas, usadas no selo do canal ao lado do avatar do cliente.
  const COR_CANAL = { whatsapp: '#25D366', telegram: '#229ED9', widget: '#0B1F14' };

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

  async function liberarSom() {
    if (somLiberado) return;
    const volume = somNovaMensagem.volume;
    somNovaMensagem.volume = 0;
    try {
      await somNovaMensagem.play();
      somNovaMensagem.pause();
      somNovaMensagem.currentTime = 0;
      somLiberado = true;
    } catch {
      /* O navegador tentará novamente na próxima interação da pessoa. */
    } finally {
      somNovaMensagem.volume = volume;
    }
  }

  function tocarSomNovaMensagem() {
    somNovaMensagem.pause();
    somNovaMensagem.currentTime = 0;
    somNovaMensagem.play().then(() => { somLiberado = true; }).catch(() => {});
  }

  function observarMensagens(conversas, avisar) {
    const resultado = detectarNovasMensagens(conversas, referenciasMensagens, avisar && alertasAtivos);
    referenciasMensagens = resultado.referencias;
    if (resultado.recebeuMensagem) tocarSomNovaMensagem();
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
    if (estado.canal) p.set('canal', estado.canal);
    if (estado.busca) p.set('q', estado.busca);
    return p.toString();
  }

  async function carregarConversas({ selecionarPrimeira = false } = {}) {
    const { conversas } = await api(`/conversas?${paramsLista()}`);
    observarMensagens(conversas, false);
    estado.conversas = conversas;
    renderLista();
    const aindaExiste = conversas.some((c) => c.id === estado.conversaId);
    if (selecionarPrimeira && !aindaExiste) {
      if (conversas.length) await abrirConversa(conversas[0].id);
      else {
        estado.conversaId = null;
        estado.conversa = null;
        limparSaldo(null);
        renderChat();
        renderPainel();
      }
    }
  }

  // A atualização automática traz só as últimas mensagens. Se a pessoa já tinha
  // subido a rolagem e carregado o histórico antigo, ele é preservado aqui.
  function juntarHistorico(atual, conversa) {
    if (!atual) return conversa;
    const porId = new Map(conversa.mensagens.map((m) => [m.id, m]));
    const antigas = atual.mensagens
      .filter((m) => !m.provisoria && !conversa.mensagens.some((n) => n.id === m.id))
      .map((m) => porId.get(m.id) || m);
    const atualizadas = atual.mensagens
      .filter((m) => !m.provisoria && porId.has(m.id))
      .map((m) => porId.get(m.id));
    const novas = conversa.mensagens.filter((m) => !atual.mensagens.some((n) => n.id === m.id));
    conversa.mensagens = [...antigas, ...atualizadas, ...novas];
    // Se o histórico inteiro já estava na tela, não volta a pedir de novo.
    if (atual.temMaisMensagens === false) conversa.temMaisMensagens = false;
    return conversa;
  }

  async function abrirConversa(id) {
    estado.conversaId = id;
    // O saldo consultado vale só para a conversa em que foi pedido.
    if (id !== saldo.conversaId) limparSaldo(id);
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
  // Fluxo de avisos aberto com o servidor (ver ouvirAvisos) e quando foi a
  // última conferência: juntos decidem de quanto em quanto tempo perguntar.
  let fluxoAvisos = null;
  let ultimaAtualizacao = 0;

  async function atualizarSilencioso() {
    if (document.hidden || estado.enviando) return;
    ultimaAtualizacao = Date.now();
    try {
      await carregarResumo();
      const { conversas } = await api(`/conversas?${paramsLista()}`);
      const listaCompleta = estado.caixa === 'todas' && !estado.equipeId && !estado.busca
        ? conversas
        : (await api('/conversas?caixa=todas')).conversas;
      observarMensagens(listaCompleta, true);
      estado.conversas = conversas;
      renderLista();
      if (!estado.conversaId) return;
      const { conversa } = await api(`/conversas/${estado.conversaId}`);
      if (estado.conversaId !== conversa.id) return; // trocou de conversa enquanto buscava
      const atual = estado.conversa?.id === conversa.id ? estado.conversa : null;
      const ultimaNova = conversa.mensagens.at(-1)?.id ?? null;
      const ultimaAtual = atual?.mensagens.filter((m) => !m.provisoria).at(-1)?.id ?? null;
      const mudou = !atual
        || ultimaNova !== ultimaAtual
        || conversa.status !== atual.status
        || conversa.atendente?.id !== atual.atendente?.id
        || conversa.equipe?.id !== atual.equipe?.id
        || conversa.contato.pinValidadoEm !== atual.contato.pinValidadoEm;
      if (mudou) aplicarConversa(juntarHistorico(atual, conversa));
    } catch {
      /* silencioso: tenta de novo no próximo ciclo */
    }
  }

  // Substitui a conversa aberta preservando o texto que está sendo digitado
  function aplicarConversa(conversa) {
    const compositor = capturarCompositor();
    // O saldo consultado vale só para a conversa em que foi pedido.
    if (conversa?.id !== saldo.conversaId) limparSaldo(conversa?.id ?? null);
    estado.conversa = conversa;
    renderChat();
    renderPainel();
    // A resposta do servidor pode chegar quando a pessoa já começou a próxima
    // mensagem. Como renderChat troca o textarea, devolvemos o foco e o cursor
    // ao campo novo para nenhuma tecla seguinte se perder.
    restaurarCompositor(compositor, { ajustarAltura });
  }

  /* ================================================================
   * Ações
   * ============================================================== */
  async function selecionarCaixa(caixa) {
    estado.caixa = caixa;
    estado.equipeId = null;
    estado.canal = null;
    renderSidebar();
    await carregarConversas({ selecionarPrimeira: true });
  }

  async function selecionarEquipe(id) {
    estado.equipeId = id;
    estado.canal = null;
    estado.caixa = 'todas';
    renderSidebar();
    await carregarConversas({ selecionarPrimeira: true });
  }

  // Caixa de um canal: só as conversas que chegam pelo WhatsApp, Telegram ou chat do site.
  async function selecionarCanal(canal) {
    estado.canal = canal;
    estado.equipeId = null;
    estado.caixa = 'todas';
    renderSidebar();
    await carregarConversas({ selecionarPrimeira: true });
  }

  async function enviarMensagem(texto, tipo, campo) {
    const c = estado.conversa;
    if (!c || !texto.trim() || estado.enviando) return;
    estado.enviando = true;

    // A mensagem aparece na hora, marcada como "enviando", e o campo já fica livre.
    const provisoria = {
      id: `tmp-${Date.now()}`,
      tipo: tipo === 'nota' ? 'nota' : 'atendente',
      texto: texto.trim(),
      entrega: tipo === 'nota' ? null : 'enviando',
      criadaEm: Date.now(),
      autor: { id: estado.resumo?.usuario?.id, nome: estado.resumo?.usuario?.nome, nomeCurto: estado.resumo?.usuario?.nomeCurto || 'Você' },
      midia: null,
      provisoria: true,
    };
    const textoAnterior = campo ? campo.value : '';
    if (campo) { campo.value = ''; ajustarAltura(campo); }
    c.mensagens.push(provisoria);
    if (tipo === 'nota') estado.modo = 'resposta';
    aplicarConversa(c);
    $('#texto-msg')?.focus();

    try {
      const r = await api(`/conversas/${c.id}/mensagens`, { method: 'POST', body: { texto: provisoria.texto, tipo } });
      if (r.erroEnvio) toast(`Não foi possível enviar pelo ${NOME_CANAL[c.canal] || c.canal}: ${r.erroEnvio}`, 5000);
      const posicao = c.mensagens.findIndex((m) => m.id === provisoria.id);
      if (posicao >= 0) c.mensagens[posicao] = r.mensagem; else c.mensagens.push(r.mensagem);
      Object.assign(c, { status: r.conversa.status, atendente: r.conversa.atendente, equipe: r.conversa.equipe, atualizadaEm: r.conversa.atualizadaEm });
      aplicarConversa(c);
      await Promise.all([carregarResumo(), carregarConversas()]);
    } catch (e) {
      // Não saiu: a mensagem fica marcada e o texto volta para o campo.
      const posicao = c.mensagens.findIndex((m) => m.id === provisoria.id);
      if (posicao >= 0) c.mensagens.splice(posicao, 1);
      aplicarConversa(c);
      const volta = $('#texto-msg');
      if (volta && !volta.value) { volta.value = textoAnterior || provisoria.texto; ajustarAltura(volta); }
      toast(e.message, 5000);
    } finally {
      estado.enviando = false;
    }
  }

  /* ================================================================
   * Balãozinho verde que explica os botões de ícone.
   * Some depois que a pessoa já viu aquele botão 5 vezes.
   * ============================================================== */
  const CHAVE_DICAS = 'crm_dicas';
  const VEZES_DICA = 5;
  let balaoDica = null;

  function lerDicas() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_DICAS) || '{}') || {};
    } catch {
      return {};
    }
  }

  function gravarDicas(dicas) {
    try { localStorage.setItem(CHAVE_DICAS, JSON.stringify(dicas)); } catch { /* navegador sem armazenamento */ }
  }

  function esconderDica() {
    balaoDica?.remove();
    balaoDica = null;
  }

  function mostrarDica(botao, texto) {
    esconderDica();
    balaoDica = el('span', { class: 'dica-balao', role: 'tooltip' }, texto);
    document.body.append(balaoDica);
    const alvo = botao.getBoundingClientRect();
    const bolha = balaoDica.getBoundingClientRect();
    const margem = 8;
    let esquerda = alvo.left + (alvo.width - bolha.width) / 2;
    esquerda = Math.max(margem, Math.min(esquerda, window.innerWidth - bolha.width - margem));
    const acima = alvo.top - bolha.height - 10;
    balaoDica.classList.toggle('embaixo', acima < margem);
    balaoDica.style.left = `${Math.round(esquerda)}px`;
    balaoDica.style.top = `${Math.round(acima < margem ? alvo.bottom + 10 : acima)}px`;
  }

  // Envolve um botão de ícone: explica o que ele faz nas primeiras vezes.
  function comDica(botao, chave, texto) {
    if (!botao) return botao;
    botao.setAttribute('aria-label', texto);
    botao.removeAttribute('title'); // o balão verde substitui a tarjinha do navegador
    botao.addEventListener('mouseenter', () => {
      const dicas = lerDicas();
      const vistas = Number(dicas[chave] || 0);
      if (vistas >= VEZES_DICA) return;
      dicas[chave] = vistas + 1;
      gravarDicas(dicas);
      mostrarDica(botao, texto);
    });
    for (const evento of ['mouseleave', 'click', 'blur']) botao.addEventListener(evento, esconderDica);
    return botao;
  }

  window.addEventListener('scroll', esconderDica, true);
  window.addEventListener('resize', esconderDica);

  // Botão que ainda não faz nada: fica desligado, com o aviso no título.
  function desligar(botao, aviso) {
    if (!botao) return null;
    botao.disabled = true;
    botao.classList.add('desligado');
    botao.classList.remove('hov');
    botao.title = aviso;
    return botao;
  }

  /* --------------------- histórico da conversa --------------------- */
  // A conversa abre com as últimas mensagens. As antigas chegam conforme a
  // pessoa sobe a rolagem, para um histórico grande não travar a tela.
  const historico = { carregando: false };

  async function carregarAnteriores() {
    const c = estado.conversa;
    if (!c || !c.temMaisMensagens || historico.carregando) return;
    const maisAntiga = c.mensagens.find((m) => !m.provisoria);
    if (!maisAntiga) return;
    historico.carregando = true;
    redesenharMensagens({ manterPosicao: true });
    try {
      const r = await api(`/conversas/${c.id}/mensagens?antes=${maisAntiga.id}&antesEm=${maisAntiga.criadaEm}`);
      if (estado.conversa?.id !== c.id) return;
      c.mensagens.unshift(...r.mensagens);
      c.temMaisMensagens = r.temMais;
    } catch (e) {
      toast(e.message);
    } finally {
      historico.carregando = false;
      if (estado.conversa?.id === c.id) redesenharMensagens({ manterPosicao: true });
    }
  }

  // Redesenha só a lista de mensagens (não mexe no campo de escrever).
  function redesenharMensagens({ manterPosicao = false } = {}) {
    const caixa = $('#mensagens');
    if (!caixa || !estado.conversa) return;
    const doFim = caixa.scrollHeight - caixa.scrollTop;
    caixa.replaceChildren(...construirMensagens(estado.conversa));
    caixa.scrollTop = manterPosicao ? caixa.scrollHeight - doFim : caixa.scrollHeight;
  }

  /* ------------------------ notas internas ------------------------ */
  // `editando` guarda qual nota está aberta para edição e em que lugar da tela
  // (no chat ou na ficha do cliente), para não abrir dois campos ao mesmo tempo.
  const nota = { editando: null, onde: null };

  function podeMexerNaNota(m) {
    const u = estado.resumo?.usuario;
    return Boolean(u && (m.autor?.id === u.id || u.papel === 'admin'));
  }

  function editarNota(id, onde) {
    nota.editando = id;
    nota.onde = onde;
    aplicarConversa(estado.conversa);
    const campo = document.querySelector('.nota-edicao textarea');
    if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
  }

  function fecharEdicaoNota() {
    nota.editando = null;
    nota.onde = null;
    aplicarConversa(estado.conversa);
  }

  const editandoAqui = (m, onde) => nota.editando === m.id && nota.onde === onde;

  async function salvarNotaEditada(id, texto) {
    const limpo = String(texto || '').trim();
    if (!limpo) return toast('Escreva a nota antes de salvar.');
    try {
      const r = await api(`/notas/${id}`, { method: 'PATCH', body: { texto: limpo } });
      const c = estado.conversa;
      const posicao = c.mensagens.findIndex((m) => m.id === id);
      if (posicao >= 0) c.mensagens[posicao] = r.mensagem;
      nota.editando = null;
      nota.onde = null;
      aplicarConversa(c);
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async function apagarNota(id) {
    if (!window.confirm('Apagar esta nota interna? Ela some para toda a equipe.')) return;
    try {
      await api(`/notas/${id}`, { method: 'DELETE' });
      const c = estado.conversa;
      const posicao = c.mensagens.findIndex((m) => m.id === id);
      if (posicao >= 0) c.mensagens.splice(posicao, 1);
      if (nota.editando === id) { nota.editando = null; nota.onde = null; }
      aplicarConversa(c);
      toast('Nota apagada.');
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  // Os dois botõezinhos (lápis e lixeira) que aparecem em cada nota.
  function acoesDaNota(m, onde, classe = 'nota-acoes') {
    if (!podeMexerNaNota(m)) return null;
    return el('span', { class: classe },
      el('button', { type: 'button', class: 'btn-nota hov', title: 'Editar nota', onclick: () => editarNota(m.id, onde) }, svg(ICONE.lapisPequeno)),
      el('button', { type: 'button', class: 'btn-nota hov', title: 'Apagar nota', onclick: () => apagarNota(m.id) }, svg(ICONE.lixeira)));
  }

  // A nota vira um campo de texto enquanto está sendo editada.
  function edicaoDaNota(m) {
    const campo = el('textarea', { class: 'area', rows: '3', maxlength: '4000', lang: 'pt-BR', spellcheck: 'true' }, m.texto);
    return el('div', { class: 'nota-edicao' }, campo,
      el('div', { class: 'rodape' },
        el('button', { type: 'button', class: 'btn-suave hov', onclick: fecharEdicaoNota }, 'Cancelar'),
        el('button', { type: 'button', class: 'btn-escuro', onclick: () => salvarNotaEditada(m.id, campo.value) }, 'Salvar nota')));
  }

  /* ---------------------------- anexos ---------------------------- */
  const TAMANHO_MAXIMO_ANEXO = 20 * 1024 * 1024;

  function tipoDoArquivo(arquivo) {
    const m = String(arquivo.type || '').toLowerCase();
    if (m.startsWith('image/')) return 'imagem';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    return 'documento';
  }

  function escolherAnexo() {
    if (!estado.conversa) return;
    if (!estado.resumo?.anexosAtivos) {
      return toast('Envio de anexos indisponível: peça ao responsável para configurar o armazenamento de arquivos no servidor.', 6000);
    }
    const seletor = el('input', { type: 'file', style: 'display:none', accept: '*/*' });
    seletor.addEventListener('change', () => {
      const arquivo = seletor.files?.[0];
      seletor.remove();
      if (arquivo) enviarAnexo(arquivo);
    });
    document.body.append(seletor);
    seletor.click();
  }

  // O arquivo aparece na hora no chat, marcado como "enviando", e vai para o cliente.
  async function enviarAnexo(arquivo) {
    const c = estado.conversa;
    if (!c || estado.enviando) return;
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO) return toast('Arquivo muito grande: o limite é 20 MB.', 5000);
    estado.enviando = true;

    const tipo = tipoDoArquivo(arquivo);
    const previa = tipo === 'imagem' || tipo === 'video' ? URL.createObjectURL(arquivo) : null;
    const provisoria = {
      id: `tmp-${Date.now()}`,
      tipo: 'atendente',
      texto: '',
      entrega: 'enviando',
      criadaEm: Date.now(),
      autor: { id: estado.resumo?.usuario?.id, nome: estado.resumo?.usuario?.nome, nomeCurto: estado.resumo?.usuario?.nomeCurto || 'Você' },
      midia: { tipo, nome: arquivo.name, mime: arquivo.type || null, url: previa },
      provisoria: true,
    };
    c.mensagens.push(provisoria);
    aplicarConversa(c);

    try {
      const resposta = await fetch(`/api/conversas/${c.id}/anexos`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': arquivo.type || 'application/octet-stream',
          'x-nome-arquivo': encodeURIComponent(arquivo.name || 'arquivo'),
        },
        body: arquivo,
      });
      if (resposta.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
      const r = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(r.erro || `Erro ${resposta.status}`);
      if (r.erroEnvio) toast(`Não foi possível enviar pelo ${NOME_CANAL[c.canal] || c.canal}: ${r.erroEnvio}`, 5000);
      const posicao = c.mensagens.findIndex((m) => m.id === provisoria.id);
      if (posicao >= 0) c.mensagens[posicao] = r.mensagem; else c.mensagens.push(r.mensagem);
      Object.assign(c, { status: r.conversa.status, atendente: r.conversa.atendente, atualizadaEm: r.conversa.atualizadaEm });
      aplicarConversa(c);
      await Promise.all([carregarResumo(), carregarConversas()]);
    } catch (e) {
      const posicao = c.mensagens.findIndex((m) => m.id === provisoria.id);
      if (posicao >= 0) c.mensagens.splice(posicao, 1);
      aplicarConversa(c);
      toast(e.message, 5000);
    } finally {
      if (previa) URL.revokeObjectURL(previa);
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

  // Encerra a conversa direto pelo card da lista, sem precisar abri-la.
  // Conversas que acabaram de ser encerradas e ainda estão sendo confirmadas
  // pelo servidor. Ficam de fora da lista para o card não reaparecer caso a
  // atualização automática chegue no meio do caminho.
  const encerrandoAgora = new Set();

  // O card some assim que o gesto completa; a confirmação vai atrás. Se o
  // servidor recusar, a conversa volta para a lista e o atendente é avisado.
  async function encerrarPeloCard(id) {
    if (encerrandoAgora.has(id)) return;
    encerrandoAgora.add(id);
    const conversaAberta = estado.conversa?.id === id ? estado.conversa.status : null;
    if (conversaAberta) {
      estado.conversa.status = 'resolvida';
      aplicarConversa(estado.conversa);
    }
    renderLista();
    toast('Conversa encerrada.');
    try {
      await api(`/conversas/${id}/status`, { method: 'POST', body: { status: 'resolvida' } });
      await Promise.all([carregarResumo(), carregarConversas()]);
    } catch (e) {
      // Não deu: devolve a conversa para a lista, como estava. Sair da lista de
      // "encerrando" vem ANTES de redesenhar, senão o card continua escondido.
      encerrandoAgora.delete(id);
      if (conversaAberta && estado.conversa?.id === id) {
        estado.conversa.status = conversaAberta;
        aplicarConversa(estado.conversa);
      }
      toast(e.message);
      renderLista();
    } finally {
      encerrandoAgora.delete(id);
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
  function navItem({ icone: ic, cor, nome, cont, ativo, alerta, sempreVerde, onclick }) {
    const classes = ['cont'];
    if (alerta && !ativo && cont > 0) classes.push('urgente');
    // Caixas por canal: o selo verde fica aparecendo mesmo sem estar selecionada.
    if (sempreVerde && !ativo && cont > 0) classes.push('verde');
    return el('button', { type: 'button', class: `nav-item${ativo ? ' ativo' : ''}`, onclick },
      cor ? el('span', { class: 'cor-equipe', style: `background:${cor}` }) : ic,
      el('span', { class: 'nome' }, nome),
      el('span', { class: classes.join(' ') }, String(cont)));
  }

  function renderSidebar() {
    const r = estado.resumo;
    if (!r) return;
    const equipeSel = r.equipes.find((e) => e.id === estado.equipeId) || null;
    const semEquipe = !estado.equipeId && !estado.canal;
    const membros = equipeSel ? equipeSel.membros : r.atendentes;

    $('#sidebar').replaceChildren(
      el('span', { class: 'rotulo' }, 'Caixas de entrada'),
      el('div', { class: 'lista-nav' },
        navItem({ icone: icone('todas', ICONE.inbox), nome: 'Todas', cont: r.caixas.todas, ativo: semEquipe && estado.caixa === 'todas', onclick: () => selecionarCaixa('todas') }),
        navItem({ icone: icone('sem-resposta', ICONE.relogio, { classe: 'vermelho' }), nome: 'Sem resposta', cont: r.caixas.semResposta, alerta: true, ativo: semEquipe && estado.caixa === 'sem_resposta', onclick: () => selecionarCaixa('sem_resposta') }),
        navItem({ icone: icone('encerradas', ICONE.checkCaixa), nome: 'Encerradas', cont: r.caixas.encerradas, ativo: semEquipe && estado.caixa === 'encerradas', onclick: () => selecionarCaixa('encerradas') })),
      el('span', { class: 'separador' }),
      el('div', { class: 'linha-rotulo' },
        el('span', { class: 'rotulo' }, 'Inbox da equipe'),
        desligar(el('button', { type: 'button', class: 'btn-mini' }, icone('mais', ICONE.mais)), 'Cadastro de equipes: em breve')),
      el('div', { class: 'lista-nav' },
        ...r.equipes
          .filter((e) => e.nome.trim().toLocaleLowerCase('pt-BR') !== 'admin')
          .map((e) => navItem({ cor: e.cor, nome: e.nome, cont: e.abertas, ativo: estado.equipeId === e.id, onclick: () => selecionarEquipe(e.id) }))),
      el('span', { class: 'separador' }),
      el('span', { class: 'rotulo' }, equipeSel ? `Equipe de ${equipeSel.nome}` : 'Atendentes'),
      el('div', { class: 'membros' },
        ...membros.map((m) => el('div', { class: 'membro hov', title: m.email || '' },
          el('span', { class: 'avatar p' }, m.iniciais),
          el('div', { class: 'membro-info' },
            el('span', { class: 'membro-nome' }, m.nomeCurto),
            el('span', { class: `membro-status${m.presenca === 'online' ? ' online' : ''}` }, `${m.presenca} · ${m.ativas ? `${m.ativas} ativa${m.ativas === 1 ? '' : 's'}` : 'livre'}`)))),
        membros.length ? null : el('div', { class: 'vazio' }, 'Nenhum atendente nesta equipe.')),
      desligar(el('button', { type: 'button', class: 'btn-tracejado' }, icone('mais', ICONE.mais), 'Adicionar à equipe'), 'Gestão de membros: em breve'),
    );
  }

  /* ================================================================
   * Render: lista de conversas
   * ============================================================== */
  function tituloLista() {
    const equipeSel = estado.resumo?.equipes.find((e) => e.id === estado.equipeId);
    if (equipeSel) return equipeSel.nome;
    if (estado.canal) return NOME_CANAL[estado.canal] || estado.canal;
    return { todas: 'Todas as conversas', minhas: 'Minhas conversas', sem_resposta: 'Sem resposta', encerradas: 'Conversas encerradas' }[estado.caixa];
  }

  // Corta nomes longos na lista, mantendo o nome inteiro no título do item.
  function encurtar(texto, limite) {
    const t = String(texto || '').trim();
    return t.length > limite ? `${t.slice(0, limite - 1).trimEnd()}…` : t;
  }

  function itemConversa(c) {
    const ativa = c.id === estado.conversaId;
    const corAvatar = ativa ? 'verde' : (c.canal === 'telegram' ? 'azul' : 'cinza');
    const corCanal = COR_CANAL[c.canal] || COR_CANAL.whatsapp;

    let tag = null;
    if (c.status === 'resolvida') tag = ['Resolvida', ''];
    else if (c.semResposta) tag = [`Sem resposta ${minutosTexto(c.semRespostaMin)}`, 'vermelho'];
    else if (c.contato.empresa && c.contato.empresa !== c.contato.nome) tag = [c.contato.empresa, 'verde'];

    const previa = c.ultimaTipo === 'atendente' && c.ultimaAutor
      ? `${c.ultimaAutor.split(' ')[0]}: ${c.ultimaTexto}`
      : (c.ultimaTexto || 'Sem mensagens');

    // Só em "Minhas conversas": o botão de encerrar, no canto de baixo do card.
    const encerrar = estado.caixa === 'minhas' && c.status === 'aberta'
      ? el('button', {
        type: 'button', class: 'conversa-encerrar hov', 'aria-label': `Encerrar a conversa com ${c.contato.nome}`,
        title: 'Encerrar conversa',
        onclick: (e) => { e.stopPropagation(); encerrarPeloCard(c.id); },
      }, svg(ICONE.check))
      : null;

    // Cartão clicável (div, e não button, porque tem um botão dentro).
    const pressao = { encerrou: false };
    const card = el('div', {
      class: `conversa${ativa ? ' ativa' : ''}`, role: 'button', tabindex: '0',
      onclick: () => { if (!pressao.encerrou) abrirConversa(c.id); },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirConversa(c.id); } },
    },
      el('span', { class: 'avatar-wrap' },
        avatarCliente(c, `avatar m ${corAvatar}`),
        el('span', { class: 'canal-badge', style: `background:${corCanal}`, html: ICONE[c.canal]?.(11, '#FFFFFF') || '' })),
      el('div', { class: 'conversa-corpo' },
        el('div', { class: 'conversa-linha' },
          el('span', { class: 'conversa-nome', title: c.contato.nome }, encurtar(c.contato.nome, 14)),
          c.atendente ? el('span', { class: 'tag atendente', title: `Em atendimento com ${c.atendente.nome || c.atendente.nomeCurto}` }, c.atendente.nomeCurto) : null,
          el('span', { class: 'conversa-hora' }, horaLista(c.ultimaEm || c.atualizadaEm))),
        el('span', { class: 'conversa-previa' }, previa),
        tag ? el('span', { class: `tag ${tag[1]}`.trim() }, tag[0]) : null),
      c.naoLidas > 0 && !ativa ? el('span', { class: 'nao-lidas' }, String(c.naoLidas)) : null,
      encerrar);
    if (c.status === 'aberta') segurarParaEncerrar(card, c, pressao);
    return card;
  }

  // Segurar o dedo (ou o botão do mouse) no card vai preenchendo ele da esquerda
  // para a direita; quando enche, a conversa é encerrada.
  // Um clique comum dura menos de 200 ms: nesse tempo nada aparece na tela. O
  // preenchimento só começa quando fica claro que a pessoa está segurando.
  const ESPERA_ANTES_MS = 260;
  const TEMPO_SEGURAR_MS = 750; // precisa bater com a transição do CSS
  const DISTANCIA_MAXIMA = 10;  // arrastar o dedo/ponteiro cancela o gesto

  // Só existe um gesto por vez, guardado aqui fora. Assim, se a lista for
  // redesenhada no meio (o que acontece a cada clique e na atualização
  // automática), o relógio do card antigo é cancelado junto e a conversa não
  // acaba sendo encerrada sozinha depois.
  const segurando = { inicio: null, relogio: null, card: null, x: 0, y: 0 };

  function cancelarPressao() {
    clearTimeout(segurando.inicio);
    clearTimeout(segurando.relogio);
    segurando.inicio = null;
    segurando.relogio = null;
    segurando.card?.classList.remove('segurando', 'cheio');
    segurando.card = null;
  }

  window.addEventListener('pointerup', cancelarPressao, true);
  window.addEventListener('pointercancel', cancelarPressao, true);
  window.addEventListener('blur', cancelarPressao);
  window.addEventListener('pointermove', (e) => {
    if (!segurando.card) return;
    if (Math.hypot(e.clientX - segurando.x, e.clientY - segurando.y) > DISTANCIA_MAXIMA) cancelarPressao();
  }, true);

  function segurarParaEncerrar(card, c, pressao) {
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      cancelarPressao();
      pressao.encerrou = false;
      Object.assign(segurando, { card, x: e.clientX, y: e.clientY });
      segurando.inicio = setTimeout(() => {
        if (segurando.card !== card || !card.isConnected) return;
        card.classList.add('segurando');
        requestAnimationFrame(() => { if (segurando.card === card) card.classList.add('cheio'); });
        segurando.relogio = setTimeout(() => {
          // Vale só se o dedo continua neste mesmo card, e ele ainda está na tela.
          const vale = segurando.card === card && card.isConnected;
          cancelarPressao();
          if (!vale) return;
          pressao.encerrou = true;
          encerrarPeloCard(c.id);
        }, TEMPO_SEGURAR_MS);
      }, ESPERA_ANTES_MS);
    });

    card.addEventListener('pointerleave', cancelarPressao);
  }

  function renderLista() {
    cancelarPressao(); // a lista vai ser trocada: nenhum gesto sobrevive a isso
    const lista = encerrandoAgora.size
      ? estado.conversas.filter((c) => !encerrandoAgora.has(c.id))
      : estado.conversas;
    const abertas = lista.filter((c) => c.status === 'aberta').length;
    const sem = lista.filter((c) => c.semResposta).length;
    $('#lista-titulo').textContent = tituloLista();
    $('#lista-sub').textContent = `${abertas} conversa${abertas === 1 ? '' : 's'} · ${sem} sem resposta`;
    const cont = $('#conversas');
    if (!lista.length) {
      cont.replaceChildren(listaVazia());
      return;
    }
    cont.replaceChildren(...lista.map(itemConversa));
  }

  function nomeCaixa() {
    const equipeSel = estado.resumo?.equipes.find((e) => e.id === estado.equipeId);
    if (equipeSel) return equipeSel.nome;
    if (estado.canal) return NOME_CANAL[estado.canal] || estado.canal;
    return { todas: 'Todas', minhas: 'Minhas', sem_resposta: 'Sem resposta', encerradas: 'Encerradas' }[estado.caixa] || 'Todas';
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
    if (estado.caixa === 'encerradas') return { titulo: 'Nada encerrado', texto: 'Nenhuma conversa foi encerrada nos últimos dias.', ...verTodas };
    return { titulo: 'Nenhuma conversa aberta', texto: '', acao: null };
  }

  function listaVazia() {
    const d = descricaoVazia();
    return el('div', { class: 'lista-vazia' },
      el('span', { class: 'lista-vazia-icone' }, icone('buscar', ICONE.busca)),
      el('div', { class: 'lista-vazia-texto' }, el('strong', {}, d.titulo), d.texto ? el('span', {}, d.texto) : null),
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
      texto = el('span', {}, 'Nenhuma conversa corresponde à busca. Tente outro nome, o celular ou o PIN do cliente.');
    } else if (!estado.conversas.length) {
      titulo = 'Tudo limpo por aqui';
      texto = estado.equipeId
        ? el('span', {}, 'A equipe ', el('strong', {}, nomeCaixa()), ' não tem nenhuma conversa aberta.')
        : el('span', {}, {
          minhas: 'Você não tem nenhuma conversa em atendimento.',
          sem_resposta: 'Nenhuma pérola está aguardando resposta.',
          encerradas: 'Nenhuma conversa encerrada por aqui.',
        }[estado.caixa] || 'Nenhuma conversa aberta no momento.');
    } else {
      titulo = 'Nenhuma conversa selecionada';
      texto = el('span', {}, 'Escolha uma conversa na lista ao lado para começar o atendimento.');
    }
    const semNada = !estado.conversas.length && !estado.busca && !estado.equipeId && !estado.canal
      && ['todas', 'minhas', 'sem_resposta'].includes(estado.caixa);
    return el('div', { class: 'chat-vazio' },
      el('span', { class: `chat-vazio-icone${semNada ? ' perola-sem-fundo' : ''}` }, semNada ? imagemPerola() : icone('atendimento', ICONE.balao)),
      el('div', { class: 'chat-vazio-texto' }, el('strong', {}, titulo), texto));
  }

  // A pérola das caixas vazias. Se existir o arquivo /icones/perola.png, ele é
  // usado; senão fica o desenho, para a tela nunca aparecer quebrada.
  function imagemPerola() {
    const desenho = el('span', { class: 'ic', style: '--ic:52px', html: ICONE.perola });
    const foto = el('img', { src: '/icones/perola.png', alt: '', class: 'perola-img' });
    foto.addEventListener('error', () => foto.replaceWith(desenho));
    return foto;
  }

  /* ---------------- respostas rápidas ---------------- */
  const rapidas = { aberto: false, lista: null, busca: '', form: null, erro: null, carregando: false, origem: 'botao' };

  function fecharRapidas() {
    rapidas.aberto = false;
    rapidas.form = null;
    rapidas.erro = null;
    const painel = $('#painel-rapidas');
    if (painel) painel.remove();
    $('#texto-msg')?.focus();
  }

  async function abrirRapidas({ busca = '', origem = 'botao' } = {}) {
    Object.assign(rapidas, { aberto: true, busca, form: null, erro: null, origem });
    desenharRapidas();
    if (!rapidas.lista) {
      rapidas.carregando = true;
      try {
        rapidas.lista = (await api('/respostas')).respostas;
      } catch (e) {
        rapidas.erro = e.message;
      } finally {
        rapidas.carregando = false;
        desenharRapidas();
      }
    }
  }

  async function recarregarRapidas(lista) {
    rapidas.lista = lista;
    desenharRapidas();
    if (config.aberto && config.secao === 'respostas') renderConfig();
  }

  // Busca a lista quando ela ainda não foi carregada nesta sessão.
  async function carregarRapidas() {
    if (rapidas.lista) return rapidas.lista;
    rapidas.lista = (await api('/respostas')).respostas;
    return rapidas.lista;
  }

  // Coloca o texto da resposta no campo de mensagem e fecha o painel.
  async function usarResposta(r) {
    const campo = $('#texto-msg');
    if (campo) {
      // Se a pessoa digitou "/algo", troca isso pela resposta inteira.
      const semAtalho = campo.value.replace(/(^|\s)\/[^\s]*$/, '$1');
      campo.value = semAtalho ? `${semAtalho.replace(/\s+$/, '')} ${r.texto}` : r.texto;
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
      ajustarAltura(campo);
    }
    fecharRapidas();
    api(`/respostas/${r.id}/uso`, { method: 'POST', body: {} }).catch(() => {});
  }

  function filtrarRapidas() {
    const busca = rapidas.busca.trim().toLowerCase();
    const lista = rapidas.lista || [];
    if (!busca) return lista;
    return lista.filter((r) => [r.atalho, r.titulo, r.texto].some((v) => String(v).toLowerCase().includes(busca)));
  }

  function itemResposta(r) {
    return el('div', { class: 'rapida-item hov', onclick: () => usarResposta(r) },
      el('div', { class: 'rapida-linha' },
        el('span', { class: 'rapida-atalho' }, `/${r.atalho}`),
        el('span', { class: 'rapida-titulo' }, r.titulo),
        r.podeEditar
          ? el('button', {
            type: 'button', class: 'btn-icone pequeno hov', title: 'Editar ou excluir',
            onclick: (e) => { e.stopPropagation(); abrirFormRapida(r); },
          }, icone('acoes', ICONE.pontos))
          : null),
      el('span', { class: 'rapida-texto' }, r.texto),
      el('span', { class: 'rapida-meta' }, [
        r.usos ? `usada ${r.usos}×` : 'ainda não usada',
        r.escopo === 'equipe' ? `equipe ${r.equipeNome || ''}`.trim() : (r.escopo === 'eu' ? 'só eu' : 'todas as equipes'),
      ].join(' · ')));
  }

  function abrirFormRapida(r = null) {
    rapidas.form = r
      ? { id: r.id, atalho: r.atalho, titulo: r.titulo, texto: r.texto, escopo: r.escopo, equipeId: r.equipeId }
      : { id: null, atalho: '', titulo: '', texto: '', escopo: 'todas', equipeId: null };
    rapidas.erro = null;
    desenharRapidas();
  }

  async function salvarRapida(form) {
    rapidas.erro = null;
    try {
      const corpo = { atalho: form.atalho, titulo: form.titulo, texto: form.texto, escopo: form.escopo, equipeId: form.equipeId };
      const r = form.id
        ? await api(`/respostas/${form.id}`, { method: 'PATCH', body: corpo })
        : await api('/respostas', { method: 'POST', body: corpo });
      rapidas.form = null;
      await recarregarRapidas(r.respostas);
      toast(form.id ? 'Resposta rápida atualizada.' : 'Resposta rápida criada.');
    } catch (e) {
      rapidas.erro = e.message;
      desenharRapidas();
    }
  }

  async function excluirRapida(id) {
    if (!window.confirm('Excluir esta resposta rápida?')) return;
    try {
      const r = await api(`/respostas/${id}`, { method: 'DELETE' });
      rapidas.form = null;
      await recarregarRapidas(r.respostas);
      toast('Resposta rápida excluída.');
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  function formRapida() {
    const f = rapidas.form;
    const equipes = estado.resumo?.equipes || [];
    const campoAtalho = el('input', { type: 'text', class: 'campo-rapida atalho', value: f.atalho, placeholder: 'estorno', maxlength: '40', oninput: () => { f.atalho = campoAtalho.value; } });
    const campoTitulo = el('input', { type: 'text', class: 'campo-rapida', value: f.titulo, placeholder: 'Estorno solicitado', maxlength: '120', oninput: () => { f.titulo = campoTitulo.value; } });
    const campoTexto = el('textarea', { class: 'campo-rapida area', rows: '5', maxlength: '4000', placeholder: 'Escreva a mensagem que será enviada ao cliente…', oninput: () => { f.texto = campoTexto.value; } }, f.texto);
    const seletorEquipe = el('select', { class: 'campo-rapida', onchange: () => { f.equipeId = Number(seletorEquipe.value) || null; } },
      el('option', { value: '' }, 'Escolha a equipe'),
      ...equipes.map((e) => el('option', { value: String(e.id), selected: Number(f.equipeId) === e.id ? true : null }, e.nome)));
    seletorEquipe.hidden = f.escopo !== 'equipe';

    const aba = (valor, rotulo) => el('button', {
      type: 'button', class: `rapida-escopo${f.escopo === valor ? ' ativo' : ''}`,
      onclick: () => { f.escopo = valor; desenharRapidas(); },
    }, rotulo);

    return el('div', { class: 'rapidas-corpo' },
      rapidas.erro ? el('div', { class: 'aviso erro' }, rapidas.erro) : null,
      el('label', { class: 'rapida-campo' }, el('span', { class: 'rotulo' }, 'Atalho'),
        el('div', { class: 'rapida-atalho-campo' }, el('span', {}, '/'), campoAtalho)),
      el('label', { class: 'rapida-campo' }, el('span', { class: 'rotulo' }, 'Título'), campoTitulo),
      el('label', { class: 'rapida-campo' }, el('span', { class: 'rotulo' }, 'Mensagem'), campoTexto),
      el('div', { class: 'rapida-campo' }, el('span', { class: 'rotulo' }, 'Visível para'),
        el('div', { class: 'rapida-escopos' }, aba('todas', 'Todas as equipes'), aba('equipe', 'Uma equipe'), aba('eu', 'Só eu')),
        seletorEquipe));
  }

  function desenharRapidas() {
    const antigo = $('#painel-rapidas');
    if (!rapidas.aberto) { if (antigo) antigo.remove(); return; }
    const f = rapidas.form;
    const lista = filtrarRapidas();

    const busca = el('input', {
      type: 'text', class: 'rapida-busca', placeholder: 'Buscar atalho ou título…', value: rapidas.busca,
      oninput: () => { rapidas.busca = busca.value; desenharRapidas(); $('#painel-rapidas .rapida-busca')?.focus(); },
    });

    const corpo = f ? formRapida() : el('div', { class: 'rapidas-corpo lista' },
      rapidas.erro ? el('div', { class: 'aviso erro' }, rapidas.erro) : null,
      ...(lista.length ? lista.map(itemResposta)
        : [el('div', { class: 'vazio' }, rapidas.carregando ? 'Carregando…'
          : (rapidas.busca ? 'Nenhuma resposta encontrada.' : 'Nenhuma resposta rápida criada ainda.'))]));

    const rodape = f
      ? el('div', { class: 'rapidas-rodape' },
        f.id ? el('button', { type: 'button', class: 'btn-suave hov', onclick: () => excluirRapida(f.id) }, 'Excluir') : null,
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => { rapidas.form = null; rapidas.erro = null; desenharRapidas(); } }, 'Cancelar'),
        el('button', { type: 'button', class: 'btn-primario', style: 'flex:1', onclick: () => salvarRapida(f) }, f.id ? 'Salvar alterações' : 'Salvar resposta rápida'))
      : el('div', { class: 'rapidas-rodape' },
        el('button', { type: 'button', class: 'btn-primario', style: 'flex:1', onclick: () => abrirFormRapida() },
          icone('mais', ICONE.mais, { classe: 'branco' }), 'Nova resposta rápida'));

    const painel = el('aside', { class: 'rapidas', id: 'painel-rapidas', role: 'dialog', 'aria-label': 'Respostas rápidas' },
      el('span', { class: 'rapidas-alca' }),
      el('div', { class: 'rapidas-topo' },
        el('span', { class: 'rapidas-icone' }, icone('raio', ICONE.raio)),
        el('div', { class: 'rapidas-titulo' },
          el('strong', {}, f ? (f.id ? 'Editar resposta rápida' : 'Nova resposta rápida') : 'Respostas rápidas'),
          el('span', {}, f ? 'O atalho fica disponível para quem você escolher.'
            : `${(rapidas.lista || []).length} atalho${(rapidas.lista || []).length === 1 ? '' : 's'} salvo${(rapidas.lista || []).length === 1 ? '' : 's'}`)),
        el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: fecharRapidas }, svg(ICONE.fechar))),
      f ? null : el('div', { class: 'rapidas-busca' }, busca),
      corpo,
      f ? null : el('div', { class: 'rapidas-dica' }, 'Digite ', el('strong', {}, '/'), ' no campo de resposta para abrir este painel já filtrado.'),
      rodape);

    // Sobe de dentro do chat, na largura toda, parando acima do campo de escrever.
    const chat = $('#chat');
    const compositor = chat?.querySelector('.compositor');
    const alturaCompositor = compositor ? compositor.offsetHeight + 8 : 16;
    painel.style.bottom = `${alturaCompositor}px`;
    // Altura fixa: o painel ocupa o chat todo, tenha uma resposta salva ou vinte.
    painel.style.height = `calc(90% - ${alturaCompositor}px)`;
    if (antigo) antigo.replaceWith(painel); else (chat || document.body).append(painel);
    // Aberto pelo botão: o cursor vai para a busca. Aberto pela barra: fica na mensagem.
    if (!f && !antigo && rapidas.origem === 'botao') busca.focus();
  }

  // A primeira letra que o atendente digita já sai maiúscula.
  function maiuscularInicio(campo) {
    const texto = campo.value;
    if (texto.length !== 1) return;
    const maiuscula = texto.toUpperCase();
    if (maiuscula === texto) return;
    const fim = campo.selectionStart;
    campo.value = maiuscula;
    campo.setSelectionRange(fim, fim);
  }

  /* ---------------- acentuação automática ---------------- */
  const CHAVE_ACENTOS = 'crm_acentos';
  let acentosLigados = true;
  try { acentosLigados = localStorage.getItem(CHAVE_ACENTOS) !== 'off'; } catch { /* navegador sem armazenamento */ }

  function alternarAcentos() {
    acentosLigados = !acentosLigados;
    try { localStorage.setItem(CHAVE_ACENTOS, acentosLigados ? 'on' : 'off'); } catch { /* tudo bem */ }
    toast(acentosLigados ? 'Acentuação automática ligada.' : 'Acentuação automática desligada.');
    renderChat();
  }

  // Corrige a palavra que acabou de ser fechada por espaço, ponto, vírgula…
  function corrigirEnquantoDigita(campo) {
    if (!acentosLigados || !campo) return;
    const fim = campo.selectionStart;
    if (fim !== campo.selectionEnd || fim < 2) return;
    const antes = campo.value.slice(0, fim);
    const separador = /[\s.,;:!?)\]}"'…]$/.test(antes);
    if (!separador) return;
    const m = /([A-Za-z]+)([\s.,;:!?)\]}"'…])$/.exec(antes);
    if (!m) return;
    const corrigida = corrigirPalavra(m[1]);
    if (!corrigida) return;
    const inicio = fim - m[0].length;
    campo.value = campo.value.slice(0, inicio) + corrigida + m[2] + campo.value.slice(fim);
    const novoFim = inicio + corrigida.length + m[2].length;
    campo.setSelectionRange(novoFim, novoFim);
  }

  let visor = null;

  function fecharVisor() {
    if (visor) visor.remove();
    visor = null;
  }

  // Mostra a imagem grande sobre a tela, sem abrir outra aba.
  function abrirVisor(url, legenda) {
    fecharVisor();
    visor = el('div', { class: 'visor', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === visor) fecharVisor(); } },
      el('img', { src: url, alt: legenda || 'Imagem enviada pelo cliente' }),
      el('button', { type: 'button', class: 'visor-fechar', title: 'Fechar (Esc)', onclick: fecharVisor }, svg(ICONE.fechar)),
      el('a', { class: 'visor-baixar', href: `${url}?baixar=1`, target: '_blank', rel: 'noopener' }, 'Baixar imagem'));
    document.body.append(visor);
  }

  // Balão da mensagem: mostra a imagem, o áudio ou o vídeo quando o cliente mandou um arquivo.
  function balaoMensagem(m) {
    const a = m.midia;
    if (!a) return el('div', { class: 'balao' }, m.texto);

    const legenda = String(m.texto || '').replace(/^\[[^\]]+\]\s*/, '').trim();
    let conteudo;
    // Arquivo ainda subindo: mostra só o nome, sem link para lugar nenhum.
    if (!a.url) {
      conteudo = el('span', { class: 'midia-arquivo' }, icone('anexo', ICONE.clipe), el('span', {}, a.nome || 'Enviando arquivo…'));
      return el('div', { class: 'balao midia documento' }, conteudo);
    }
    if (a.tipo === 'imagem') {
      conteudo = el('img', {
        src: a.url, alt: legenda || 'Imagem enviada pelo cliente', class: 'midia-imagem', loading: 'lazy',
        title: 'Clique para ver maior', onclick: () => abrirVisor(a.url, legenda),
      });
    } else if (a.tipo === 'video') {
      conteudo = el('video', { src: a.url, controls: 'controls', class: 'midia-video', preload: 'metadata' });
    } else if (a.tipo === 'audio') {
      conteudo = el('audio', { src: a.url, controls: 'controls', class: 'midia-audio', preload: 'metadata' });
    } else {
      conteudo = el('a', { href: `${a.url}?baixar=1`, target: '_blank', rel: 'noopener', class: 'midia-arquivo' },
        icone('anexo', ICONE.clipe), el('span', {}, a.nome || 'Abrir documento'));
    }
    return el('div', { class: `balao midia ${a.tipo}` }, conteudo, legenda ? el('span', { class: 'midia-legenda' }, legenda) : null);
  }

  // "/" no começo de uma palavra abre as respostas rápidas já filtradas.
  function atalhoBarra(campo) {
    const ate = campo.value.slice(0, campo.selectionStart);
    const m = /(?:^|\s)\/([^\s]*)$/.exec(ate);
    if (m) {
      if (!rapidas.aberto) abrirRapidas({ busca: m[1], origem: 'barra' });
      else if (m[1] !== rapidas.busca) { rapidas.busca = m[1]; desenharRapidas(); }
    } else if (rapidas.aberto && !rapidas.form) {
      fecharRapidas();
    }
  }

  // A caixa de texto cresce com o que é digitado, até 90% da altura do chat.
  function ajustarAltura(campo) {
    if (!campo) return;
    const chat = $('#chat');
    const limite = Math.max(120, Math.round((chat?.clientHeight || 600) * 0.9));
    campo.style.setProperty('--altura-maxima', `${limite}px`);
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight, limite)}px`;
  }

  function construirMensagens(c) {
    const nos = [];
    let ultimoDia = null;
    if (c.temMaisMensagens) {
      nos.push(historico.carregando
        ? el('div', { class: 'historico-aviso' }, 'Carregando o histórico…')
        : el('button', { type: 'button', class: 'historico-btn hov', onclick: carregarAnteriores }, 'Ver mensagens anteriores'));
    }
    for (const m of c.mensagens) {
      const dia = new Date(m.criadaEm).toDateString();
      if (dia !== ultimoDia) {
        nos.push(el('span', { class: 'data-sep' }, rotuloData(m.criadaEm)));
        ultimoDia = dia;
      }
      if (m.tipo === 'nota') {
        nos.push(el('div', { class: 'nota' }, icone('nota', ICONE.lapis),
          el('div', { class: 'nota-corpo' },
            editandoAqui(m, 'chat') ? edicaoDaNota(m) : el('span', { class: 'nota-texto' }, el('strong', {}, 'Nota interna'), ' — ', m.texto),
            el('span', { class: 'nota-meta' }, `${m.autor?.nomeCurto || 'Equipe'} · ${horaCurta(m.criadaEm)}${m.editadaEm ? ' · editada' : ''} · visível só para a equipe`)),
          editandoAqui(m, 'chat') ? null : acoesDaNota(m, 'chat')));
      } else if (m.tipo === 'atendente') {
        nos.push(el('div', { class: 'msg saida' },
          balaoMensagem(m),
          el('span', { class: `msg-meta${m.provisoria ? ' enviando' : ''}` }, [
            horaCurta(m.criadaEm),
            m.autor?.nomeCurto || (m.tipo === 'atendente' ? 'pelo celular' : null),
            m.entrega === 'falhou' ? 'não enviada ⚠' : (m.entrega === 'enviando' ? 'enviando…' : m.entrega),
          ].filter(Boolean).join(' · '))));
      } else {
        nos.push(el('div', { class: 'msg' },
          balaoMensagem(m),
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
      desligar(el('button', { type: 'button' }, 'Transferir canal'), 'Transferência entre canais: em breve'));
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
        avatarCliente(c, 'avatar g verde'),
        el('div', { class: 'chat-info' },
          el('span', { class: 'chat-nome' }, c.contato.nome),
          el('span', { class: 'chat-sub' }, [c.contato.empresa, `protocolo #${c.protocolo}`, textoAberto(c.criadaEm, c.status)].filter(Boolean).join(' · '))),
        comDica(el('button', { type: 'button', class: 'btn-icone btn-info hov', onclick: () => $('#painel').classList.toggle('aberto') }, icone('info', ICONE.info)), 'ficha', 'Ficha do cliente'),
        comDica(el('button', { type: 'button', class: 'btn-icone hov', onclick: (e) => { e.stopPropagation(); abrirMenuAcoes(e.currentTarget); } }, icone('acoes', ICONE.pontos)), 'acoes', 'Mais ações')));

    const mensagens = el('div', {
      class: 'rolagem mensagens', id: 'mensagens',
      onscroll: () => { if (mensagens.scrollTop < 80) carregarAnteriores(); },
    }, ...construirMensagens(c));

    const textarea = el('textarea', {
      id: 'texto-msg', rows: '2', maxlength: '4000',
      placeholder: modoNota ? 'Escreva uma nota interna para a equipe…' : `Escreva para ${primeiroNome} pelo ${canalNome}…`,
      lang: 'pt-BR', spellcheck: 'true',
      onkeydown: (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        const escolhidas = rapidas.aberto && rapidas.origem === 'barra' && !rapidas.form ? filtrarRapidas() : [];
        if (escolhidas.length) usarResposta(escolhidas[0]);
        else enviar();
      },
      oninput: () => { maiuscularInicio(textarea); corrigirEnquantoDigita(textarea); ajustarAltura(textarea); atalhoBarra(textarea); },
      onpaste: () => setTimeout(() => { if (acentosLigados) textarea.value = corrigirTexto(textarea.value); ajustarAltura(textarea); }, 0),
    });
    const enviar = () => enviarMensagem(acentosLigados ? corrigirTexto(textarea.value) : textarea.value, modoNota ? 'nota' : 'resposta', textarea);

    const compositor = el('div', { class: 'compositor' },
      el('div', { class: `caixa-texto${modoNota ? ' modo-nota' : ''}` },
        textarea,
        el('div', { class: 'compositor-acoes' },
          comDica(el('button', { type: 'button', class: 'btn-icone hov', onclick: escolherAnexo }, icone('anexo', ICONE.clipe)),
            'anexo', 'Enviar arquivo'),
          comDica(el('button', {
            type: 'button', class: `btn-icone hov${rapidas.aberto ? ' ativo' : ''}`,
            onclick: () => (rapidas.aberto ? fecharRapidas() : abrirRapidas()),
          }, icone('raio', ICONE.raio)), 'rapidas', 'Respostas rápidas'),
          comDica(el('button', {
            type: 'button', class: `btn-icone hov acentos-toggle${acentosLigados ? ' ativo' : ''}`,
            'aria-pressed': acentosLigados ? 'true' : 'false',
            onclick: alternarAcentos,
          }, 'Á'), 'acentos', acentosLigados ? 'Acentuação automática ligada' : 'Acentuação automática desligada'),
          comDica(el('button', {
            type: 'button', class: `btn-icone hov nota-toggle${modoNota ? ' ativo' : ''}`,
            'aria-pressed': modoNota ? 'true' : 'false',
            onclick: () => mudarModo(modoNota ? 'resposta' : 'nota'),
          }, icone('nota', ICONE.lapis)), 'nota', modoNota ? 'Voltar a responder o cliente' : 'Nota interna'),
          modoNota ? el('span', { class: 'aviso-nota' }, 'Nota interna: só a equipe vê') : null,
          el('span', { class: 'empurrar' }),
          el('button', { type: 'button', class: 'btn-primario', id: 'btn-enviar', onclick: enviar }, modoNota ? 'Salvar nota' : 'Enviar', modoNota ? null : icone('enviar', ICONE.enviar, { animado: true, classe: 'branco' })))));

    chat.replaceChildren(cabecalho, mensagens, compositor);
    ajustarAltura(textarea);
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

  // Ícone do canal (WhatsApp ou Telegram) herdando a cor do texto ao redor.
  // Iniciais do cliente; se o nome começa com emoji ou símbolo (comum no Telegram),
  // o avatar mostra o ícone do canal em vez de um desenho sem sentido.
  function avatarCliente(c, classe = 'avatar') {
    const ini = String(c.contato.iniciais || '');
    const soLetras = ini && !/[^A-Za-zÀ-ÿ0-9]/.test(ini);
    const dentro = soLetras ? ini : iconeCanal(c.canal, classe.includes('g') ? 20 : 15);
    const avatar = el('span', { class: classe }, dentro);
    // Foto do perfil do cliente; se não carregar, ficam as iniciais.
    if (c.contato.foto) {
      const foto = el('img', {
        class: 'avatar-foto', src: c.contato.foto, alt: '', loading: 'lazy',
        onload: () => avatar.classList.add('com-foto'),
        onerror: () => foto.remove(),
      });
      avatar.append(foto);
    }
    return avatar;
  }

  function iconeCanal(canal, tamanho = 15) {
    return el('span', { class: 'ic', style: `--ic:${tamanho}px`, html: ICONE[canal]?.(tamanho, 'currentColor', 2.2) || '' });
  }

  /* ---------------- consulta de saldo pelo PIN ---------------- */
  const saldo = { conversaId: null, pin: '', carregando: false, cliente: null, erro: null };

  function limparSaldo(conversaId) {
    Object.assign(saldo, { conversaId, pin: '', carregando: false, cliente: null, erro: null });
  }

  async function consultarSaldo(pinDigitado) {
    const c = estado.conversa;
    if (!c || saldo.carregando) return;
    const pin = String(pinDigitado || '').replace(/\D/g, '');
    if (!pin) return toast('Digite o PIN do cliente nos quadradinhos para consultar o saldo.');
    Object.assign(saldo, { conversaId: c.id, pin, carregando: true, cliente: null, erro: null });
    renderPainel();
    try {
      const r = await api('/suporte/saldo', { method: 'POST', body: { pin, conversaId: c.id } });
      Object.assign(saldo, { carregando: false, cliente: r.cliente });
      if (r.conversa) c.contato = r.conversa.contato;
    } catch (e) {
      Object.assign(saldo, { carregando: false, erro: e.message });
    }
    renderPainel();
  }

  // Os quadradinhos do PIN: o atendente digita ali o PIN informado pelo cliente.
  // O PIN do cliente tem 5 dígitos; quem tiver mais ganha os quadradinhos extras.
  const TAMANHO_PIN = 5;

  function camposPin(valorInicial) {
    const caixas = [];
    const quantidade = Math.min(Math.max(TAMANHO_PIN, String(valorInicial || '').length), 12);
    const pinAtual = () => caixas.map((i) => i.value).join('').replace(/\D/g, '');
    const foco = (i) => { const alvo = caixas[i]; if (alvo) { alvo.focus(); alvo.select(); } };
    for (let i = 0; i < quantidade; i += 1) {
      const caixa = el('input', {
        type: 'text', inputmode: 'numeric', maxlength: '1', class: 'pin-digito', 'aria-label': `Dígito ${i + 1} do PIN`,
        value: valorInicial[i] || '',
        oninput: () => {
          caixa.value = caixa.value.replace(/\D/g, '').slice(-1);
          if (caixa.value) foco(i + 1);
        },
        onkeydown: (e) => {
          if (e.key === 'Backspace' && !caixa.value) { e.preventDefault(); foco(i - 1); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); foco(i - 1); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); foco(i + 1); }
          else if (e.key === 'Enter') { e.preventDefault(); consultarSaldo(pinAtual()); }
        },
        onpaste: (e) => {
          const colado = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
          if (!colado) return;
          e.preventDefault();
          caixas.forEach((cx, n) => { cx.value = colado[n] || ''; });
          foco(Math.min(colado.length, caixas.length - 1));
        },
        onfocus: () => caixa.select(),
      });
      caixas.push(caixa);
    }
    return { caixas, pinAtual };
  }

  // Resultado da consulta, mostrado dentro do card do PIN.
  function blocoSaldo() {
    if (saldo.carregando) return el('div', { class: 'saldo-resultado' }, el('span', { class: 'saldo-aguarde' }, 'Consultando saldo…'));
    if (saldo.erro) return el('div', { class: 'saldo-resultado erro' }, saldo.erro);
    const cli = saldo.cliente;
    if (!cli) return null;
    const avisos = [];
    if (cli.bloqueada) avisos.push('conta bloqueada');
    if (cli.status && cli.status !== 'active') avisos.push(`conta ${cli.statusTexto}`);
    return el('div', { class: 'saldo-resultado' },
      el('div', { class: 'saldo-linha' },
        el('span', { class: 'saldo-valor' }, cli.saldo),
        el('span', { class: 'saldo-nome' }, [cli.nome, cli.pin ? `PIN ${cli.pin}` : null].filter(Boolean).join(' · '))),
      cli.email ? el('span', { class: 'saldo-info' }, cli.email) : null,
      el('span', { class: 'saldo-info' }, `${cli.totalRecargas} recarga${cli.totalRecargas === 1 ? '' : 's'}${cli.ultimaRecarga ? ` · última de ${cli.ultimaRecarga.valor}` : ''}`),
      avisos.length ? el('span', { class: 'saldo-alerta' }, `Atenção: ${avisos.join(' e ')}.`) : null);
  }

  function blocoPin(c) {
    const ct = c.contato;
    const validado = Boolean(ct.pin && ct.pinValidadoEm);
    // No Telegram o cliente já chega identificado: o PIN dele vem preenchido.
    // No WhatsApp começa vazio e o atendente digita o que o cliente informar.
    const doCanal = c.canal === 'telegram' ? (ct.telegramId || '') : '';
    const valorInicial = String(saldo.pin || ct.pin || doCanal || '').trim();
    const podeConsultar = Boolean(estado.resumo?.saldoAtivo);
    const botaoSaldo = (ler) => (podeConsultar
      ? el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => consultarSaldo(ler()) },
        saldo.cliente || saldo.erro ? 'Consultar de novo' : 'Consultar saldo')
      : null);

    // Já tem PIN: card enxuto, só com o número e o sinal de conferido.
    if (valorInicial) {
      // Verde quando o PIN veio do próprio cliente (Telegram) ou já foi conferido.
      const confirmado = Boolean(ct.pin) || validado;
      const copiar = () => copiarPin(valorInicial);
      return el('div', { class: `bloco-pin${confirmado ? '' : ' pendente'} compacto` },
        el('div', {
          class: 'pin-pronto copiavel', title: 'Clique para copiar o PIN',
          role: 'button', tabindex: '0', 'aria-label': `Copiar PIN ${valorInicial}`,
          onclick: copiar,
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              copiar();
            }
          },
        },
          icone('pin', ICONE.cadeado),
          el('span', { class: 'pin-valor' }, valorInicial),
          el('span', {
            class: `ok${confirmado ? '' : ' pendente'}`,
            title: validado
              ? `Conferido às ${horaCurta(ct.pinValidadoEm)} por ${ct.pinValidadoPor || 'equipe'}`
              : (confirmado ? 'PIN informado pelo cliente' : 'Ainda não conferido'),
            html: ICONE.check,
          })),
        botaoSaldo(() => valorInicial),
        blocoSaldo());
    }

    const { caixas, pinAtual } = camposPin('');
    return el('div', { class: 'bloco-pin pendente' },
      el('div', { class: 'cab' },
        iconeCanal(c.canal, 16),
        el('span', { class: 'rotulo' }, 'PIN do cliente'),
        el('span', { class: 'selo pendente' }, 'Pendente')),
      el('div', { class: 'pin-digitos' }, ...caixas),
      el('div', { class: 'linha-pin' },
        el('span', { class: 'pin-info' }, 'Digite o PIN que o cliente informou.'),
        botaoSaldo(pinAtual)),
      blocoSaldo());
  }

  // "Abrir conta": entra na conta do cliente no site, já logada. Só existe para
  // quem chegou pelo chat do site, que é de onde vem o id do cliente lá.
  function botaoAbrirConta(c) {
    const id = c.contato.siteId;
    if (!id || !estado.resumo?.abrirContaAtivo) {
      return desligar(el('button', { type: 'button', class: 'link-btn com-olho' }, svg(ICONE.olho), 'Abrir conta'),
        id ? 'Abrir conta: falta configurar o acesso ao site' : 'Abrir conta: só para clientes que chegam pelo chat do site');
    }
    return el('button', {
      type: 'button', class: 'link-btn com-olho',
      title: `Entrar na conta de ${c.contato.nome} no site`,
      onclick: (e) => abrirContaDoCliente(c, e.currentTarget),
    }, svg(ICONE.olho), 'Abrir conta');
  }

  // Um clique só: o CRM pede o endereço ao site e abre em outra aba.
  async function abrirContaDoCliente(c, botao) {
    if (botao.dataset.ocupado) return;
    botao.dataset.ocupado = '1';
    // A aba precisa nascer no clique, senão o navegador bloqueia; o endereço chega depois.
    const aba = window.open('', '_blank');
    try {
      const r = await api(`/conversas/${c.id}/abrir-conta`, { method: 'POST' });
      if (aba) aba.location = r.url; else window.open(r.url, '_blank', 'noopener');
      toast('Conta aberta em outra aba.');
      const atualizada = await api(`/conversas/${c.id}`);
      if (estado.conversa?.id === c.id) aplicarConversa(juntarHistorico(estado.conversa, atualizada.conversa));
    } catch (e) {
      aba?.close();
      toast(e.message, 5000);
    } finally {
      delete botao.dataset.ocupado;
    }
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

    const textareaNota = el('textarea', {
      id: 'texto-nota', rows: '2', maxlength: '4000', placeholder: 'Escreva uma nota para a equipe…',
      'aria-label': 'Nova nota interna', lang: 'pt-BR', spellcheck: 'true',
      oninput: () => { maiuscularInicio(textareaNota); corrigirEnquantoDigita(textareaNota); },
    });
    const salvarNota = () => enviarMensagem(acentosLigados ? corrigirTexto(textareaNota.value) : textareaNota.value, 'nota', textareaNota);

    painel.replaceChildren(
      el('div', { class: 'painel-topo' },
        c.canal === 'telegram'
          ? el('span', { class: 'avatar-quadrado neutro' }, iconeCanal('telegram', 15))
          : avatarCliente({ canal: c.canal, contato: { iniciais: iniciais(ct.empresa || ct.nome) } }, 'avatar-quadrado neutro'),
        el('div', { class: 'membro-info' },
          el('span', { class: 'painel-nome suave' }, ct.empresa || 'Ficha do cliente'),
          el('span', { class: 'painel-sub' }, ct.cnpj || ct.telefone || (ct.telegramUsuario ? `@${ct.telegramUsuario}` : ''))),
        botaoAbrirConta(c)),
      el('div', { class: 'rolagem painel-corpo' },
        blocoPin(c),
        ct.dados?.length ? secao('Conta do cliente',
          el('div', {}, ...ct.dados.map(([k, v, cor]) => el('div', { class: 'linha-dado' },
            el('span', { class: 'k' }, k), el('span', { class: `v${cor ? ` ${cor}` : ''}` }, v))))) : null,
        c.alerta ? el('div', { class: 'alerta' }, icone('alerta', ICONE.alerta),
          el('span', {}, el('strong', {}, `${c.alerta.titulo} `), c.alerta.texto)) : null,
        el('div', { class: 'secao' },
          el('div', { class: 'caixa-nota' }, textareaNota,
            el('div', { class: 'rodape' },
              el('span', { class: 'dica' }, 'Só a equipe vê.'),
              el('button', { type: 'button', class: 'btn-escuro', onclick: salvarNota }, 'Salvar nota'))),
          ...notas.map((n) => el('div', { class: 'nota-item' },
            editandoAqui(n, 'ficha') ? edicaoDaNota(n) : el('span', { class: 't' }, n.texto),
            el('div', { class: 'nota-item-pe' },
              el('span', { class: 'm' }, `${n.autor?.nomeCurto || 'Equipe'} · ${horaLista(n.criadaEm) === horaCurta(n.criadaEm) ? horaCurta(n.criadaEm) : `${horaLista(n.criadaEm)} ${horaCurta(n.criadaEm)}`}${n.editadaEm ? ' · editada' : ''}`),
              editandoAqui(n, 'ficha') ? null : acoesDaNota(n, 'ficha', 'nota-acoes linha')))),
          notas.length ? null : el('span', { class: 'dica', style: 'font-size:12px;color:#4C6355' }, 'Nenhuma nota ainda.'))));
  }


  /* ================================================================
   * Aparência: tema e lugar da barra de navegação
   * ============================================================== */
  const CHAVE_APARENCIA = 'crm_aparencia';
  const aparencia = { tema: 'sistema', barra: 'lateral' };

  function lerAparencia() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_APARENCIA) || '{}');
      if (['claro', 'escuro', 'sistema'].includes(salvo.tema)) aparencia.tema = salvo.tema;
      if (['lateral', 'topo'].includes(salvo.barra)) aparencia.barra = salvo.barra;
    } catch { /* navegador sem armazenamento */ }
  }

  function aplicarAparencia() {
    const escuroDoSistema = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const escuro = aparencia.tema === 'escuro' || (aparencia.tema === 'sistema' && escuroDoSistema);
    document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
    document.querySelector('.shell')?.classList.toggle('barra-topo', aparencia.barra === 'topo');
  }

  function mudarAparencia(mudanca) {
    Object.assign(aparencia, mudanca);
    try { localStorage.setItem(CHAVE_APARENCIA, JSON.stringify(aparencia)); } catch { /* tudo bem */ }
    aplicarAparencia();
    renderConfig();
  }

  lerAparencia();
  aplicarAparencia();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (aparencia.tema === 'sistema') aplicarAparencia();
  });

  /* ================================================================
   * Configurações
   * ============================================================== */
  const config = { aberto: false, secao: 'equipe', dados: null, carregando: false, erro: null, convite: null, formConvite: null };

  const SECOES_CONFIG = [
    { grupo: 'Atendimento' },
    { id: 'equipe', nome: 'Equipe', icone: 'pessoas', soAdmin: true },
    { id: 'canais', nome: 'Canais', icone: 'elo', soAdmin: true },
    { id: 'respostas', nome: 'Respostas rápidas', icone: 'raio' },
    { grupo: 'Preferências' },
    { id: 'aparencia', nome: 'Aparência', icone: 'tela' },
  ];

  function abrirConfiguracoes(secao) {
    config.aberto = true;
    if (secao) config.secao = secao;
    $('#area-config').hidden = false;
    document.querySelector('.area:not(.config)').hidden = true;
    $('#btn-config').classList.add('ativo');
    document.querySelector('.rail-btn[title="Atendimento"]')?.classList.remove('ativo');
    renderConfig();
    if (config.secao === 'equipe') carregarEquipe();
  }

  function fecharConfiguracoes() {
    config.aberto = false;
    $('#area-config').hidden = true;
    document.querySelector('.area:not(.config)').hidden = false;
    $('#btn-config').classList.remove('ativo');
    document.querySelector('.rail-btn[title="Atendimento"]')?.classList.add('ativo');
  }

  function escolherSecao(id) {
    config.secao = id;
    config.convite = null;
    renderConfig();
    if (id === 'equipe') carregarEquipe();
    if (id === 'respostas') carregarRapidas().then(renderConfig).catch((e) => toast(e.message, 5000));
  }

  async function carregarEquipe() {
    config.carregando = true;
    config.erro = null;
    renderConfig();
    try {
      config.dados = await api('/equipe');
    } catch (e) {
      config.erro = e.message;
    } finally {
      config.carregando = false;
      renderConfig();
    }
  }

  function renderConfig() {
    if (!config.aberto) return;
    const admin = estado.resumo?.usuario?.papel === 'admin';

    $('#config-menu').replaceChildren(
      el('h2', {}, 'Configurações'),
      ...SECOES_CONFIG.map((item) => {
        if (item.grupo) return el('span', { class: 'rotulo' }, item.grupo);
        const bloqueado = item.embreve || (item.soAdmin && !admin);
        const botao = el('button', { type: 'button', class: `config-item${config.secao === item.id ? ' ativo' : ''}`, onclick: () => escolherSecao(item.id) },
          icone(item.id, ICONE[item.icone]),
          el('span', { class: 'nome' }, item.nome));
        return bloqueado
          ? desligar(botao, item.embreve ? `${item.nome}: em breve` : 'Só um administrador vê esta parte')
          : botao;
      }));

    const secao = SECOES_CONFIG.find((i) => i.id === config.secao) || SECOES_CONFIG[1];
    const corpo = { equipe: corpoEquipe, canais: corpoCanaisConfig, respostas: corpoRespostasConfig, aparencia: corpoAparencia }[config.secao];
    $('#config-painel').replaceChildren(
      el('div', { class: 'config-topo' },
        el('div', { class: 'titulo' },
          el('h3', {}, secao.nome),
          el('span', { class: 'sub' }, subtituloSecao())),
        el('button', { type: 'button', class: 'btn-branco hov', onclick: fecharConfiguracoes }, 'Voltar ao atendimento')),
      el('div', { class: 'config-corpo' }, ...(corpo ? corpo() : [el('div', { class: 'config-vazio' }, 'Em breve.')])));
  }

  function subtituloSecao() {
    if (config.secao === 'equipe') {
      const d = config.dados;
      if (!d) return 'Carregando…';
      const ativos = d.usuarios.filter((u) => u.ativo).length;
      const convites = d.convites.length;
      return `${ativos} atendente${ativos === 1 ? '' : 's'} ativo${ativos === 1 ? '' : 's'}${convites ? ` · ${convites} convite${convites === 1 ? '' : 's'} pendente${convites === 1 ? '' : 's'}` : ''}`;
    }
    if (config.secao === 'canais') return 'WhatsApp, Telegram e o chat do site.';
    if (config.secao === 'aparencia') return 'Vale só para você, neste navegador.';
    if (config.secao === 'respostas') return 'Mensagens prontas para a equipe usar no chat.';
    return '';
  }

  /* ---------------- Configurações › Equipe ---------------- */
  function corpoEquipe() {
    if (config.carregando && !config.dados) return [el('div', { class: 'config-vazio' }, 'Carregando…')];
    if (config.erro) return [el('div', { class: 'aviso erro' }, config.erro)];
    const d = config.dados;
    if (!d) return [el('div', { class: 'config-vazio' }, 'Nada por aqui.')];

    const partes = [el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, 'Atendentes'),
        el('span', { class: 'dica' }, 'Cada pessoa vê as caixas das equipes em que está.')),
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, ...d.usuarios.map((u) => linhaPessoa(u, d.equipes))))];

    if (d.convites.length) {
      partes.push(el('div', { class: 'config-bloco' },
        el('div', { class: 'cabeca' },
          el('span', { class: 'rotulo' }, 'Convites pendentes'),
          el('span', { class: 'dica' }, 'Ainda não criaram a senha. O link vale sete dias.')),
        el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, ...d.convites.map((c) => linhaConvite(c, d.equipes)))));
    }

    partes.push(formConvite(d.equipes));
    return partes;
  }

  function linhaPessoa(u, equipes) {
    const eu = u.id === estado.resumo?.usuario?.id;
    const presenca = u.ativo ? (u.presenca || 'offline') : 'bloqueado';
    const classePresenca = !u.ativo ? 'aviso' : (u.presenca === 'online' ? '' : 'cinza');
    return el('div', { class: `pessoa${u.ativo ? '' : ' inativa'}` },
      el('span', { class: 'avatar p' }, u.iniciais),
      el('div', { class: 'dados' },
        el('span', { class: 'nome' }, u.nome, eu ? ' (você)' : ''),
        el('span', { class: 'email' }, u.email)),
      el('div', { class: 'equipes' }, ...(u.equipes.length
        ? u.equipes.map((e) => el('span', { class: 'selo-equipe' }, el('span', { class: 'ponto', style: `background:${e.cor}` }), e.nome))
        : [el('span', { class: 'dica' }, 'sem equipe')])),
      el('select', {
        class: 'papel', 'aria-label': `Papel de ${u.nome}`, disabled: eu ? 'disabled' : null,
        onchange: (ev) => salvarPessoa(u.id, { papel: ev.target.value }),
      }, ...['atendente', 'admin'].map((v) => el('option', { value: v, selected: u.papel === v ? 'selected' : null }, v === 'admin' ? 'Administrador' : 'Atendente'))),
      el('span', { class: `selo-presenca ${classePresenca}`.trim() }, presenca),
      el('button', {
        type: 'button', class: 'btn-icone hov', title: u.ativo ? 'Bloquear o acesso' : 'Liberar o acesso',
        disabled: eu ? 'disabled' : null,
        onclick: () => salvarPessoa(u.id, { ativo: !u.ativo }),
      }, svg(u.ativo ? ICONE.cadeado : ICONE.check)),
      el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => editarEquipesDe(u, equipes) }, 'Equipes'));
  }

  function linhaConvite(c, equipes) {
    const nomes = c.equipeIds.map((id) => equipes.find((e) => e.id === id)).filter(Boolean);
    return el('div', { class: 'pessoa' },
      el('span', { class: 'avatar p' }, '@'),
      el('div', { class: 'dados' },
        el('span', { class: 'nome' }, c.email),
        el('span', { class: 'email' }, `convidado por ${c.convidadoPor || 'equipe'} · expira ${horaLista(c.expiraEm)}`)),
      el('div', { class: 'equipes' }, ...nomes.map((e) => el('span', { class: 'selo-equipe' }, el('span', { class: 'ponto', style: `background:${e.cor}` }), e.nome))),
      el('span', { class: 'papel' }, c.papel === 'admin' ? 'Administrador' : 'Atendente'),
      el('span', { class: 'selo-presenca aviso' }, 'convite'),
      el('button', { type: 'button', class: 'btn-suave hov', onclick: () => cancelarConvite(c.id) }, 'Cancelar'));
  }

  function formConvite(equipes) {
    const f = config.formConvite || (config.formConvite = { email: '', papel: 'atendente', equipeIds: [] });
    const campoEmail = el('input', { type: 'email', placeholder: 'nome@empresa.com.br', value: f.email, oninput: () => { f.email = campoEmail.value; } });
    const campoPapel = el('select', { onchange: () => { f.papel = campoPapel.value; } },
      ...['atendente', 'admin'].map((v) => el('option', { value: v, selected: f.papel === v ? 'selected' : null }, v === 'admin' ? 'Administrador' : 'Atendente')));

    return el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, 'Convidar alguém'),
        el('span', { class: 'dica' }, 'A pessoa recebe um link para criar a própria senha.')),
      el('div', { class: 'config-form' },
        el('div', { class: 'config-linha' },
          el('label', { class: 'config-campo' }, el('span', {}, 'E-mail'), campoEmail),
          el('label', { class: 'config-campo', style: 'max-width:200px' }, el('span', {}, 'Papel'), campoPapel)),
        el('div', { class: 'config-campo' },
          el('span', {}, 'Equipes'),
          el('div', { class: 'escolha-equipes' }, ...equipes.map((e) => {
            const marcada = f.equipeIds.includes(e.id);
            return el('button', {
              type: 'button', class: `escolha-equipe${marcada ? ' marcada' : ''}`,
              onclick: () => {
                f.equipeIds = marcada ? f.equipeIds.filter((id) => id !== e.id) : [...f.equipeIds, e.id];
                renderConfig();
              },
            }, el('span', { class: 'ponto', style: `background:${e.cor};width:7px;height:7px;border-radius:50%` }), e.nome);
          }))),
        el('div', { style: 'display:flex;justify-content:flex-end' },
          el('button', { type: 'button', class: 'btn-primario', onclick: () => enviarConvite(f) }, 'Enviar convite')),
        config.convite ? el('div', { class: 'convite-link' },
          el('span', { class: 'dica', style: 'color:inherit;font-weight:700' }, config.convite.porEmail ? 'Convite enviado por e-mail.' : 'Copie e mande o link:'),
          el('code', {}, config.convite.link),
          el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => copiar(config.convite.link) }, 'Copiar')) : null));
  }

  // Copia o PIN e avisa, para o atendente colar onde precisar.
  function copiarPin(valor) {
    const pin = String(valor || '').trim();
    if (!pin) return;
    navigator.clipboard?.writeText(pin)
      .then(() => toast(`PIN ${pin} copiado.`))
      .catch(() => toast('Não consegui copiar. Selecione o número e use Ctrl+C.'));
  }

  function copiar(texto) {
    navigator.clipboard?.writeText(texto).then(() => toast('Link copiado.')).catch(() => toast('Copie o link com Ctrl+C.'));
  }

  async function salvarPessoa(id, mudanca) {
    try {
      await api(`/equipe/usuarios/${id}`, { method: 'PATCH', body: mudanca });
      await carregarEquipe();
      await carregarResumo();
      toast('Pronto.');
    } catch (e) {
      toast(e.message, 5000);
      renderConfig();
    }
  }

  function editarEquipesDe(u, equipes) {
    const atuais = new Set(u.equipes.map((e) => e.id));
    const caixa = el('div', { class: 'escolha-equipes' }, ...equipes.map((e) => {
      const botao = el('button', { type: 'button', class: `escolha-equipe${atuais.has(e.id) ? ' marcada' : ''}` },
        el('span', { class: 'ponto', style: `background:${e.cor};width:7px;height:7px;border-radius:50%` }), e.nome);
      botao.addEventListener('click', () => {
        if (atuais.has(e.id)) atuais.delete(e.id); else atuais.add(e.id);
        botao.classList.toggle('marcada');
      });
      return botao;
    }));
    const fundo = el('div', { class: 'modal-fundo', onclick: (ev) => { if (ev.target === fundo) fundo.remove(); } },
      el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        el('div', { class: 'modal-corpo' },
          el('div', { class: 'modal-cab' },
            el('div', {}, el('h2', {}, `Equipes de ${u.nomeCurto || u.nome}`), el('p', {}, 'A pessoa vê as caixas das equipes marcadas.')),
            el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: () => fundo.remove() }, svg(ICONE.fechar))),
          caixa,
          el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px' },
            el('button', { type: 'button', class: 'btn-suave hov', onclick: () => fundo.remove() }, 'Cancelar'),
            el('button', {
              type: 'button', class: 'btn-primario',
              onclick: () => { fundo.remove(); salvarPessoa(u.id, { equipeIds: [...atuais] }); },
            }, 'Salvar')))));
    document.body.append(fundo);
  }

  async function enviarConvite(f) {
    if (!f.email.trim()) return toast('Digite o e-mail de quem você quer convidar.');
    try {
      config.convite = await api('/equipe/convites', { method: 'POST', body: { email: f.email.trim(), papel: f.papel, equipeIds: f.equipeIds } });
      config.formConvite = { email: '', papel: 'atendente', equipeIds: [] };
      await carregarEquipe();
      toast(config.convite.porEmail ? 'Convite enviado.' : 'Convite criado. Copie o link e mande para a pessoa.', 5000);
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async function cancelarConvite(id) {
    if (!window.confirm('Cancelar este convite? O link para de funcionar.')) return;
    try {
      await api(`/equipe/convites/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await carregarEquipe();
      toast('Convite cancelado.');
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  /* ---------------- Configurações › Aparência ---------------- */
  function cartaoEscolha({ marcado, titulo, texto, onclick, amostra }) {
    return el('button', { type: 'button', class: `escolha-cartao${marcado ? ' marcado' : ''}`, onclick },
      amostra,
      el('div', { class: 'escolha-texto' },
        el('strong', {}, titulo),
        texto ? el('span', {}, texto) : null),
      el('span', { class: `escolha-marca${marcado ? ' ativa' : ''}`, html: marcado ? ICONE.check : '' }));
  }

  function corpoAparencia() {
    const amostraTema = (cores) => el('span', { class: 'amostra-tema', style: `background:${cores[0]}` },
      el('span', { style: `background:${cores[1]}` }), el('span', { style: `background:${cores[2]}` }));
    const amostraBarra = (topo) => el('span', { class: `amostra-barra${topo ? ' topo' : ''}` },
      el('span', { class: 'barra' }), el('span', { class: 'corpo' }));

    return [
      el('div', { class: 'config-bloco' },
        el('div', { class: 'cabeca' },
          el('span', { class: 'rotulo' }, 'Tema'),
          el('span', { class: 'dica' }, 'Fica guardado neste navegador, não muda para a equipe.')),
        el('div', { class: 'escolhas' },
          cartaoEscolha({
            marcado: aparencia.tema === 'claro', titulo: 'Claro', texto: 'O visual de sempre.',
            amostra: amostraTema(['#EFF4F1', '#FFFFFF', '#12B85C']),
            onclick: () => mudarAparencia({ tema: 'claro' }),
          }),
          cartaoEscolha({
            marcado: aparencia.tema === 'escuro', titulo: 'Escuro', texto: 'Melhor de noite e com pouca luz.',
            amostra: amostraTema(['#0B1F14', '#0E2318', '#12B85C']),
            onclick: () => mudarAparencia({ tema: 'escuro' }),
          }),
          cartaoEscolha({
            marcado: aparencia.tema === 'sistema', titulo: 'Seguir o sistema', texto: 'Acompanha o computador.',
            amostra: amostraTema(['#EFF4F1', '#0E2318', '#12B85C']),
            onclick: () => mudarAparencia({ tema: 'sistema' }),
          }))),
      el('div', { class: 'config-bloco' },
        el('div', { class: 'cabeca' },
          el('span', { class: 'rotulo' }, 'Posição da barra de navegação'),
          el('span', { class: 'dica' }, 'Onde ficam os ícones do menu.')),
        el('div', { class: 'escolhas' },
          cartaoEscolha({
            marcado: aparencia.barra === 'lateral', titulo: 'Lateral esquerda',
            texto: 'Barra em pé; sobra mais largura para a conversa.',
            amostra: amostraBarra(false),
            onclick: () => mudarAparencia({ barra: 'lateral' }),
          }),
          cartaoEscolha({
            marcado: aparencia.barra === 'topo', titulo: 'Parte superior',
            texto: 'Barra deitada no topo; o painel ganha altura.',
            amostra: amostraBarra(true),
            onclick: () => mudarAparencia({ barra: 'topo' }),
          }))),
    ];
  }

  /* ---------------- Configurações › Canais e Respostas ---------------- */
  function corpoCanaisConfig() {
    return [el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, 'Canais de mensagem'),
        el('span', { class: 'dica' }, 'WhatsApp e Telegram podem ficar ligados ao mesmo tempo: as conversas chegam na mesma caixa, com o selo do canal no avatar.')),
      el('button', { type: 'button', class: 'btn-primario', style: 'align-self:flex-start', onclick: abrirModalCanais }, 'Abrir os canais'))];
  }

  // Respostas rápidas nas configurações: lista completa, com criar, editar e excluir.
  const confRapidas = { form: null, erro: null };

  function abrirFormConfRapida(r = null) {
    confRapidas.form = r
      ? { id: r.id, atalho: r.atalho, titulo: r.titulo, texto: r.texto, escopo: r.escopo, equipeId: r.equipeId }
      : { id: null, atalho: '', titulo: '', texto: '', escopo: 'todas', equipeId: null };
    confRapidas.erro = null;
    renderConfig();
    document.querySelector('.config-corpo .campo-rapida')?.focus();
  }

  async function salvarConfRapida() {
    const f = confRapidas.form;
    confRapidas.erro = null;
    try {
      const corpo = { atalho: f.atalho, titulo: f.titulo, texto: f.texto, escopo: f.escopo, equipeId: f.equipeId };
      const r = f.id
        ? await api(`/respostas/${f.id}`, { method: 'PATCH', body: corpo })
        : await api('/respostas', { method: 'POST', body: corpo });
      confRapidas.form = null;
      rapidas.lista = r.respostas;
      renderConfig();
      toast(f.id ? 'Resposta rápida atualizada.' : 'Resposta rápida criada.');
    } catch (e) {
      confRapidas.erro = e.message;
      renderConfig();
    }
  }

  async function excluirConfRapida(id) {
    if (!window.confirm('Excluir esta resposta rápida? Ela some para quem podia usar.')) return;
    try {
      const r = await api(`/respostas/${id}`, { method: 'DELETE' });
      confRapidas.form = null;
      rapidas.lista = r.respostas;
      renderConfig();
      toast('Resposta rápida excluída.');
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  function quemVe(r) {
    if (r.escopo === 'eu') return 'só eu';
    if (r.escopo === 'equipe') return `equipe ${r.equipeNome || ''}`.trim();
    return 'todas as equipes';
  }

  function corpoRespostasConfig() {
    const lista = rapidas.lista || [];
    if (confRapidas.form) return [formConfRapida()];

    return [el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, `Atalhos salvos · ${lista.length}`),
        el('span', { class: 'dica' }, 'No chat, digite / ou use o botão do raio para inserir a mensagem pronta.')),
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        ...(lista.length
          ? lista.map((rr) => el('div', { class: 'pessoa' },
            el('span', { class: 'rapida-atalho' }, `/${rr.atalho}`),
            el('div', { class: 'dados' },
              el('span', { class: 'nome' }, rr.titulo),
              el('span', { class: 'email', title: rr.texto }, rr.texto)),
            el('span', { class: 'papel' }, quemVe(rr)),
            el('span', { class: 'selo-presenca cinza' }, rr.usos ? `${rr.usos} uso${rr.usos === 1 ? '' : 's'}` : 'não usada'),
            rr.podeEditar
              ? el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => abrirFormConfRapida(rr) }, 'Editar')
              : el('span', { class: 'dica' }, 'de outra pessoa')))
          : [el('div', { class: 'config-vazio' }, 'Nenhuma resposta rápida criada ainda.')])),
      el('button', { type: 'button', class: 'btn-primario', style: 'align-self:flex-start', onclick: () => abrirFormConfRapida() },
        icone('mais', ICONE.mais, { classe: 'branco' }), 'Nova resposta rápida'))];
  }

  function formConfRapida() {
    const f = confRapidas.form;
    const equipes = estado.resumo?.equipes || [];
    const atalho = el('input', { type: 'text', class: 'campo-rapida atalho', value: f.atalho, placeholder: 'estorno', maxlength: '40', oninput: () => { f.atalho = atalho.value; } });
    const titulo = el('input', { type: 'text', class: 'campo-rapida', value: f.titulo, placeholder: 'Estorno solicitado', maxlength: '120', oninput: () => { f.titulo = titulo.value; } });
    const texto = el('textarea', { class: 'campo-rapida area', rows: '6', maxlength: '4000', placeholder: 'Escreva a mensagem que será enviada ao cliente…', oninput: () => { f.texto = texto.value; } }, f.texto);
    const equipe = el('select', { class: 'campo-rapida', onchange: () => { f.equipeId = Number(equipe.value) || null; } },
      el('option', { value: '' }, 'Escolha a equipe'),
      ...equipes.map((e) => el('option', { value: String(e.id), selected: Number(f.equipeId) === e.id ? true : null }, e.nome)));
    equipe.hidden = f.escopo !== 'equipe';

    const escopo = (valor, rotulo) => el('button', {
      type: 'button', class: `rapida-escopo${f.escopo === valor ? ' ativo' : ''}`,
      onclick: () => { f.escopo = valor; renderConfig(); },
    }, rotulo);

    return el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, f.id ? 'Editar resposta rápida' : 'Nova resposta rápida'),
        el('span', { class: 'dica' }, 'O atalho é o que o atendente digita depois da barra.')),
      confRapidas.erro ? el('div', { class: 'aviso erro' }, confRapidas.erro) : null,
      el('div', { class: 'config-form' },
        el('div', { class: 'config-linha' },
          el('label', { class: 'config-campo', style: 'max-width:240px' }, el('span', {}, 'Atalho'),
            el('div', { class: 'rapida-atalho-campo' }, el('span', { class: 'rapida-barra' }, '/'), atalho)),
          el('label', { class: 'config-campo' }, el('span', {}, 'Título'), titulo)),
        el('label', { class: 'config-campo' }, el('span', {}, 'Mensagem'), texto),
        el('div', { class: 'config-campo' },
          el('span', {}, 'Visível para'),
          el('div', { class: 'escolha-equipes' }, escopo('todas', 'Todas as equipes'), escopo('equipe', 'Uma equipe'), escopo('eu', 'Só eu')),
          equipe),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px' },
          f.id ? el('button', { type: 'button', class: 'btn-suave hov', onclick: () => excluirConfRapida(f.id) }, 'Excluir') : null,
          el('button', { type: 'button', class: 'btn-suave hov', onclick: () => { confRapidas.form = null; confRapidas.erro = null; renderConfig(); } }, 'Cancelar'),
          el('button', { type: 'button', class: 'btn-primario', onclick: salvarConfRapida }, f.id ? 'Salvar alterações' : 'Salvar resposta rápida'))));
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
    document.addEventListener('pointerdown', liberarSom, { passive: true });
    document.addEventListener('keydown', liberarSom);
    let timer = null;
    $('#busca').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        estado.busca = e.target.value.trim();
        carregarConversas({ selecionarPrimeira: true }).catch((err) => toast(err.message));
      }, 250);
    });

    // O que ainda não funciona fica desligado, sem responder ao clique.
    desligar($('#btn-filtros'), 'Filtros avançados: em breve');
    document.querySelectorAll('.rail-btn[data-modulo]').forEach((b) => desligar(b, `${b.dataset.modulo}: em breve`));

    $('#btn-config').addEventListener('click', () => (config.aberto ? fecharConfiguracoes() : abrirConfiguracoes()));
    document.querySelector('.rail-btn[title="Atendimento"]')?.addEventListener('click', fecharConfiguracoes);

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
      if (e.key === 'Escape') { fecharVisor(); fecharRapidas(); menuUsuario.hidden = true; fecharMenus(); $('#painel').classList.remove('aberto'); if (modalCanais) fecharModalCanais(); }
    });
  }

  async function iniciar() {
    montarIcones();
    ligarEventos();
    try {
      await carregarResumo();
      await carregarConversas({ selecionarPrimeira: true });
      alertasAtivos = true;
    } catch (e) {
      toast(e.message);
      $('#chat').replaceChildren(el('div', { class: 'chat-vazio' }, el('strong', {}, 'Não foi possível carregar'), el('span', {}, e.message)));
    }
    // Com o fluxo aberto, a mensagem chega na hora: a checagem periódica vira só
    // uma conferência de vez em quando. Se o fluxo cair, ela volta ao ritmo de
    // antes na mesma hora.
    setInterval(() => {
      const espera = fluxoAvisos?.readyState === 1 ? 30_000 : 8000;
      if (Date.now() - ultimaAtualizacao < espera) return;
      atualizarSilencioso();
    }, 2000);
    ouvirAvisos();
    // Voltou para a aba: mostra o que chegou enquanto ela estava escondida.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizarSilencioso(); });
  }

  // Fluxo aberto com o servidor: a mensagem do cliente aparece na hora, sem
  // esperar os 8 segundos. O aviso não traz conteúdo — ele só diz "olha de
  // novo", e a busca é a de sempre. Se este caminho cair, o navegador reconecta
  // sozinho e a checagem de 8 em 8 segundos continua valendo como rede de
  // segurança.
  function ouvirAvisos() {
    if (!window.EventSource) return;
    let pendente = null;
    const fluxo = new EventSource('/api/eventos');
    fluxoAvisos = fluxo;
    fluxo.onmessage = () => {
      // Várias mensagens seguidas viram uma única atualização.
      clearTimeout(pendente);
      pendente = setTimeout(atualizarSilencioso, 120);
    };
    // O EventSource reconecta sozinho; só registra para não passar em silêncio.
    fluxo.onerror = () => { /* reconecta sozinho */ };
  }

  iniciar();
})();
