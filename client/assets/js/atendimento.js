import { icone, montarIcones } from './icones.js';
import { detectarNovasMensagens } from './alerta-mensagem.mjs';
import { corrigirPalavra, corrigirTexto, ehEnderecoInternet } from './acentos.mjs';
import { capturarCompositor, restaurarCompositor } from './foco-compositor.mjs';
import { deveTocarNotificacao, gravarSomAtivo, lerSomAtivo } from './som-notificacoes.mjs';
import { deveSalvarNota } from './nota-editor.mjs';
import { centavosDoValorFormatado, formatarValorEmCentavos } from './valor-monetario.mjs';
import { estiloAvatarDoCanal } from './cor-avatar.mjs';
import { formatarDataHoraCompra } from './data-compra.mjs';
import { cacheSaldoValido, criarEntradaCacheSaldo } from './cache-saldo.mjs';
import { apresentarDescricaoTransacao } from './descricao-transacao.mjs';
import { textoDaRespostaRapida, expandirAtalhoSaudacao } from './saudacao.mjs';
import { criarAvisosHorario } from './horario-atendimento.mjs';
import { statusNaInbox, chaveDaInbox } from './status-inbox.mjs';

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
    anexoPendente: null,
  };

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const somNovaMensagem = new Audio(new URL('../sons/sound4-soft.mp3', import.meta.url).href);
  somNovaMensagem.preload = 'auto';
  somNovaMensagem.volume = 0.72;
  let somLiberado = false;
  let somNotificacoesAtivo = lerSomAtivo();
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
    menos: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"></path></svg>',
    maisGrande: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    voltar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a5 5 0 010 10H8"></path><path d="M7 4L3 8l4 4"></path></svg>',
    relogioSuave: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7.5V12l3.2 2"></path></svg>',
    desligar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v7"></path><path d="M6.2 7.4a8 8 0 1011.6 0"></path></svg>',
    banir: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M5.6 5.6l12.8 12.8"></path></svg>',
    setaDireita: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg>',
    carrinho: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.6"></circle><circle cx="18" cy="20" r="1.6"></circle><path d="M2 3h3l2.6 12h11L21 7H6"></path></svg>',
    copiar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"></path></svg>',
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
    if (somLiberado || !somNotificacoesAtivo) return;
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
    if (deveTocarNotificacao(resultado.recebeuMensagem, somNotificacoesAtivo)) tocarSomNovaMensagem();
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
    if (resposta.status === 409 && dados.escolherAtendente) {
      location.href = `/escolher-atendente?next=${encodeURIComponent(location.pathname)}`;
      throw new Error('Escolha quem está atendendo.');
    }
    if (!resposta.ok) {
      const erro = new Error(dados.erro || `Erro ${resposta.status}`);
      // Detalhes que a tela usa para decidir o que oferecer (ver ações de saldo).
      erro.status = resposta.status;
      erro.codigo = dados.codigo || null;
      erro.podeRepetir = Boolean(dados.podeRepetir);
      throw erro;
    }
    return dados;
  }

  // Presença real: cada aba aberta envia um sinal próprio. A sessão pode durar
  // 30 dias, mas o atendente só aparece online enquanto esta tela estiver viva.
  const abaPresencaId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function sinalizarPresenca() {
    return api('/presenca', { method: 'POST', body: { abaId: abaPresencaId } });
  }

  function encerrarPresenca() {
    fetch('/api/presenca', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abaId: abaPresencaId }),
      keepalive: true,
    }).catch(() => {});
  }

  /* ================================================================
   * Carregamento de dados
   * ============================================================== */
  const avisosHorario = criarAvisosHorario({ api, recarregar: carregarResumo });
  async function carregarResumo() {
    estado.resumo = await api('/resumo');
    if (!alertasAtivos) observarMensagens(estado.resumo.notificacoes, false);
    renderRail();
    renderSidebar();
    avisosHorario.atualizar(estado.resumo);
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
    if (selecionarPrimeira && aindaExiste && estado.conversa) aplicarConversa(estado.conversa);
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
    const primeiraDaPagina = conversa.mensagens[0] || null;
    const anteriorAPagina = (m) => conversa.temMaisMensagens && primeiraDaPagina && (
      m.criadaEm < primeiraDaPagina.criadaEm
      || (m.criadaEm === primeiraDaPagina.criadaEm && m.id < primeiraDaPagina.id)
    );
    const antigas = atual.mensagens
      .filter((m) => !m.provisoria && !porId.has(m.id) && anteriorAPagina(m))
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
    if (Number(id) !== Number(estado.conversaId) && estado.anexoPendente?.enviando) {
      return toast('Aguarde o arquivo terminar de enviar antes de trocar de conversa.');
    }
    if (Number(id) !== Number(estado.conversaId)) descartarAnexoPendente({ redesenhar: false });
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
    consultarSaldoAutomaticamente(conversa);
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
      observarMensagens(estado.resumo.notificacoes, true);
      estado.conversas = conversas;
      renderLista();
      if (!estado.conversaId) return;
      const { conversa } = await api(`/conversas/${estado.conversaId}`);
      if (estado.conversaId !== conversa.id) return; // trocou de conversa enquanto buscava
      const atual = estado.conversa?.id === conversa.id ? estado.conversa : null;
      const ultimaNova = conversa.mensagens.at(-1)?.id ?? null;
      const ultimaAtual = atual?.mensagens.filter((m) => !m.provisoria).at(-1)?.id ?? null;
      const idsNovos = conversa.mensagens.map((m) => `${m.id}:${m.editadaEm || 0}`).join(',');
      const idsAtuais = atual?.mensagens.filter((m) => !m.provisoria).slice(-conversa.mensagens.length).map((m) => `${m.id}:${m.editadaEm || 0}`).join(',') ?? '';
      const mudou = !atual
        || ultimaNova !== ultimaAtual
        || idsNovos !== idsAtuais
        || conversa.status !== atual.status
        || conversa.statusEquipe !== atual.statusEquipe
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
    const seletorRetorno = tipo === 'nota' && campo?.id === 'texto-nota' ? '#texto-nota' : '#texto-msg';

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
    $(seletorRetorno)?.focus();

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
      const volta = $(seletorRetorno);
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

  let modalConfirmacao = null;

  function confirmarNoSite({ titulo, texto, rotuloConfirmar }) {
    if (modalConfirmacao) modalConfirmacao.encerrar(false);
    return new Promise((resolve) => {
      const focoAnterior = document.activeElement;
      let resolvido = false;
      const tituloId = `confirmacao-${Date.now()}`;
      const encerrar = (confirmado) => {
        if (resolvido) return;
        resolvido = true;
        document.removeEventListener('keydown', aoTeclado);
        fundo.remove();
        modalConfirmacao = null;
        focoAnterior?.focus?.();
        resolve(confirmado);
      };
      const aoTeclado = (e) => { if (e.key === 'Escape') encerrar(false); };
      const fundo = el('div', { class: 'modal-fundo', onclick: (e) => { if (e.target === fundo) encerrar(false); } },
        el('div', { class: 'modal confirmacao', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tituloId },
          el('div', { class: 'modal-corpo' },
            el('div', { class: 'modal-cab' },
              el('span', { class: 'modal-confirmacao-icone', 'aria-hidden': 'true' }, svg(ICONE.lixeira)),
              el('div', {}, el('h2', { id: tituloId }, titulo), el('p', {}, texto)),
              el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', 'aria-label': 'Fechar', onclick: () => encerrar(false) }, svg(ICONE.fechar))),
            el('div', { class: 'modal-acoes' },
              el('button', { type: 'button', class: 'btn-suave hov', id: 'confirmacao-cancelar', onclick: () => encerrar(false) }, 'Cancelar'),
              el('button', { type: 'button', class: 'btn-perigo', id: 'confirmacao-aceitar', onclick: () => encerrar(true) }, rotuloConfirmar)))));
      modalConfirmacao = { encerrar, fundo };
      document.body.append(fundo);
      document.addEventListener('keydown', aoTeclado);
      $('#confirmacao-cancelar')?.focus();
    });
  }

  async function apagarNota(id) {
    const confirmado = await confirmarNoSite({
      titulo: 'Apagar nota?',
      texto: 'Esta nota interna será removida para toda a equipe. Essa ação não pode ser desfeita.',
      rotuloConfirmar: 'Apagar nota',
    });
    if (!confirmado) return;
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

  function podeApagarMensagem(m, conversa = estado.conversa) {
    const usuario = estado.resumo?.usuario;
    const conta = estado.resumo?.conta || usuario;
    return Boolean(conversa?.canal === 'widget'
      && m?.tipo === 'atendente'
      && !m.provisoria
      && usuario
      && (m.autor?.id === usuario.id || conta?.papel === 'admin'));
  }

  async function apagarMensagemEnviada(m) {
    const conversaId = estado.conversa?.id;
    if (!conversaId || !podeApagarMensagem(m)) return;
    const confirmado = await confirmarNoSite({
      titulo: 'Excluir mensagem?',
      texto: 'A mensagem será apagada do CRM e do chat do cliente. Essa ação não pode ser desfeita.',
      rotuloConfirmar: 'Excluir mensagem',
    });
    if (!confirmado) return;
    try {
      await api(`/conversas/${conversaId}/mensagens/${m.id}`, { method: 'DELETE' });
      if (estado.conversa?.id === conversaId) {
        estado.conversa.mensagens = estado.conversa.mensagens.filter((item) => item.id !== m.id);
        aplicarConversa(estado.conversa);
      }
      await Promise.all([carregarResumo(), carregarConversas()]);
      toast('Mensagem excluída do chat do cliente.');
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  /* ------------ editar mensagem já enviada (Telegram e Chat do site) ------------ */
  const CANAIS_COM_EDICAO = ['telegram', 'widget'];
  const edicaoMensagem = { id: null };

  function podeEditarMensagem(m, conversa = estado.conversa) {
    const usuario = estado.resumo?.usuario;
    const conta = estado.resumo?.conta || usuario;
    return Boolean(CANAIS_COM_EDICAO.includes(conversa?.canal)
      && m?.tipo === 'atendente'
      && !m.provisoria
      && !m.midia
      && m.entrega === 'enviada'
      && usuario
      && (m.autor?.id === usuario.id || conta?.papel === 'admin'));
  }

  function editarMensagemEnviada(m) {
    if (!podeEditarMensagem(m)) return;
    edicaoMensagem.id = m.id;
    aplicarConversa(estado.conversa);
    const campo = document.querySelector('.mensagem-edicao textarea');
    if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
  }

  function fecharEdicaoMensagem() {
    edicaoMensagem.id = null;
    aplicarConversa(estado.conversa);
  }

  async function salvarMensagemEditada(m, texto) {
    const limpo = String(texto || '').trim();
    if (!limpo) return toast('Escreva a mensagem antes de salvar.');
    const conversaId = estado.conversa?.id;
    if (!conversaId) return;
    if (limpo === m.texto) return fecharEdicaoMensagem();
    try {
      const r = await api(`/conversas/${conversaId}/mensagens/${m.id}`, { method: 'PATCH', body: { texto: limpo } });
      if (estado.conversa?.id === conversaId) {
        const posicao = estado.conversa.mensagens.findIndex((item) => item.id === m.id);
        if (posicao >= 0) estado.conversa.mensagens[posicao] = r.mensagem;
        edicaoMensagem.id = null;
        aplicarConversa(estado.conversa);
      }
      toast(estado.conversa?.canal === 'telegram' ? 'Mensagem editada no Telegram do cliente.' : 'Mensagem editada no chat do cliente.');
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  // A mensagem vira um campo de texto enquanto está sendo editada.
  function edicaoDaMensagem(m) {
    const campo = el('textarea', { class: 'area', rows: '3', maxlength: '4000', lang: 'pt-BR', spellcheck: 'true' }, m.texto);
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fecharEdicaoMensagem(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarMensagemEditada(m, campo.value); }
    });
    return el('div', { class: 'mensagem-edicao' }, campo,
      el('div', { class: 'rodape' },
        el('button', { type: 'button', class: 'btn-suave hov', onclick: fecharEdicaoMensagem }, 'Cancelar'),
        el('button', { type: 'button', class: 'btn-escuro', onclick: () => salvarMensagemEditada(m, campo.value) }, 'Salvar')));
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

  function imagemDoClipboard(evento) {
    const itens = Array.from(evento.clipboardData?.items || []);
    const item = itens.find((i) => i.kind === 'file' && String(i.type || '').toLowerCase().startsWith('image/'));
    return item?.getAsFile?.() || Array.from(evento.clipboardData?.files || [])
      .find((arquivo) => String(arquivo.type || '').toLowerCase().startsWith('image/')) || null;
  }

  function nomearImagemColada(arquivo) {
    const extensoes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
    const mime = String(arquivo.type || 'image/png').toLowerCase();
    const extensao = extensoes[mime] || 'png';
    return new File([arquivo], `imagem-colada-${Date.now()}.${extensao}`, { type: mime, lastModified: Date.now() });
  }

  function colarNoCompositor(evento, textarea, modoNota) {
    const imagem = modoNota ? null : imagemDoClipboard(evento);
    if (imagem) {
      evento.preventDefault();
      prepararAnexo(nomearImagemColada(imagem));
      return;
    }
    setTimeout(() => {
      if (acentosLigados) textarea.value = corrigirTexto(textarea.value);
      ajustarAltura(textarea);
    }, 0);
  }

  function escolherAnexo() {
    if (!estado.conversa) return;
    if (estado.modo === 'nota') return toast('Volte ao modo de resposta para anexar um arquivo ao cliente.');
    if (!estado.resumo?.anexosAtivos) {
      return toast('Envio de anexos indisponível: peça ao responsável para configurar o armazenamento de arquivos no servidor.', 6000);
    }
    const seletor = el('input', { type: 'file', style: 'display:none', accept: '*/*' });
    seletor.addEventListener('change', () => {
      const arquivo = seletor.files?.[0];
      seletor.remove();
      if (arquivo) prepararAnexo(arquivo);
    });
    document.body.append(seletor);
    seletor.click();
  }

  function descartarAnexoPendente({ redesenhar = true } = {}) {
    const pendente = estado.anexoPendente;
    if (!pendente || pendente.enviando) return false;
    if (pendente.previa) URL.revokeObjectURL(pendente.previa);
    estado.anexoPendente = null;
    if (redesenhar && estado.conversa) aplicarConversa(estado.conversa);
    return true;
  }

  function prepararAnexo(arquivo) {
    const c = estado.conversa;
    if (!c) return;
    if (estado.modo === 'nota') return toast('Volte ao modo de resposta para anexar um arquivo ao cliente.');
    if (!estado.resumo?.anexosAtivos) {
      return toast('Envio de anexos indisponível: peça ao responsável para configurar o armazenamento de arquivos no servidor.', 6000);
    }
    if (estado.enviando) return toast('Aguarde o envio atual terminar antes de enviar outro arquivo.');
    if (!arquivo.size) return toast('O arquivo está vazio. Escolha outro arquivo.', 5000);
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO) return toast('Arquivo muito grande: o limite é 20 MB.', 5000);
    descartarAnexoPendente({ redesenhar: false });
    const tipo = tipoDoArquivo(arquivo);
    const previa = tipo === 'imagem' || tipo === 'video' ? URL.createObjectURL(arquivo) : null;
    estado.anexoPendente = { arquivo, tipo, previa, conversaId: c.id, enviando: false };
    aplicarConversa(c);
    $('#texto-msg')?.focus();
  }

  function anexoPendenteDoCompositor() {
    const p = estado.anexoPendente;
    if (!p || Number(p.conversaId) !== Number(estado.conversa?.id)) return null;
    const visual = p.tipo === 'imagem'
      ? el('img', { src: p.previa, alt: '' })
      : (p.tipo === 'video'
        ? el('video', { src: p.previa, muted: true, preload: 'metadata' })
        : el('span', { class: 'anexo-pendente-icone' }, svg(ICONE.clipe)));
    return el('div', { class: `anexo-pendente${p.enviando ? ' enviando' : ''}` },
      el('div', { class: 'anexo-pendente-visual' },
        visual,
        p.enviando
          ? el('span', { class: 'anexo-pendente-loading', role: 'status', 'aria-label': 'Enviando arquivo' },
            el('span', { class: 'spinner-anexo' }), el('span', {}, 'Enviando'))
          : null,
        el('button', {
          type: 'button', class: 'anexo-pendente-remover', title: 'Remover anexo', 'aria-label': 'Remover anexo',
          disabled: p.enviando, onclick: () => descartarAnexoPendente(),
        }, svg(ICONE.fechar))),
      el('span', { class: 'anexo-pendente-nome', title: p.arquivo.name }, p.arquivo.name));
  }

  // O upload começa somente depois de Enviar/Enter. Enquanto o S3 e o canal
  // confirmam o recebimento, a prévia permanece no compositor com loading.
  async function enviarAnexoPendente(legenda, campo) {
    const c = estado.conversa;
    const pendente = estado.anexoPendente;
    if (!c || !pendente || Number(pendente.conversaId) !== Number(c.id)) return;
    if (estado.enviando || pendente.enviando) return;
    const textoAnterior = String(legenda || '').trim();
    if (textoAnterior.length > 1024) return toast('A legenda do anexo pode ter no máximo 1024 caracteres.', 5000);
    estado.enviando = true;
    pendente.enviando = true;
    if (campo) { campo.value = ''; ajustarAltura(campo); }
    aplicarConversa(c);

    try {
      const resposta = await fetch(`/api/conversas/${c.id}/anexos`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': pendente.arquivo.type || 'application/octet-stream',
          'x-nome-arquivo': encodeURIComponent(pendente.arquivo.name || 'arquivo'),
          ...(textoAnterior ? { 'x-legenda': encodeURIComponent(textoAnterior) } : {}),
        },
        body: pendente.arquivo,
      });
      if (resposta.status === 401) {
        pendente.enviando = false;
        location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const r = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(r.erro || `Erro ${resposta.status}`);
      if (r.erroEnvio) toast(`Não foi possível enviar pelo ${NOME_CANAL[c.canal] || c.canal}: ${r.erroEnvio}`, 5000);
      if (!c.mensagens.some((m) => m.id === r.mensagem.id)) c.mensagens.push(r.mensagem);
      Object.assign(c, { status: r.conversa.status, atendente: r.conversa.atendente, atualizadaEm: r.conversa.atualizadaEm });
      if (estado.anexoPendente === pendente) {
        pendente.enviando = false;
        descartarAnexoPendente({ redesenhar: false });
      }
      if (estado.conversa?.id === c.id) aplicarConversa(c);
      await Promise.all([carregarResumo(), carregarConversas()]).catch(() => {});
    } catch (e) {
      pendente.enviando = false;
      if (estado.conversa?.id === c.id) {
        const textoDuranteEnvio = $('#texto-msg')?.value.trim() || '';
        aplicarConversa(c);
        const novoCampo = $('#texto-msg');
        if (novoCampo) {
          novoCampo.value = [textoAnterior, textoDuranteEnvio].filter(Boolean).join(' ');
          ajustarAltura(novoCampo);
          novoCampo.focus();
        }
      }
      toast(e.message, 5000);
    } finally {
      estado.enviando = false;
    }
  }

  async function atualizarConversa(corpo) {
    const c = estado.conversa;
    if (!c) return null;
    try {
      const r = await api(`/conversas/${c.id}`, { method: 'PATCH', body: corpo });
      Object.assign(c, { atendente: r.conversa.atendente, equipe: r.conversa.equipe, status: r.conversa.status, statusEquipe: r.conversa.statusEquipe });
      if (estado.conversaId === c.id) aplicarConversa(c);
      await Promise.all([carregarResumo(), carregarConversas()]);
      return r.conversa;
    } catch (e) {
      toast(e.message);
      renderChat();
      return null;
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
    const equipeId = estado.equipeId;
    const chave = chaveDaInbox(id, equipeId);
    const campo = equipeId ? 'statusEquipe' : 'status';
    if (encerrandoAgora.has(chave)) return;
    encerrandoAgora.add(chave);
    const conversaAberta = estado.conversa?.id === id ? estado.conversa[campo] : null;
    if (conversaAberta) {
      estado.conversa[campo] = 'resolvida';
      aplicarConversa(estado.conversa);
    }
    renderLista();
    toast(equipeId ? 'Conversa encerrada nesta inbox.' : 'Conversa encerrada na caixa de entrada.');
    try {
      const r = await api(`/conversas/${id}/status`, { method: 'POST', body: { status: 'resolvida', equipeId } });
      if (estado.conversa?.id === id) {
        Object.assign(estado.conversa, { status: r.conversa.status, statusEquipe: r.conversa.statusEquipe });
        aplicarConversa(estado.conversa);
      }
      await Promise.all([carregarResumo(), carregarConversas()]);
    } catch (e) {
      // Não deu: devolve a conversa para a lista, como estava. Sair da lista de
      // "encerrando" vem ANTES de redesenhar, senão o card continua escondido.
      encerrandoAgora.delete(chave);
      if (conversaAberta && estado.conversa?.id === id) {
        estado.conversa[campo] = conversaAberta;
        aplicarConversa(estado.conversa);
      }
      toast(e.message);
      renderLista();
    } finally {
      encerrandoAgora.delete(chave);
    }
  }

  async function mudarStatus(status) {
    const c = estado.conversa;
    if (!c) return;
    try {
      const r = await api(`/conversas/${c.id}/status`, { method: 'POST', body: { status, equipeId: estado.equipeId } });
      Object.assign(c, { status: r.conversa.status, statusEquipe: r.conversa.statusEquipe });
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
    $('#rail-badge').textContent = r.caixas.semResposta;
    $('#rail-badge').hidden = r.caixas.semResposta === 0;
    $('#btn-usuario').textContent = r.usuario.iniciais;
    $('#menu-nome').textContent = r.usuario.nome;
    $('#menu-email').textContent = r.conta?.email || r.usuario.email;
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
        (r.conta || r.usuario).papel === 'admin'
          ? el('button', {
            type: 'button', class: 'btn-mini hov', title: 'Criar inbox da equipe',
            'aria-label': 'Criar inbox da equipe', onclick: abrirCriacaoInbox,
          }, icone('mais', ICONE.mais))
          : null),
      el('div', { class: 'lista-nav' },
        ...r.equipes
          .filter((e) => e.nome.trim().toLocaleLowerCase('pt-BR') !== 'admin')
          .map((e) => {
            const item = navItem({ cor: e.cor, nome: e.nome, cont: e.abertas, ativo: estado.equipeId === e.id, onclick: () => selecionarEquipe(e.id) });
            if ((r.conta || r.usuario).papel !== 'admin') return item;
            // Administrador: lápis ao lado da inbox para trocar nome e cor.
            return el('div', { class: 'nav-linha' }, item,
              el('button', {
                type: 'button', class: 'btn-editar-nome hov', title: `Editar inbox ${e.nome}`,
                'aria-label': `Editar inbox ${e.nome}`, onclick: () => editarInbox(e),
              }, svg(ICONE.lapisPequeno)));
          })),
      el('span', { class: 'separador' }),
      el('span', { class: 'rotulo' }, equipeSel ? `Equipe de ${equipeSel.nome}` : 'Atendentes'),
      el('div', { class: 'membros' },
        ...membros.map((m) => {
          const estaOnline = m.presenca === 'online';
          const fase = m.estadoHorario?.fase;
          const status = estaOnline
            ? (fase === 'pausa' ? `em pausa · volta às ${m.horario.pausaFim}`
              : fase === 'retorno' ? 'aguardando retorno'
                : fase === 'fora' ? 'fora do expediente'
                  : `online · ${m.ativas ? `${m.ativas} ativa${m.ativas === 1 ? '' : 's'}` : 'livre'}`)
            : 'offline';
          return el('div', { class: 'membro hov', title: m.email || '' },
            el('span', { class: 'avatar p' }, m.iniciais),
            el('div', { class: 'membro-info' },
              el('span', { class: 'membro-nome' }, m.nomeCurto),
              el('span', { class: `membro-status ${estaOnline ? 'online' : 'offline'}${estaOnline && ['pausa', 'retorno', 'fora'].includes(fase) ? ' em-pausa' : ''}` }, status)));
        }),
        membros.length ? null : el('div', { class: 'vazio' }, 'Nenhum atendente nesta equipe.')),
      (r.conta || r.usuario).papel === 'admin'
        ? (r.cadastroAtendenteAtivo
          ? el('button', { type: 'button', class: 'btn-tracejado', onclick: adicionarAtendente }, icone('mais', ICONE.mais), equipeSel ? 'Adicionar à equipe' : 'Adicionar atendente')
          : desligar(el('button', { type: 'button', class: 'btn-tracejado' }, icone('mais', ICONE.mais), equipeSel ? 'Adicionar à equipe' : 'Adicionar atendente'), 'Cadastro de atendentes temporariamente bloqueado'))
        : null,
    );
  }

  function abrirCriacaoInbox() {
    if ((estado.resumo?.conta || estado.resumo?.usuario)?.papel !== 'admin') {
      return toast('Só um administrador pode criar inboxes da equipe.');
    }
    const erro = el('span', { class: 'dica erro-texto', 'aria-live': 'polite' });
    const nome = el('input', {
      type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'Ex.: Financeiro',
      'aria-label': 'Nome da nova inbox',
    });
    const cor = el('input', {
      type: 'color', value: '#12B85C', 'aria-label': 'Cor da nova inbox', title: 'Escolher cor da inbox',
    });
    let salvando = false;
    const fundo = el('div', { class: 'modal-fundo' });
    const cancelar = el('button', { type: 'button', class: 'btn-suave hov' }, 'Cancelar');
    const salvar = el('button', { type: 'button', class: 'btn-primario' }, 'Criar inbox');

    function fechar() {
      if (salvando) return;
      document.removeEventListener('keydown', aoTeclado);
      fundo.remove();
    }
    const aoTeclado = (ev) => { if (ev.key === 'Escape') fechar(); };
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    cancelar.addEventListener('click', fechar);

    async function concluir() {
      if (salvando) return;
      const nomeLimpo = nome.value.trim().replace(/\s+/g, ' ');
      if (nomeLimpo.length < 2) {
        erro.textContent = 'Digite um nome com pelo menos 2 caracteres.';
        nome.focus();
        return;
      }
      if (nomeLimpo.toLocaleLowerCase('pt-BR') === 'admin') {
        erro.textContent = 'O nome Admin é reservado pelo sistema.';
        nome.focus();
        return;
      }
      salvando = true;
      salvar.disabled = true;
      cancelar.disabled = true;
      erro.textContent = '';
      try {
        const { equipe } = await api('/equipe/inboxes', { method: 'POST', body: { nome: nomeLimpo, cor: cor.value } });
        document.removeEventListener('keydown', aoTeclado);
        fundo.remove();
        await carregarResumo();
        toast(`Inbox ${equipe.nome} criada.`);
      } catch (e) {
        salvando = false;
        salvar.disabled = false;
        cancelar.disabled = false;
        erro.textContent = e.message;
        nome.focus();
      }
    }

    nome.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); concluir(); }
    });
    salvar.addEventListener('click', concluir);
    fundo.append(el('div', { class: 'modal criar-inbox', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'criar-inbox-titulo' },
      el('div', { class: 'modal-corpo' },
        el('div', { class: 'modal-cab' },
          el('div', {}, el('h2', { id: 'criar-inbox-titulo' }, 'Criar inbox da equipe'), el('p', {}, 'Separe os atendimentos por assunto ou responsabilidade.')),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', 'aria-label': 'Fechar', onclick: fechar }, svg(ICONE.fechar))),
        el('div', { class: 'criar-inbox-campos' },
          el('label', { class: 'config-campo' }, el('span', {}, 'Nome da inbox'), nome),
          el('label', { class: 'config-campo criar-inbox-cor' }, el('span', {}, 'Cor'), cor)),
        erro,
        el('div', { class: 'modal-acoes' }, cancelar, salvar))));
    document.body.append(fundo);
    document.addEventListener('keydown', aoTeclado);
    nome.focus();
  }

  // Troca o nome e a cor de uma inbox da equipe (só administrador).
  function editarInbox(e) {
    if ((estado.resumo?.conta || estado.resumo?.usuario)?.papel !== 'admin') {
      return toast('Só um administrador pode editar inboxes da equipe.');
    }
    const erro = el('span', { class: 'dica erro-texto', 'aria-live': 'polite' });
    const nome = el('input', {
      type: 'text', maxlength: '60', autocomplete: 'off', value: e.nome,
      'aria-label': 'Nome da inbox',
    });
    const cor = el('input', {
      type: 'color', value: e.cor || '#12B85C', 'aria-label': 'Cor da inbox', title: 'Escolher cor da inbox',
    });
    let salvando = false;
    const fundo = el('div', { class: 'modal-fundo' });
    const cancelar = el('button', { type: 'button', class: 'btn-suave hov' }, 'Cancelar');
    const salvar = el('button', { type: 'button', class: 'btn-primario' }, 'Salvar');

    function fechar() {
      if (salvando) return;
      document.removeEventListener('keydown', aoTeclado);
      fundo.remove();
    }
    const aoTeclado = (ev) => { if (ev.key === 'Escape') fechar(); };
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    cancelar.addEventListener('click', fechar);

    async function concluir() {
      if (salvando) return;
      const nomeLimpo = nome.value.trim().replace(/\s+/g, ' ');
      if (nomeLimpo.length < 2) {
        erro.textContent = 'Digite um nome com pelo menos 2 caracteres.';
        nome.focus();
        return;
      }
      if (nomeLimpo.toLocaleLowerCase('pt-BR') === 'admin') {
        erro.textContent = 'O nome Admin é reservado pelo sistema.';
        nome.focus();
        return;
      }
      salvando = true;
      salvar.disabled = true;
      cancelar.disabled = true;
      erro.textContent = '';
      try {
        const { equipe } = await api(`/equipe/inboxes/${e.id}`, { method: 'PATCH', body: { nome: nomeLimpo, cor: cor.value } });
        document.removeEventListener('keydown', aoTeclado);
        fundo.remove();
        await Promise.all([carregarResumo(), carregarConversas()]);
        toast(`Inbox ${equipe.nome} atualizada.`);
      } catch (err) {
        salvando = false;
        salvar.disabled = false;
        cancelar.disabled = false;
        erro.textContent = err.message;
        nome.focus();
      }
    }

    nome.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); concluir(); }
    });
    salvar.addEventListener('click', concluir);
    fundo.append(el('div', { class: 'modal criar-inbox editar-inbox', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'editar-inbox-titulo' },
      el('div', { class: 'modal-corpo' },
        el('div', { class: 'modal-cab' },
          el('div', {}, el('h2', { id: 'editar-inbox-titulo' }, 'Editar inbox da equipe'), el('p', {}, 'O novo nome aparece para toda a equipe e nas conversas já atribuídas.')),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', 'aria-label': 'Fechar', onclick: fechar }, svg(ICONE.fechar))),
        el('div', { class: 'criar-inbox-campos' },
          el('label', { class: 'config-campo' }, el('span', {}, 'Nome da inbox'), nome),
          el('label', { class: 'config-campo criar-inbox-cor' }, el('span', {}, 'Cor'), cor)),
        erro,
        el('div', { class: 'modal-acoes' }, cancelar, salvar))));
    document.body.append(fundo);
    document.addEventListener('keydown', aoTeclado);
    nome.focus();
    nome.setSelectionRange(nome.value.length, nome.value.length);
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

  function itemConversa(original) {
    const status = statusNaInbox(original, estado.equipeId);
    const c = { ...original, status, semResposta: original.semResposta && status === 'aberta' };
    const ativa = c.id === estado.conversaId;
    const semRespostaAtrasada = c.semResposta && Number(c.semRespostaMin) > 5;
    const corAvatar = ativa ? 'verde' : (c.canal === 'telegram' ? 'azul' : 'cinza');
    const corCanal = COR_CANAL[c.canal] || COR_CANAL.whatsapp;

    let tag = null;
    if (c.status === 'resolvida') tag = ['Resolvida', ''];
    else if (c.semResposta) tag = [`Sem resposta ${minutosTexto(c.semRespostaMin)}`, 'vermelho'];
    else if (c.contato.empresa && c.contato.empresa !== c.contato.nome) tag = [c.contato.empresa, 'verde'];

    const previa = c.ultimaTipo === 'atendente' && c.ultimaAutor
      ? `${c.ultimaAutor.split(' ')[0]}: ${c.ultimaTexto}`
      : (c.ultimaTexto || 'Sem mensagens');
    const linhaPrevia = c.semResposta && tag
      ? el('span', { class: 'conversa-previa-linha' },
        el('span', { class: 'conversa-previa' }, previa),
        el('span', { class: 'conversa-reticencias', 'aria-hidden': 'true' }, '...'),
        el('span', { class: 'sem-resposta-texto' }, tag[0]))
      : [
        el('span', { class: 'conversa-previa' }, previa),
        tag ? el('span', { class: `tag ${tag[1]}`.trim() }, tag[0]) : null,
      ];

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
      class: `conversa${ativa ? ' ativa' : ''}${semRespostaAtrasada ? ' sem-resposta-atrasada' : ''}`, role: 'button', tabindex: '0',
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
        linhaPrevia),
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
      ? estado.conversas.filter((c) => !encerrandoAgora.has(chaveDaInbox(c.id, estado.equipeId)))
      : estado.conversas;
    const abertas = lista.filter((c) => statusNaInbox(c, estado.equipeId) === 'aberta').length;
    const sem = lista.filter((c) => c.semResposta && statusNaInbox(c, estado.equipeId) === 'aberta').length;
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

  // ===== Ilustrações das caixas vazias (turno 40) =====
  //
  // Três desenhos no mesmo molde: cartão arredondado de 200px com lavagem
  // verde, traço de 2px e no máximo três tons. Cada um vai onde significa
  // alguma coisa, e não como enfeite trocado:
  //
  //   bandeja  a caixa de entrada sem nada empilhado  -> caixa vazia
  //   cartas   a conversa antiga atrás, a resolvida à frente com o check
  //            -> tudo respondido
  //   balao    o próprio ícone do chat com o check dentro -> a área do chat
  //
  // Os gradientes do desenho original foram tirados: nenhum era usado, e ids
  // repetidos brigariam se dois desenhos aparecessem na mesma tela.
  const FUNDO_ILUSTRA = '<path d="M100 18h0c30 0 45 0 56 11s11 26 11 56v10c0 30 0 45-11 56s-26 11-56 11h0c-30 0-45 0-56-11s-11-26-11-56v-10c0-30 0-45 11-56s26-11 56-11z" fill="#F1FBF6"/>';

  const ILUSTRACAO = {
    cartas: `<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">${FUNDO_ILUSTRA}
      <rect x="54" y="62" width="62" height="52" rx="10" fill="#FFFFFF" stroke="#C9D4CD" stroke-width="1.6" stroke-dasharray="4 4" transform="rotate(-8 85 88)"/>
      <g transform="rotate(-8 85 88)" stroke="#C9D4CD" stroke-width="4" stroke-linecap="round"><path d="M66 78h34"/><path d="M66 88h26"/><path d="M66 98h20"/></g>
      <rect x="88" y="66" width="62" height="54" rx="11" fill="#DFF6EA" stroke="#12B85C" stroke-width="2" transform="rotate(6 119 93)"/>
      <g transform="rotate(6 119 93)" stroke-linecap="round"><path d="M100 80h36" stroke="#0A7A42" stroke-width="4.4"/><path d="M100 92h24" stroke="#7EE2A8" stroke-width="4.4"/><path d="M100 104h32" stroke="#0A7A42" stroke-width="4.4"/></g>
      <circle cx="100" cy="136" r="21" fill="#12B85C"/>
      <path d="M91 136l6 6 12-13" stroke="#FFFFFF" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

    bandeja: `<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">${FUNDO_ILUSTRA}
      <path d="M58 96h20l7 12h30l7-12h20v34a8 8 0 01-8 8H66a8 8 0 01-8-8V96z" fill="#FFFFFF" stroke="#0A7A42" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M66 96l10-30h48l10 30" stroke="#C9D4CD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <g stroke="#7EE2A8" stroke-width="4" stroke-linecap="round"><path d="M84 78h32"/><path d="M90 66h20"/></g>
      <circle cx="132" cy="128" r="16" fill="#12B85C"/>
      <path d="M125 128l5 5 9-10" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

    balao: `<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">${FUNDO_ILUSTRA}
      <path d="M100 56c25 0 44 17 44 38 0 21-19 38-44 38-6 0-12-1-17-3l-21 9 6-19c-7-7-12-16-12-25 0-21 19-38 44-38z" fill="#FFFFFF" stroke="#0A7A42" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M84 95l11 11 22-24" stroke="#12B85C" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <g stroke="#7EE2A8" stroke-width="4" stroke-linecap="round" opacity=".9"><path d="M150 62l8-6"/><path d="M154 78h10"/><path d="M146 46l3-9"/></g></svg>`,
  };

  function ilustracao(nome, classe = 'ilustra-vazio') {
    return el('span', { class: classe, html: ILUSTRACAO[nome] || '' });
  }

  // Texto e ação do estado vazio da lista, conforme a caixa escolhida.
  function descricaoVazia() {
    const verTodas = { acao: 'Ver todas as caixas', aoClicar: () => selecionarCaixa('todas') };
    // Busca sem resultado não é caixa vazia: continua com a lupa, senão o
    // desenho de "tudo respondido" apareceria para quem só digitou errado.
    if (estado.busca) return { titulo: 'Nada encontrado', texto: `Nenhuma conversa encontrada para "${estado.busca}".`, acao: 'Limpar busca', aoClicar: limparBusca, lupa: true };
    if (estado.equipeId) return { titulo: 'Caixa vazia', texto: `Nenhuma conversa aberta na equipe ${nomeCaixa()}.`, desenho: 'bandeja', ...verTodas };
    if (estado.caixa === 'minhas') return { titulo: 'Caixa vazia', texto: 'Nenhuma conversa atribuída a você no momento.', desenho: 'bandeja', ...verTodas };
    if (estado.caixa === 'sem_resposta') return { titulo: 'Tudo respondido', texto: 'Nenhum cliente aguardando resposta.', desenho: 'cartas', ...verTodas };
    if (estado.caixa === 'encerradas') return { titulo: 'Nada encerrado', texto: 'Nenhuma conversa foi encerrada nos últimos dias.', desenho: 'bandeja', ...verTodas };
    return { titulo: 'Nenhuma conversa aberta', texto: '', acao: null, desenho: 'bandeja' };
  }

  function listaVazia() {
    const d = descricaoVazia();
    return el('div', { class: 'lista-vazia' },
      d.lupa
        ? el('span', { class: 'lista-vazia-icone' }, icone('buscar', ICONE.busca))
        : ilustracao(d.desenho, 'ilustra-vazio pequena'),
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
          sem_resposta: 'Nenhum cliente está aguardando resposta.',
          encerradas: 'Nenhuma conversa encerrada por aqui.',
        }[estado.caixa] || 'Nenhuma conversa aberta no momento.');
    } else {
      titulo = 'Nenhuma conversa selecionada';
      texto = el('span', {}, 'Escolha uma conversa na lista ao lado para começar o atendimento.');
    }
    // Com a lista vazia, o desenho grande é o balão com o check. Quando há
    // conversas e só falta escolher uma, fica o ícone pequeno de sempre: ali a
    // tela não está limpa, está esperando um clique.
    const semNada = !estado.conversas.length;
    return el('div', { class: 'chat-vazio' },
      semNada
        ? ilustracao(estado.busca ? 'cartas' : 'balao')
        : el('span', { class: 'chat-vazio-icone' }, icone('atendimento', ICONE.balao)),
      el('div', { class: 'chat-vazio-texto' }, el('strong', {}, titulo), texto));
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
      const textoResposta = textoDaRespostaRapida(r);
      // Se a pessoa digitou "/algo", troca isso pela resposta inteira.
      const semAtalho = campo.value.replace(/(^|\s)\/[^\s]*$/, '$1');
      campo.value = semAtalho ? `${semAtalho.replace(/\s+$/, '')} ${textoResposta}` : textoResposta;
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
    return lista.filter((r) => [r.atalho, r.titulo, textoDaRespostaRapida(r)].some((v) => String(v).toLowerCase().includes(busca)));
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
      el('span', { class: 'rapida-texto' }, textoDaRespostaRapida(r)),
      el('span', { class: 'rapida-meta' }, [
        r.usos ? `usada ${r.usos}×` : 'ainda não usada',
        r.dinamica ? 'automática por horário' : (r.escopo === 'equipe' ? `equipe ${r.equipeNome || ''}`.trim() : (r.escopo === 'eu' ? 'só eu' : 'todas as equipes')),
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
      oninput: (e) => {
        // "//" com o painel aberto pela barra: a segunda barra chega aqui, não no
        // campo de escrever (que está coberto). Insere a Saudação lá e fecha.
        if (rapidas.origem === 'barra' && busca.value === '/' && e.inputType === 'insertText' && inserirSaudacaoPelaBusca()) return;
        // O painel é redesenhado a cada letra: o cursor volta para onde estava.
        const posicao = busca.selectionStart;
        rapidas.busca = busca.value;
        desenharRapidas();
        const novo = $('#painel-rapidas .rapida-busca');
        if (novo) { novo.focus(); novo.setSelectionRange(posicao, posicao); }
      },
      // Enter escolhe a primeira resposta da lista filtrada, como no campo de escrever.
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const escolhidas = filtrarRapidas();
        if (escolhidas.length) usarResposta(escolhidas[0]);
      },
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
      el('div', { class: 'rapidas-topo' },
        el('span', { class: 'rapidas-icone' }, icone('raio', ICONE.raio)),
        el('div', { class: 'rapidas-titulo' },
          el('strong', {}, f ? (f.id ? 'Editar resposta rápida' : 'Nova resposta rápida') : 'Respostas rápidas'),
          el('span', {}, f ? 'O atalho fica disponível para quem você escolher.'
            : `${(rapidas.lista || []).length} atalho${(rapidas.lista || []).length === 1 ? '' : 's'} salvo${(rapidas.lista || []).length === 1 ? '' : 's'}`)),
        el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: fecharRapidas }, svg(ICONE.fechar))),
      f ? null : el('div', { class: 'rapidas-busca' }, busca),
      corpo,
      rodape);

    // Cobre o card da conversa inteiro, inclusive o campo de escrever, tenha uma
    // resposta salva ou vinte.
    const chat = $('#chat');
    // Redesenho com a busca em foco (a lista acabou de chegar, por exemplo): o
    // foco e o cursor continuam onde estavam.
    const ativo = document.activeElement;
    const buscaTinhaFoco = Boolean(antigo && ativo && antigo.contains(ativo) && ativo.classList.contains('rapida-busca'));
    const posicaoAntiga = buscaTinhaFoco ? ativo.selectionStart : null;
    if (antigo) antigo.replaceWith(painel); else (chat || document.body).append(painel);
    // O campo de escrever fica coberto: quem digitou "/" continua digitando na
    // busca do painel, já com o que escreveu depois da barra.
    if (!f && !antigo) { busca.focus(); busca.setSelectionRange(busca.value.length, busca.value.length); }
    else if (!f && buscaTinhaFoco) { busca.focus(); busca.setSelectionRange(posicaoAntiga ?? busca.value.length, posicaoAntiga ?? busca.value.length); }
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

  /* ---------------- correção automática: acentos e abreviações ---------------- */
  const CHAVE_ACENTOS = 'crm_acentos';
  let acentosLigados = true;
  try { acentosLigados = localStorage.getItem(CHAVE_ACENTOS) !== 'off'; } catch { /* navegador sem armazenamento */ }

  function alternarAcentos() {
    acentosLigados = !acentosLigados;
    try { localStorage.setItem(CHAVE_ACENTOS, acentosLigados ? 'on' : 'off'); } catch { /* tudo bem */ }
    toast(acentosLigados ? 'Correção automática ligada.' : 'Correção automática desligada.');
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
    const m = /(\p{L}+)([\s.,;:!?)\]}"'…])$/u.exec(antes);
    if (!m) return;
    const trechoAtual = antes.slice(0, -m[2].length).split(/\s/u).at(-1) || '';
    if (ehEnderecoInternet(trechoAtual)) return;
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
    const midia = el('div', { class: `balao midia ${a.tipo}` }, conteudo);
    if (!legenda) return midia;
    return el('div', { class: 'midia-com-legenda' },
      midia,
      el('div', { class: 'balao midia-legenda-balao' }, legenda));
  }

  // A segunda barra insere a saudação imediatamente, sem aguardar a lista
  // de respostas rápidas, sem enviar e sem alterar texto que foi colado.
  function inserirSaudacaoAoDigitar(evento, campo) {
    if (estado.modo !== 'resposta' || evento.isComposing
        || evento.inputType !== 'insertText' || !/^\/{1,2}$/.test(evento.data || '')) return false;
    const expansao = expandirAtalhoSaudacao(campo.value, campo.selectionStart, campo.selectionEnd);
    if (!expansao) return false;
    campo.value = expansao.texto;
    campo.setSelectionRange(expansao.cursor, expansao.cursor);
    ajustarAltura(campo);
    fecharRapidas();
    return true;
  }

  // A segunda barra do "//" foi digitada na busca do painel: completa o atalho
  // no campo de escrever (que já tem a primeira barra) e insere a Saudação.
  function inserirSaudacaoPelaBusca() {
    const campo = $('#texto-msg');
    if (!campo || estado.modo !== 'resposta') return false;
    const inicio = campo.selectionStart ?? campo.value.length;
    const texto = `${campo.value.slice(0, inicio)}/${campo.value.slice(inicio)}`;
    const expansao = expandirAtalhoSaudacao(texto, inicio + 1, inicio + 1);
    if (!expansao) return false;
    campo.value = expansao.texto;
    campo.setSelectionRange(expansao.cursor, expansao.cursor);
    ajustarAltura(campo);
    fecharRapidas();
    return true;
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
        const autor = m.autor?.nomeCurto || 'pelo celular';
        const entrega = m.entrega === 'falhou'
          ? el('span', { class: 'msg-entrega-falhou' }, 'não enviada')
          : (m.entrega === 'enviando' ? 'enviando…' : m.entrega);
        nos.push(el('div', { class: `msg saida${edicaoMensagem.id === m.id ? ' editando' : ''}` },
          edicaoMensagem.id === m.id ? edicaoDaMensagem(m) : el('div', { class: 'mensagem-linha' },
            podeEditarMensagem(m, c)
              ? el('button', {
                type: 'button', class: 'btn-editar-mensagem hov', title: 'Editar mensagem', 'aria-label': 'Editar mensagem',
                onclick: () => editarMensagemEnviada(m),
              }, svg(ICONE.lapisPequeno))
              : null,
            podeApagarMensagem(m, c)
              ? el('button', {
                type: 'button', class: 'btn-excluir-mensagem hov', title: 'Excluir mensagem', 'aria-label': 'Excluir mensagem',
                onclick: () => apagarMensagemEnviada(m),
              }, svg(ICONE.lixeira))
              : null,
            balaoMensagem(m)),
          el('span', { class: `msg-meta${m.provisoria ? ' enviando' : ''}` },
            `${horaCurta(m.criadaEm)} · ${autor}${m.editadaEm ? ' · editada' : ''}`,
            entrega ? ' · ' : null,
            entrega)));
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
    $('#btn-filtros')?.setAttribute('aria-expanded', 'false');
  }

  function alternarSomNotificacoes(botao) {
    somNotificacoesAtivo = gravarSomAtivo(!somNotificacoesAtivo);
    if (somNotificacoesAtivo) liberarSom();
    else {
      somNovaMensagem.pause();
      somNovaMensagem.currentTime = 0;
    }
    botao.setAttribute('aria-checked', somNotificacoesAtivo ? 'true' : 'false');
    botao.querySelector('.som-status').textContent = somNotificacoesAtivo ? 'Ligado' : 'Mudo';
    botao.querySelector('.interruptor').classList.toggle('ativo', somNotificacoesAtivo);
    toast(somNotificacoesAtivo ? 'Som das notificações ligado.' : 'Som das notificações silenciado.');
  }

  function abrirMenuNotificacoes(evento) {
    evento.stopPropagation();
    const botaoMenu = evento.currentTarget;
    if (botaoMenu.getAttribute('aria-expanded') === 'true') return fecharMenus();
    fecharMenus();
    botaoMenu.setAttribute('aria-expanded', 'true');
    const botaoSom = el('button', {
      type: 'button', class: 'menu-notificacao-item', role: 'menuitemcheckbox',
      'aria-checked': somNotificacoesAtivo ? 'true' : 'false',
      onclick: (e) => { e.stopPropagation(); alternarSomNotificacoes(e.currentTarget); },
    },
    el('span', { class: 'menu-notificacao-texto' },
      el('strong', {}, 'Som das notificações'),
      el('span', { class: 'som-status' }, somNotificacoesAtivo ? 'Ligado' : 'Mudo')),
    el('span', { class: `interruptor${somNotificacoesAtivo ? ' ativo' : ''}`, 'aria-hidden': 'true' },
      el('span', { class: 'interruptor-botao' })));
    botaoMenu.parentElement.append(el('div', { class: 'menu-flutuante menu-notificacoes', role: 'menu' }, botaoSom));
  }

  function abrirAtribuicaoEquipe() {
    fecharMenus();
    const conversa = estado.conversa;
    const equipes = (estado.resumo?.equipes || [])
      .filter((e) => e.nome.trim().toLocaleLowerCase('pt-BR') !== 'admin');
    if (!conversa || !equipes.length) return toast('Nenhuma inbox da equipe está disponível.');

    const focoAnterior = document.activeElement;
    const tituloId = `atribuir-inbox-${Date.now()}`;
    let salvando = false;
    const encerrar = () => {
      if (salvando) return;
      document.removeEventListener('keydown', aoTeclado);
      fundo.remove();
      focoAnterior?.focus?.();
    };
    const aoTeclado = (e) => { if (e.key === 'Escape') encerrar(); };

    const opcoes = equipes.map((equipe) => {
      const atual = Number(conversa.equipe?.id) === Number(equipe.id) && conversa.statusEquipe === 'aberta';
      const botao = el('button', {
        type: 'button',
        class: `atribuir-inbox-opcao${atual ? ' atual' : ''}`,
        disabled: atual ? 'disabled' : null,
        'aria-label': atual ? `${equipe.nome}, inbox atual` : `Atribuir a ${equipe.nome}`,
        onclick: async () => {
          if (salvando) return;
          salvando = true;
          fundo.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          const atualizada = await atualizarConversa({ equipeId: equipe.id });
          salvando = false;
          if (!atualizada) {
            fundo.querySelectorAll('button').forEach((b) => { b.disabled = b.classList.contains('atual'); });
            return;
          }
          encerrar();
          toast(`${conversa.contato.nome} foi para a inbox ${equipe.nome}.`);
        },
      },
      el('span', { class: 'atribuir-inbox-cor', style: `background:${equipe.cor}` }),
      el('span', { class: 'atribuir-inbox-texto' },
        el('strong', {}, equipe.nome),
        el('span', {}, atual ? 'Inbox atual' : `${equipe.abertas} conversa${equipe.abertas === 1 ? '' : 's'}`)),
      atual ? el('span', { class: 'atribuir-inbox-atual' }, 'Atual') : null);
      return botao;
    });

    const temInboxAtual = equipes.some((e) => Number(e.id) === Number(conversa.equipe?.id));
    const retirar = temInboxAtual ? el('button', {
      type: 'button', class: 'btn-suave hov', id: 'retirar-inbox',
      title: 'Devolver esta conversa para Todas as conversas',
      onclick: async () => {
        if (salvando) return;
        salvando = true;
        fundo.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        retirar.textContent = 'Retirando…';
        const atualizada = await atualizarConversa({ equipeId: null });
        salvando = false;
        if (!atualizada) {
          fundo.querySelectorAll('button').forEach((b) => { b.disabled = b.classList.contains('atual'); });
          retirar.textContent = 'Retirar da inbox';
          retirar.focus();
          return;
        }
        encerrar();
        toast('Conversa devolvida para Todas as conversas.');
      },
    }, 'Retirar da inbox') : null;

    const fundo = el('div', { class: 'modal-fundo', onclick: (e) => { if (e.target === fundo) encerrar(); } },
      el('div', { class: 'modal atribuir-inbox', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tituloId },
        el('div', { class: 'modal-corpo' },
          el('div', { class: 'modal-cab' },
            el('div', {},
              el('h2', { id: tituloId }, 'Atribuir aos canais existentes'),
              el('p', {}, temInboxAtual
                ? 'Escolha outra inbox ou retire a conversa para voltar a Todas as conversas.'
                : `Escolha em qual inbox da equipe ${conversa.contato.nome} deve aparecer.`)),
            el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', 'aria-label': 'Fechar', onclick: encerrar }, svg(ICONE.fechar))),
          el('div', { class: 'atribuir-inbox-lista' }, ...opcoes),
          el('div', { class: 'modal-acoes' },
            retirar,
            el('button', { type: 'button', class: 'btn-suave hov', onclick: encerrar }, 'Cancelar')))));
    document.body.append(fundo);
    document.addEventListener('keydown', aoTeclado);
    fundo.querySelector('.atribuir-inbox-opcao:not(:disabled), .btn-suave')?.focus();
  }

  function abrirMenuAcoes(botao) {
    if ($('.menu-flutuante')) return fecharMenus();
    const c = estado.conversa;
    const temInbox = Boolean(c?.equipe?.id)
      && String(c.equipe.nome || '').trim().toLocaleLowerCase('pt-BR') !== 'admin';
    const menu = el('div', { class: 'menu-flutuante' },
      statusNaInbox(c, estado.equipeId) === 'resolvida'
        ? el('button', { type: 'button', onclick: () => { fecharMenus(); mudarStatus('aberta'); } }, 'Reabrir conversa')
        : null,
      el('button', { type: 'button', onclick: () => { fecharMenus(); atualizarConversa({ atendenteId: estado.resumo.usuario.id }); } }, 'Assumir esta conversa'),
      el('button', { type: 'button', onclick: abrirAtribuicaoEquipe }, 'Atribuir aos canais existentes'),
      temInbox ? el('button', {
        type: 'button', id: 'menu-retirar-inbox',
        title: 'Devolver para Todas as conversas',
        onclick: async (evento) => {
          const item = evento.currentTarget;
          if (item.disabled) return;
          item.disabled = true;
          item.textContent = 'Retirando…';
          const atualizada = await atualizarConversa({ equipeId: null });
          if (atualizada) {
            fecharMenus();
            toast('Conversa devolvida para Todas as conversas.');
          } else {
            item.disabled = false;
            item.textContent = 'Retirar da inbox';
          }
        },
      }, 'Retirar da inbox') : null);
    botao.parentElement.append(menu);
  }

  function renderChat() {
    const chat = $('#chat');
    const c = estado.conversa;
    if (!c) {
      descartarAnexoPendente({ redesenhar: false });
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
          el('span', { class: 'chat-sub' }, [c.contato.empresa, textoAberto(c.criadaEm, statusNaInbox(c, estado.equipeId))].filter(Boolean).join(' · '))),
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
      oninput: (e) => {
        if (inserirSaudacaoAoDigitar(e, textarea)) return;
        maiuscularInicio(textarea); corrigirEnquantoDigita(textarea); ajustarAltura(textarea); atalhoBarra(textarea);
      },
      onpaste: (e) => colarNoCompositor(e, textarea, modoNota),
    });
    const enviar = () => {
      const texto = acentosLigados ? corrigirTexto(textarea.value) : textarea.value;
      if (!modoNota && estado.anexoPendente) return enviarAnexoPendente(texto, textarea);
      return enviarMensagem(texto, modoNota ? 'nota' : 'resposta', textarea);
    };

    const compositor = el('div', { class: 'compositor' },
      el('div', { class: `caixa-texto${modoNota ? ' modo-nota' : ''}` },
        modoNota ? null : anexoPendenteDoCompositor(),
        textarea,
        el('div', { class: 'compositor-acoes' },
          comDica(el('button', { type: 'button', class: 'btn-icone hov', onclick: escolherAnexo }, icone('anexo', ICONE.clipe)),
            'anexo', 'Anexar arquivo ou colar imagem com Ctrl+V'),
          comDica(el('button', {
            type: 'button', class: `btn-icone hov${rapidas.aberto ? ' ativo' : ''}`,
            onclick: () => (rapidas.aberto ? fecharRapidas() : abrirRapidas()),
          }, icone('raio', ICONE.raio)), 'rapidas', 'Respostas rápidas'),
          comDica(el('button', {
            type: 'button', class: `btn-icone hov acentos-toggle${acentosLigados ? ' ativo' : ''}`,
            'aria-pressed': acentosLigados ? 'true' : 'false',
            onclick: alternarAcentos,
          }, 'Á'), 'acentos', acentosLigados ? 'Correção automática ligada (acentos e abreviações)' : 'Correção automática desligada'),
          comDica(el('button', {
            type: 'button', class: `btn-icone hov nota-toggle${modoNota ? ' ativo' : ''}`,
            'aria-pressed': modoNota ? 'true' : 'false',
            onclick: () => {
              if (!modoNota && estado.anexoPendente) return toast('Envie ou remova o anexo antes de criar uma nota interna.');
              mudarModo(modoNota ? 'resposta' : 'nota');
            },
          }, icone('nota', ICONE.lapis)), 'nota', modoNota ? 'Voltar a responder o cliente' : 'Nota interna'),
          modoNota ? el('span', { class: 'aviso-nota' }, 'Nota interna: só a equipe vê') : null,
          el('span', { class: 'empurrar' }),
          el('button', { type: 'button', class: 'btn-primario', id: 'btn-enviar', disabled: estado.enviando, onclick: enviar }, modoNota ? 'Salvar nota' : 'Enviar', modoNota ? null : icone('enviar', ICONE.enviar, { animado: true, classe: 'branco' })))));

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
    const avatar = el('span', { class: classe, style: estiloAvatarDoCanal(c) }, dentro);
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
  const saldo = { conversaId: null, pin: '', carregando: false, carregandoPin: false, cliente: null, erro: null, em: 0 };
  const cacheSaldos = new Map();
  const pinsWhatsappEmEdicao = new Set();
  let sequenciaConsultaSaldo = 0;

  function limparSaldo(conversaId) {
    Object.assign(saldo, { conversaId, pin: '', carregando: false, carregandoPin: false, cliente: null, erro: null, em: 0 });
  }

  function alterarPinDoWhatsapp(c) {
    if (c?.canal !== 'whatsapp') return;
    pinsWhatsappEmEdicao.add(c.id);
    cacheSaldos.delete(c.id);
    limparSaldo(c.id);
    ficha.compras.conversaId = null;
    ficha.transacoes.conversaId = null;
    ficha.aba = 'resumo';
    renderPainel();
    document.querySelector('.pin-digito')?.focus();
  }

  function guardarSaldoNoCache(c, { pin, cliente = null, contato = null, erro = null, em = Date.now() }) {
    cacheSaldos.set(c.id, criarEntradaCacheSaldo({ conversaId: c.id, pin, cliente, contato, erro, em }));
  }

  function restaurarSaldoDoCache(c, pin) {
    const entrada = cacheSaldos.get(c.id);
    if (!cacheSaldoValido(entrada, { conversaId: c.id, pin })) {
      if (entrada) cacheSaldos.delete(c.id);
      return false;
    }
    Object.assign(saldo, {
      conversaId: c.id, pin: entrada.pin, carregando: false, carregandoPin: false,
      cliente: entrada.cliente, erro: entrada.erro, em: entrada.em,
    });
    if (entrada.contato) c.contato = { ...c.contato, ...entrada.contato };
    return true;
  }

  async function consultarSaldo(pinDigitado, { forcar = true } = {}) {
    const c = estado.conversa;
    if (!c || (saldo.carregando && saldo.conversaId === c.id)) return;
    const pin = String(pinDigitado || '').replace(/\D/g, '');
    if (!pin) return toast('Digite o PIN do cliente nos quadradinhos para consultar o saldo.');
    if (c.canal === 'whatsapp' && (pin.length > 5 || Number(pin) < 1 || Number(pin) > 99999)) {
      return toast('Digite um PIN entre 1 e 99999.');
    }
    if (!forcar && restaurarSaldoDoCache(c, pin)) {
      renderPainel();
      return;
    }
    const conversaId = c.id;
    const consulta = ++sequenciaConsultaSaldo;
    Object.assign(saldo, {
      conversaId: c.id, pin, carregando: true,
      carregandoPin: c.canal === 'whatsapp' && forcar,
      cliente: null, erro: null,
    });
    renderPainel();
    try {
      const r = await api('/suporte/saldo', { method: 'POST', body: { pin, conversaId: c.id } });
      const em = Date.now();
      if (r.conversa) c.contato = r.conversa.contato;
      pinsWhatsappEmEdicao.delete(c.id);
      guardarSaldoNoCache(c, { pin, cliente: r.cliente, contato: r.conversa?.contato || null, em });
      if (estado.conversaId !== conversaId || consulta !== sequenciaConsultaSaldo) return;
      Object.assign(saldo, { carregando: false, carregandoPin: false, cliente: r.cliente, erro: null, em });
    } catch (e) {
      guardarSaldoNoCache(c, { pin, erro: e.message });
      if (estado.conversaId !== conversaId || consulta !== sequenciaConsultaSaldo) return;
      Object.assign(saldo, { carregando: false, carregandoPin: false, erro: e.message });
    }
    renderPainel();
  }

  function consultarSaldoAutomaticamente(c) {
    if (c?.canal === 'whatsapp' && pinsWhatsappEmEdicao.has(c.id)) return;
    const pin = String(c?.contato?.pin || '').replace(/\D/g, '');
    if (!estado.resumo?.saldoAtivo || !pin) return;
    consultarSaldo(pin, { forcar: false });
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
  function blocoPin(c) {
    const ct = c.contato;
    const validado = Boolean(ct.pin && ct.pinValidadoEm);
    // No Telegram o cliente já chega identificado: o PIN dele vem preenchido.
    // No WhatsApp começa vazio e o atendente digita o que o cliente informar.
    const doCanal = c.canal === 'telegram' ? (ct.telegramId || '') : '';
    const consultandoPin = saldo.conversaId === c.id && saldo.carregandoPin;
    const falhouSemPinSalvo = c.canal === 'whatsapp' && saldo.conversaId === c.id && saldo.erro && !ct.pin;
    const editandoWhatsapp = c.canal === 'whatsapp' && (pinsWhatsappEmEdicao.has(c.id) || falhouSemPinSalvo);
    const valorInicial = editandoWhatsapp ? '' : String(saldo.pin || ct.pin || doCanal || '').trim();
    const podeConsultar = Boolean(estado.resumo?.saldoAtivo);
    const botaoSaldo = (ler) => (podeConsultar
      ? el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => consultarSaldo(ler(), { forcar: true }) },
        saldo.erro ? 'Tentar de novo' : (saldo.cliente ? 'Atualizar saldo' : 'Consultar saldo'))
      : null);

    if (consultandoPin) {
      return el('div', { class: 'bloco-pin pendente pin-consultando', role: 'status', 'aria-live': 'polite' },
        el('div', { class: 'cab' },
          iconeCanal(c.canal, 16),
          el('span', { class: 'rotulo' }, 'PIN do cliente'),
          el('span', { class: 'selo pendente' }, 'Consultando')),
        el('div', { class: 'pin-loading' },
          el('span', { class: 'spinner-pin', 'aria-hidden': 'true' }),
          el('span', {}, 'Consultando PIN…')));
    }

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
          c.canal === 'whatsapp'
            ? el('span', {
              class: 'link-alterar-pin', title: 'Alterar o PIN informado pelo cliente',
              role: 'button', tabindex: '0',
              onclick: (e) => { e.stopPropagation(); alterarPinDoWhatsapp(c); },
              onkeydown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  alterarPinDoWhatsapp(c);
                }
              },
            }, 'Alterar')
            : null,
          el('span', {
            class: `ok${confirmado ? '' : ' pendente'}`,
            title: validado
              ? `Conferido às ${horaCurta(ct.pinValidadoEm)} por ${ct.pinValidadoPor || 'equipe'}`
              : (confirmado ? 'PIN informado pelo cliente' : 'Ainda não conferido'),
            html: ICONE.check,
          })),
      );
    }

    const { caixas, pinAtual } = camposPin('');
    return el('div', { class: 'bloco-pin pendente' },
      el('div', { class: 'cab' },
        iconeCanal(c.canal, 16),
        el('span', { class: 'rotulo' }, 'PIN do cliente'),
        el('span', { class: 'selo pendente' }, 'Pendente')),
      el('div', { class: 'pin-digitos' }, ...caixas),
      el('div', { class: 'linha-pin' },
        el('span', { class: 'pin-info' }, editandoWhatsapp ? 'Digite o novo PIN informado pelo cliente.' : 'Digite o PIN que o cliente informou.'),
        botaoSaldo(pinAtual)));
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

  /* ================================================================
   * Ficha do cliente: saldo, ações, abas e zona de risco
   *
   * Por enquanto é só a tela. O que depende do sistema do site (histórico
   * de compras, extrato e as ações que mexem em dinheiro) fica visível mas
   * desligado, com o aviso de "em breve" — em vez de número inventado, que
   * o atendente poderia tomar por verdade.
   * ============================================================== */
  const ficha = {
    aba: 'resumo',
    // Uma gaveta por aba: o que já veio da API do site fica guardado enquanto a
    // conversa for a mesma, para trocar de aba não repetir a consulta.
    compras: { conversaId: null, itens: [], total: 0, cursor: null, carregando: false, erro: null },
    transacoes: { conversaId: null, itens: [], total: 0, cursor: null, carregando: false, erro: null },
  };
  const ABAS_FICHA = [['resumo', 'Resumo'], ['compras', 'Compras'], ['transacoes', 'Transações']];

  function trocarAba(id) {
    ficha.aba = id;
    renderPainel();
    if (id !== 'resumo' && estado.conversa) carregarAba(id, estado.conversa);
  }

  // "há 2 min" desde a consulta de saldo.
  function desdeQuando(ms) {
    if (!ms) return null;
    const min = Math.floor((Date.now() - ms) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const horas = Math.floor(min / 60);
    return horas < 24 ? `há ${horas}h` : 'há mais de um dia';
  }

  // Bloco escuro do saldo. Enquanto ninguém consultou, ele mesmo convida a
  // consultar — o número nunca é inventado.
  function blocoSaldoEscuro(c) {
    const podeConsultar = Boolean(estado.resumo?.saldoAtivo);
    const cli = saldo.conversaId === c.id ? saldo.cliente : null;
    const editandoWhatsapp = c.canal === 'whatsapp' && pinsWhatsappEmEdicao.has(c.id);
    const pin = editandoWhatsapp ? '' : String(saldo.pin || c.contato.pin || '').trim();
    const cabecalho = (detalhe, textoBotao = null, classeDetalhe = 'saldo-vazio') => el('div', { class: 'saldo-cabecalho' },
      el('div', { class: 'saldo-cabecalho-texto' },
        el('span', { class: 'saldo-rotulo' }, 'Saldo em conta'),
        detalhe ? el('span', { class: classeDetalhe }, detalhe) : null),
      textoBotao ? el('button', { type: 'button', class: 'saldo-acao', onclick: () => consultarSaldo(pin) }, textoBotao) : null);

    if (saldo.conversaId === c.id && saldo.carregando) {
      return el('div', { class: 'saldo-bloco' }, cabecalho('Consultando saldo…'));
    }
    if (saldo.conversaId === c.id && saldo.erro) {
      return el('div', { class: 'saldo-bloco' },
        cabecalho(saldo.erro, podeConsultar && pin ? 'Tentar de novo' : null, 'saldo-erro'));
    }
    if (!cli) {
      const recado = !podeConsultar
        ? 'Consulta de saldo desligada no servidor.'
        : (editandoWhatsapp ? 'Informe e consulte o novo PIN do cliente.' : (pin ? 'Ainda não consultado.' : 'Confirme o PIN do cliente para ver o saldo.'));
      return el('div', { class: 'saldo-bloco' },
        cabecalho(recado, podeConsultar && pin ? 'Consultar saldo' : null));
    }

    const quando = desdeQuando(saldo.em);
    const situacao = situacaoNaTela(cli);
    return el('div', { class: 'saldo-bloco' },
      el('div', { class: 'saldo-linha-topo' },
        el('div', { class: 'saldo-numero' },
          el('span', { class: 'saldo-rotulo' }, 'Saldo em conta'),
          el('span', { class: 'saldo-valor-grande' }, cli.saldo)),
        el('div', { class: 'saldo-atualizacao' },
          quando ? el('span', { class: 'saldo-quando' }, icone('relogio', ICONE.relogioSuave), quando) : null,
          podeConsultar && pin
            ? el('button', {
              type: 'button', class: 'saldo-acao',
              onclick: () => consultarSaldo(pin, { forcar: true }),
            }, 'Atualizar saldo')
            : null)),
      el('div', { class: 'saldo-rodape' },
        el('span', {}, `${cli.totalRecargas} recarga${cli.totalRecargas === 1 ? '' : 's'}`),
        cli.ultimaRecarga ? el('span', { class: 'ponto' }, '·') : null,
        cli.ultimaRecarga ? el('span', {}, `Última ${cli.ultimaRecarga.valor}`) : null,
        el('span', { class: 'ponto' }, '·'),
        el('span', { class: situacao.ruim ? 'ruim' : 'bom' }, situacao.texto)));
  }

  // As três ações que mexem no saldo. A tela existe; o que grava, ainda não.
  function acoesSaldo(c) {
    const acoes = [
      ['adicionar', 'Adicionar', ICONE.maisGrande],
      ['debitar', 'Debitar', ICONE.menos],
      ['reembolsar', 'Reembolsar', ICONE.voltar],
    ];
    return el('div', { class: 'secao' },
      el('span', { class: 'secao-titulo' }, 'Ações de saldo'),
      el('div', { class: 'acoes-saldo' },
        ...acoes.map(([id, nome, marca]) => el('button', {
          type: 'button', class: 'acao-saldo hov', title: `${nome} saldo — ainda em construção`,
          onclick: () => abrirFolhaSaldo(id, c),
        }, icone(id, marca), el('span', {}, nome)))));
  }

  function abasFicha() {
    return el('div', { class: 'abas-ficha' },
      ...ABAS_FICHA.map(([id, nome]) => el('button', {
        type: 'button', class: `aba-ficha${ficha.aba === id ? ' ativa' : ''}`, onclick: () => trocarAba(id),
      }, nome)));
  }

  // Zona de risco, no pé da ficha.
  //
  // Quais botões aparecem depende da situação que o site manda pronta, e não de
  // combinação feita aqui: reativar uma conta banida, por exemplo, teria sucesso
  // técnico e a conta seguiria bloqueada — o site recusa, e a tela nem oferece.
  //
  // Banir e desbanir são só de administrador. Não por serem irreversíveis (o
  // site devolve as chaves que a ação cortou), mas por não serem decisão de
  // quem está no meio de um atendimento.
  function botaoDeRisco(acao, c, perigo = false) {
    const [titulo] = TITULOS_CONTA[acao];
    const marca = acao === 'banir' ? ICONE.banir : (acao === 'desativar' ? ICONE.desligar : ICONE.voltar);
    return el('button', {
      type: 'button', class: `btn-risco hov${perigo ? ' perigo' : ''}`, title: titulo,
      onclick: () => abrirFolhaConta(acao, c),
    }, icone(acao, marca), titulo);
  }

  function zonaDeRisco(c) {
    const cli = saldo.conversaId === c.id ? saldo.cliente : null;
    const admin = (estado.resumo?.conta || estado.resumo?.usuario)?.papel === 'admin';
    const pin = pinDaFicha(c);
    const ligado = Boolean(estado.resumo?.saldoAtivo);

    // Sem consulta não dá para saber a situação da conta, e oferecer "Desativar"
    // para uma conta já desativada só renderia recusa do outro lado.
    if (!cli) {
      const porque = !ligado ? 'Ações de conta desligadas no servidor'
        : (pin ? 'Consulte o saldo primeiro: a tela precisa saber a situação da conta' : 'Confirme o PIN do cliente primeiro');
      return el('div', { class: 'zona-risco' },
        desligar(el('button', { type: 'button', class: 'btn-risco' }, icone('desativar', ICONE.desligar), 'Desativar conta'), porque),
        admin ? desligar(el('button', { type: 'button', class: 'btn-risco perigo' }, icone('banir', ICONE.banir), 'Banir conta'), porque) : null);
    }

    const motivo = cli.situacao?.permitida === false ? (cli.situacao.motivo || null) : null;
    const botoes = [];
    if (motivo === 'banida') {
      // Banida: desativar e reativar o site recusa. Só sair do banimento.
      if (admin) botoes.push(botaoDeRisco('desbanir', c, true));
    } else if (motivo === 'encerrada' || cli.encerradaPeloTitular) {
      // Quem fechou foi o próprio cliente: reabrir é decisão de administrador,
      // pelo painel do site. Aqui nem aparece, para ninguém desfazer sem querer.
      if (admin) botoes.push(botaoDeRisco('banir', c, true));
    } else if (motivo === 'desativada') {
      botoes.push(botaoDeRisco('reativar', c));
      if (admin) botoes.push(botaoDeRisco('banir', c, true));
    } else {
      botoes.push(botaoDeRisco('desativar', c));
      if (admin) botoes.push(botaoDeRisco('banir', c, true));
    }

    if (!botoes.length) {
      return el('div', { class: 'zona-risco' },
        el('span', { class: 'zona-nota' }, 'Esta conta está banida. Só um administrador pode tirar o banimento.'));
    }
    return el('div', { class: 'zona-risco' }, ...botoes);
  }

  function vazioDaAba(titulo, texto) {
    return el('div', { class: 'aba-vazia' },
      el('strong', {}, titulo),
      el('span', {}, texto));
  }

  // ===== Compras e extrato (API do site) =====
  const CAMINHO_ABA = { compras: '/suporte/compras', transacoes: '/suporte/transacoes' };
  const CHAVE_ABA = { compras: 'compras', transacoes: 'transacoes' };

  function pinDaFicha(c) {
    return String((saldo.conversaId === c.id ? saldo.pin : '') || c.contato.pin || '').trim();
  }

  // Busca a página seguinte (ou a primeira) da aba aberta.
  async function carregarAba(nome, c, { maisUma = false } = {}) {
    const gaveta = ficha[CHAVE_ABA[nome]];
    const pin = pinDaFicha(c);
    if (!pin || gaveta.carregando) return;
    if (!maisUma && gaveta.conversaId === c.id && gaveta.itens.length) return; // já temos

    if (!maisUma) Object.assign(gaveta, { conversaId: c.id, itens: [], total: 0, cursor: null });
    gaveta.carregando = true;
    gaveta.erro = null;
    renderPainel();
    try {
      const r = await api(CAMINHO_ABA[nome], { method: 'POST', body: { pin, cursor: maisUma ? gaveta.cursor : null } });
      const novos = nome === 'compras' ? r.compras : r.transacoes;
      Object.assign(gaveta, {
        conversaId: c.id,
        itens: maisUma ? [...gaveta.itens, ...novos] : novos,
        total: r.total,
        cursor: r.proximoCursor ?? null,
        carregando: false,
      });
    } catch (e) {
      Object.assign(gaveta, { carregando: false, erro: e.message });
    }
    renderPainel();
  }

  // Molde comum das duas abas: recado quando falta PIN, erro, vazio ou lista.
  function corpoDeLista(nome, c, { titulo, textoVazio, desenhar }) {
    const gaveta = ficha[CHAVE_ABA[nome]];
    if (!estado.resumo?.saldoAtivo) return [vazioDaAba(titulo, 'Consulta ao sistema do site desligada no servidor.')];
    if (!pinDaFicha(c)) return [vazioDaAba(titulo, 'Confirme o PIN do cliente para ver estes dados.')];
    if (gaveta.erro) return [vazioDaAba('Não deu para carregar', gaveta.erro)];
    if (gaveta.carregando && !gaveta.itens.length) return [vazioDaAba(titulo, 'Carregando…')];
    if (gaveta.conversaId !== c.id || (!gaveta.itens.length && !gaveta.carregando)) {
      return [vazioDaAba(titulo, textoVazio)];
    }
    return [
      el('div', { class: 'secao' },
        el('div', { class: 'linha-titulo' },
          el('span', { class: 'secao-titulo' }, titulo),
          el('span', { class: 'contagem' }, gaveta.total > gaveta.itens.length ? `${gaveta.itens.length} de ${gaveta.total}` : `${gaveta.total}`)),
        el('div', { class: `lista-${nome}` }, ...gaveta.itens.map(desenhar)),
        gaveta.cursor
          ? el('button', {
            type: 'button', class: 'historico-btn', disabled: gaveta.carregando ? 'disabled' : null,
            onclick: () => carregarAba(nome, c, { maisUma: true }),
          }, gaveta.carregando ? 'Carregando…' : 'Carregar mais')
          : null),
    ];
  }

  function itemCompra(compra) {
    const cancelada = compra.status === 'cancelled' || String(compra.statusTexto || '').toLowerCase() === 'cancelada';
    const selo = cancelada ? 'cancelada' : (compra.reembolsada ? 'reembolsada' : (compra.status === 'completed' || compra.status === 'active' ? 'ok' : 'neutro'));
    const dataHora = formatarDataHoraCompra(compra.data);
    const titulo = compra.option?.name ? `${compra.descricao} - ${compra.option.name}` : compra.descricao;
    return el('div', { class: 'compra-item' },
      el('div', { class: 'linha' },
        el('span', { class: 'nome', title: titulo }, titulo),
        el('span', { class: 'valor' }, compra.valor)),
      el('div', { class: 'linha' },
        compra.numero
          ? el('span', { class: 'numero-compra' },
            el('span', { class: 'numero' }, compra.numero),
            el('button', {
              type: 'button', class: 'copiar-numero hov', title: 'Copiar número', 'aria-label': `Copiar número ${compra.numero}`,
              onclick: async (evento) => {
                evento.stopPropagation();
                try {
                  await navigator.clipboard.writeText(String(compra.numero));
                  toast('Número copiado.');
                } catch {
                  toast('Não consegui copiar. Selecione o número e use Ctrl+C.');
                }
              },
            }, svg(ICONE.copiar)))
          : el('span', { class: 'numero' }, '—'),
        el('span', { class: `selo-compra ${selo}` }, compra.reembolsada ? `${compra.statusTexto} · reembolsada` : compra.statusTexto)),
      dataHora ? el('span', { class: 'data-compra' }, `Comprada em ${dataHora}`) : null);
  }

  function itemTransacao(t) {
    const titulo = t.option?.name ? `${t.tipoTexto} - ${t.option.name}` : t.tipoTexto;
    const { descricao, numero, complemento } = apresentarDescricaoTransacao(t);
    const partesDescricao = numero
      ? [el('span', { class: 'numero-transacao' }, numero), complemento || '']
      : (descricao ? [descricao] : []);
    return el('div', { class: 'transacao-item' },
      el('span', { class: `transacao-ic ${t.entrada ? 'entrada' : 'saida'}` }, icone(t.tipo, t.entrada ? ICONE.maisGrande : ICONE.menos)),
      el('div', { class: 'transacao-texto' },
        el('span', { class: 'tipo', title: titulo }, titulo),
        partesDescricao.length ? el('span', { class: 'desc', title: descricao }, ...partesDescricao) : null),
      el('div', { class: 'transacao-valores' },
        el('span', { class: `valor ${t.entrada ? 'entrada' : 'saida'}` }, `${t.entrada ? '+' : ''}${t.valor}`),
        t.saldoDepois ? el('span', { class: 'depois' }, `→ ${t.saldoDepois}`) : null));
  }

  // ===== Folhas laterais das ações de saldo =====
  // Mostram o cliente, o saldo de agora e como ele fica depois. Cada clique do
  // atendente ganha uma marca de segurança própria, repetida em toda tentativa
  // daquele clique: é ela que impede creditar duas vezes quando a rede falha.
  const TITULOS_FOLHA = {
    adicionar: ['Adicionar saldo', 'Crédito manual para a conta'],
    debitar: ['Debitar saldo', 'Ajuste manual para menos'],
    reembolsar: ['Reembolsar', 'Selecione a compra a devolver'],
  };
  const ICONES_FOLHA_SALDO = {
    adicionar: ['adicionar', ICONE.maisGrande],
    debitar: ['debitar', ICONE.menos],
    reembolsar: ['reembolsar', ICONE.voltar],
  };
  const ATALHOS_VALOR = ['10,00', '20,00', '50,00', '100,00'];
  // Na tela é "Adicionar"; na API do site a ação chama "creditar".
  const ACAO_NA_API = { adicionar: 'creditar', debitar: 'debitar', reembolsar: 'reembolsar' };
  // O verbo da confirmação sai daqui, pelo tipo DA TELA. Escrever a condição à
  // mão já custou caro: a comparação era com 'creditar', que é o nome da ação
  // na API e nunca o tipo da tela, então a confirmação de um crédito dizia
  // "debitando" — a última pergunta antes de mexer no dinheiro, invertida.
  const VERBO_DA_CONFIRMACAO = { adicionar: 'creditando', debitar: 'debitando' };
  // Mesmo mínimo do site, nas sete ações. Num lugar só: quando ele mudar de
  // ideia, as duas folhas mudam juntas em vez de discordarem uma da outra.
  const MINIMO_DO_MOTIVO = 5;
  const NOME_DO_FEITO = { adicionar: 'Crédito', debitar: 'Débito', reembolsar: 'Reembolso' };

  function emReaisDoCentavo(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Marca de segurança da operação: uma por clique do atendente. Repetir a
  // MESMA marca é o que garante que uma tentativa repetida (rede ruim, clique
  // duplo) não credite o cliente duas vezes.
  function novaMarca() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `crm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // Acima deste valor a tela pede confirmação: pega o zero digitado a mais,
  // que é o erro comum de quem digita rápido.
  const VALOR_QUE_PEDE_CONFIRMACAO = 20000; // R$ 200,00

  function abrirFolhaSaldo(tipo, c) {
    const [titulo, subtitulo] = TITULOS_FOLHA[tipo];
    const [nomeIcone, fallbackIcone] = ICONES_FOLHA_SALDO[tipo];
    const cli = saldo.conversaId === c.id ? saldo.cliente : null;
    const nome = cli?.nome || c.contato.nome;
    const pin = String(saldo.pin || c.contato.pin || '').trim();
    const ligado = Boolean(estado.resumo?.saldoAtivo) && Boolean(pin);
    // A mesma marca vale para todas as tentativas deste clique.
    const estadoFolha = { marca: novaMarca(), enviando: false, compra: null, erro: null };

    const campoValor = el('input', {
      type: 'text', value: tipo === 'reembolsar' ? '' : '0,00', 'aria-label': 'Valor',
      inputmode: 'numeric', autocomplete: 'off',
      class: 'folha-valor', disabled: tipo === 'reembolsar' ? 'disabled' : null,
      oninput: () => {
        campoValor.value = formatarValorEmCentavos(campoValor.value);
        campoValor.setSelectionRange?.(campoValor.value.length, campoValor.value.length);
        desenharPrevisao();
      },
    });
    const campoMotivo = el('textarea', {
      class: 'campo-rapida area', rows: '2', maxlength: '300',
      placeholder: tipo === 'reembolsar' ? 'Ex.: número não recebeu o código de ativação…' : 'Ex.: recarga via PIX não creditada…',
    });

    const antesDepois = el('div', { class: 'folha-antes-depois' });
    const aviso = el('div', { class: 'folha-aviso', hidden: 'hidden' });
    const botaoConfirmar = el('button', { type: 'button', class: 'btn-verde', onclick: () => confirmar() }, titulo);

    // Saldo de agora e como fica depois — recalculado a cada tecla.
    function desenharPrevisao() {
      const atual = cli?.saldoCentavos ?? null;
      const centavos = tipo === 'reembolsar'
        ? (estadoFolha.compra ? estadoFolha.compra.valorCentavos : null)
        : centavosDoValorFormatado(campoValor.value);
      const sinal = tipo === 'debitar' ? -1 : 1;
      const depois = atual !== null && centavos !== null ? atual + sinal * centavos : null;
      antesDepois.replaceChildren(
        el('div', { class: 'lado' }, el('span', { class: 'k' }, 'Saldo atual'), el('span', { class: 'v' }, cli?.saldo || '—')),
        icone('seta', ICONE.setaDireita),
        el('div', { class: 'lado fim' },
          el('span', { class: 'k' }, 'Fica em'),
          el('span', { class: `v ${depois !== null && depois < 0 ? 'vermelho' : 'verde'}` }, depois === null ? '—' : emReaisDoCentavo(depois))));
    }

    function mostrarAviso(texto, classe = 'erro') {
      aviso.className = `folha-aviso ${classe}`;
      aviso.textContent = texto;
      aviso.hidden = !texto;
    }

    // Lista de compras para escolher no reembolso, com o motivo quando não dá.
    function corpoCompras() {
      const gaveta = ficha.compras;
      if (gaveta.conversaId !== c.id || !gaveta.itens.length) {
        return vazioDaAba('Sem compras carregadas', 'Abra a aba Compras da ficha para carregar as compras deste cliente.');
      }
      return el('div', { class: 'escolha-compras' }, ...gaveta.itens.map((compra) => {
        const escolhida = estadoFolha.compra?.id === compra.id;
        const bloqueada = !compra.podeReembolsar;
        return el('button', {
          type: 'button',
          class: `escolha-compra${escolhida ? ' marcada' : ''}${bloqueada ? ' bloqueada' : ''}`,
          disabled: bloqueada ? 'disabled' : null,
          title: bloqueada ? (compra.motivoNaoPodeReembolsar || 'Esta compra não pode ser reembolsada.') : '',
          onclick: () => { estadoFolha.compra = compra; desenharCompras(); desenharPrevisao(); mostrarAviso(''); },
        },
          el('span', { class: 'marca-radio' }),
          el('div', { class: 'texto' },
            el('span', { class: 'nome' }, `${compra.descricao}${compra.numero ? ` · ${compra.numero}` : ''}`),
            el('span', { class: 'sub' }, bloqueada ? (compra.motivoNaoPodeReembolsar || 'Não pode ser reembolsada') : (compra.recebeuSms ? 'Atenção: o código chegou para o cliente' : 'Código não chegou'))),
          el('span', { class: 'valor' }, compra.valor));
      }));
    }

    const caixaCompras = el('div', {});
    function desenharCompras() { caixaCompras.replaceChildren(corpoCompras()); }

    async function enviar() {
      const corpo = {
        pin,
        motivo: campoMotivo.value.trim(),
        chaveIdempotencia: estadoFolha.marca,
      };
      if (tipo === 'reembolsar') corpo.activationId = estadoFolha.compra?.id;
      else corpo.valorCents = centavosDoValorFormatado(campoValor.value);

      estadoFolha.enviando = true;
      botaoConfirmar.disabled = true;
      botaoConfirmar.textContent = 'Enviando…';
      mostrarAviso('');
      try {
        const r = await api(`/conversas/${c.id}/saldo/${ACAO_NA_API[tipo]}`, { method: 'POST', body: corpo });
        // O saldo do card vem do próprio resultado: nada de número velho na tela.
        if (saldo.conversaId === c.id && saldo.cliente) {
          saldo.cliente = { ...saldo.cliente, saldo: r.saldoAtual, saldoCentavos: r.saldoAtualCentavos };
          saldo.em = Date.now();
          guardarSaldoNoCache(c, { pin: saldo.pin, cliente: saldo.cliente, contato: c.contato, em: saldo.em });
        }
        // Compras e extrato mudaram: busca de novo quando a aba for aberta.
        ficha.compras.conversaId = null;
        ficha.transacoes.conversaId = null;
        if (ficha.aba !== 'resumo') carregarAba(ficha.aba, c);
        fundo.remove();
        renderPainel();
        toast(r.repetida
          ? 'Esta operação já tinha sido feita — nada foi repetido.'
          : `${NOME_DO_FEITO[tipo]} de ${r.valor} feito. Saldo agora: ${r.saldoAtual}.`, 5000);
      } catch (e) {
        // Recusa do servidor é resposta, não falha: aparece dentro da folha.
        mostrarAviso(e.message);
        botaoConfirmar.textContent = e.podeRepetir ? 'Tentar de novo' : titulo;
        botaoConfirmar.disabled = false;
        estadoFolha.enviando = false;
        return;
      }
      estadoFolha.enviando = false;
    }

    function confirmar() {
      if (estadoFolha.enviando) return;
      // O site exige motivo nas sete ações. Cobrar aqui troca um 400 técnico
      // vindo do outro lado por um recado claro, antes de a requisição sair.
      if (campoMotivo.value.trim().length < MINIMO_DO_MOTIVO) {
        return mostrarAviso(`Escreva o motivo com pelo menos ${MINIMO_DO_MOTIVO} caracteres — ele fica no registro da operação.`);
      }
      if (tipo === 'reembolsar') {
        if (!estadoFolha.compra) return mostrarAviso('Escolha a compra que será reembolsada.');
        if (estadoFolha.compra.recebeuSms
          && !window.confirm(`Esta compra ENTREGOU o código ao cliente (${estadoFolha.compra.numero || 'número'}).\n\nReembolsar mesmo assim?`)) return;
      } else {
        const centavos = centavosDoValorFormatado(campoValor.value);
        if (centavos === null) return mostrarAviso('Digite um valor maior que zero.');
        if (centavos > VALOR_QUE_PEDE_CONFIRMACAO
          && !window.confirm(`Você está ${VERBO_DA_CONFIRMACAO[tipo]} ${emReaisDoCentavo(centavos)}.\n\nConfirma esse valor?`)) return;
      }
      enviar();
    }

    const fundo = el('div', { class: 'modal-fundo', onclick: (e) => { if (e.target === fundo) fundo.remove(); } },
      el('div', { class: 'folha', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
        el('div', { class: 'folha-cab' },
          el('span', { class: `folha-titulo-icone ${tipo}`, 'aria-hidden': 'true' }, icone(nomeIcone, fallbackIcone)),
          el('div', { class: 'folha-titulo' },
            el('strong', {}, titulo),
            el('span', {}, `${nome}${pin ? ` · PIN ${pin}` : ''}`)),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: () => fundo.remove() }, svg(ICONE.fechar))),

        el('div', { class: 'folha-corpo' },
          el('span', { class: 'folha-sub' }, subtitulo),
          aviso,

          tipo === 'reembolsar'
            ? el('div', { class: 'folha-campo' },
              el('span', { class: 'secao-titulo' }, 'Compra'),
              caixaCompras)
            : el('div', { class: 'folha-campo' },
              el('span', { class: 'secao-titulo' }, 'Valor'),
              el('div', { class: `folha-caixa-valor${tipo === 'debitar' ? ' menos' : ''}` },
                el('span', { class: 'folha-moeda' }, tipo === 'debitar' ? '− R$' : '+ R$'),
                campoValor),
              el('div', { class: 'folha-atalhos' },
                ...ATALHOS_VALOR.map((v) => el('button', {
                  type: 'button', class: 'folha-atalho hov',
                  onclick: () => { campoValor.value = v; desenharPrevisao(); },
                }, v)))),

          antesDepois,

          el('div', { class: 'folha-campo' },
            el('span', { class: 'secao-titulo' }, 'Motivo'),
            campoMotivo,
            el('span', { class: 'folha-dica' }, 'Se preenchido, fica no registro da operação, aqui e no sistema do site.'))),

        el('div', { class: 'folha-pe' },
          el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => fundo.remove() }, 'Cancelar'),
          ligado ? botaoConfirmar : desligar(el('button', { type: 'button', class: 'btn-verde' }, titulo),
            pin ? 'Ações de saldo desligadas no servidor' : 'Confirme o PIN do cliente primeiro'))));

    desenharCompras();
    desenharPrevisao();
    document.body.append(fundo);
    if (tipo !== 'reembolsar') {
      campoValor.focus();
      campoValor.select();
    }
  }

  // ===== Ações que mudam a situação da conta =====
  //
  // Quem decide o que a tela mostra é a situação que o site manda pronta, não o
  // status cru: existem contas marcadas "active" que estão bloqueadas de fato, e
  // a tela dizia "Ativa / Sem bloqueio" para elas.
  const TITULOS_CONTA = {
    desativar: ['Desativar conta', 'O cliente perde o acesso até alguém reativar. As chaves de API dele são cortadas e voltam no reativar.'],
    reativar: ['Reativar conta', 'Devolve o acesso e as chaves de API que a desativação cortou.'],
    banir: ['Banir conta', 'Bloqueio por fraude ou abuso. As chaves de API são cortadas e só voltam no desbanir.'],
    desbanir: ['Tirar o banimento', 'Devolve as chaves de API que o banimento cortou.'],
  };
  const EXEMPLO_CONTA = {
    desativar: 'Ex.: cliente pediu o encerramento temporário da conta…',
    reativar: 'Ex.: cliente voltou e pediu a conta de volta…',
    banir: 'Ex.: uso fraudulento confirmado no chamado 1234…',
    desbanir: 'Ex.: banimento aplicado por engano, conta conferida…',
  };
  const FEITO_CONTA = {
    desativar: 'Conta desativada.', reativar: 'Conta reativada.',
    banir: 'Conta banida.', desbanir: 'Banimento retirado.',
  };
  const ROTULO_SITUACAO = {
    banida: 'Conta banida',
    desativada: 'Conta desativada',
    encerrada: 'Encerrada pelo titular',
    nao_encontrada: 'Conta não encontrada',
  };

  // A frase que aparece na ficha. Vem do site; o segundo caminho só existe para
  // o caso de o site ainda ser antigo e não mandar a decisão pronta.
  function situacaoNaTela(cli) {
    const s = cli?.situacao;
    if (s && s.permitida === false) {
      return { texto: ROTULO_SITUACAO[s.motivo] || 'Conta bloqueada', ruim: true };
    }
    if (s && s.permitida === true) return { texto: 'Sem bloqueio', ruim: false };
    return cli?.bloqueada
      ? { texto: 'Conta bloqueada', ruim: true }
      : { texto: 'Sem bloqueio', ruim: false };
  }

  function abrirFolhaConta(acao, c) {
    const [titulo, subtitulo] = TITULOS_CONTA[acao];
    const cli = saldo.conversaId === c.id ? saldo.cliente : null;
    const nome = cli?.nome || c.contato.nome;
    const pin = pinDaFicha(c);
    // A mesma marca vale para todas as tentativas deste clique.
    const estadoFolha = { marca: novaMarca(), enviando: false };

    const campoMotivo = el('textarea', {
      class: 'campo-rapida area', rows: '2', minlength: '5', maxlength: '300', placeholder: EXEMPLO_CONTA[acao],
    });
    const aviso = el('div', { class: 'folha-aviso', hidden: 'hidden' });
    const perigosa = acao === 'banir';
    const botaoConfirmar = el('button', {
      type: 'button', class: perigosa ? 'btn-perigo' : 'btn-verde', onclick: () => confirmar(),
    }, titulo);

    function mostrarAviso(texto) {
      aviso.textContent = texto || '';
      aviso.hidden = !texto;
    }

    async function enviar() {
      estadoFolha.enviando = true;
      botaoConfirmar.disabled = true;
      botaoConfirmar.textContent = 'Enviando…';
      mostrarAviso('');
      try {
        const r = await api(`/conversas/${c.id}/conta/${acao}`, {
          method: 'POST',
          body: { pin, motivo: campoMotivo.value.trim(), chaveIdempotencia: estadoFolha.marca },
        });
        // A situação volta recalculada: a ficha passa a mostrar o estado novo
        // sem precisar consultar o saldo de novo.
        if (saldo.conversaId === c.id && saldo.cliente) {
          saldo.cliente = {
            ...saldo.cliente,
            status: r.status, statusTexto: r.statusTexto, bloqueada: r.bloqueada,
            ativa: r.ativa, encerradaPeloTitular: r.encerradaPeloTitular, situacao: r.situacao,
          };
          saldo.em = Date.now();
          guardarSaldoNoCache(c, { pin: saldo.pin, cliente: saldo.cliente, contato: c.contato, em: saldo.em });
        }
        fundo.remove();
        renderPainel();
        toast(recadoDoFeito(acao, r), 6000);
      } catch (e) {
        // Recusa do site é resposta, não falha: aparece dentro da folha.
        mostrarAviso(e.message);
        botaoConfirmar.textContent = e.podeRepetir ? 'Tentar de novo' : titulo;
        botaoConfirmar.disabled = false;
        estadoFolha.enviando = false;
        return;
      }
      estadoFolha.enviando = false;
    }

    function confirmar() {
      if (estadoFolha.enviando) return;
      if (campoMotivo.value.trim().length < MINIMO_DO_MOTIVO) {
        return mostrarAviso(`Escreva o motivo com pelo menos ${MINIMO_DO_MOTIVO} caracteres — ele fica no registro da operação.`);
      }
      if (perigosa && !window.confirm(`Banir a conta de ${nome}?\n\nO cliente perde o acesso e as chaves de API dele são cortadas na hora.`)) return;
      enviar();
    }

    const fundo = el('div', { class: 'modal-fundo', onclick: (e) => { if (e.target === fundo) fundo.remove(); } },
      el('div', { class: 'folha', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
        el('div', { class: 'folha-cab' },
          el('div', { class: 'folha-titulo' },
            el('strong', {}, titulo),
            el('span', {}, `${nome}${pin ? ` · PIN ${pin}` : ''}`)),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: () => fundo.remove() }, svg(ICONE.fechar))),

        el('div', { class: 'folha-corpo' },
          el('span', { class: 'folha-sub' }, subtitulo),
          aviso,
          el('div', { class: 'folha-campo' },
            el('span', { class: 'secao-titulo' }, 'Motivo'),
            campoMotivo,
            el('span', { class: 'folha-dica' }, 'Fica no registro da operação, aqui e no sistema do site.'))),

        el('div', { class: 'folha-pe' },
          el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => fundo.remove() }, 'Cancelar'),
          botaoConfirmar)));

    document.body.append(fundo);
    campoMotivo.focus();
  }

  // Desbanir e reativar existem para devolver a conta ao cliente. Quando a ação
  // dá certo e a conta continua bloqueada por OUTRO motivo — desbanir uma conta
  // que também estava desativada —, o atendente precisa saber, senão vai avisar
  // o cliente que resolveu. Em desativar e banir ficar sem acesso é o objetivo,
  // então ali o aviso só repetiria o que o botão já disse.
  const DEVOLVEM_A_CONTA = new Set(['reativar', 'desbanir']);

  function recadoDoFeito(acao, r) {
    if (r.semMudanca) return 'A conta já estava assim — nada foi alterado.';
    const partes = [FEITO_CONTA[acao]];
    if (r.chavesRestauradas > 0) partes.push(`${r.chavesRestauradas} chave${r.chavesRestauradas === 1 ? '' : 's'} de API devolvida${r.chavesRestauradas === 1 ? '' : 's'}.`);
    else if (r.chavesRevogadas > 0) partes.push(`${r.chavesRevogadas} chave${r.chavesRevogadas === 1 ? '' : 's'} de API cortada${r.chavesRevogadas === 1 ? '' : 's'}.`);
    if (DEVOLVEM_A_CONTA.has(acao) && r.situacao?.permitida === false) {
      const porque = { banida: 'ela continua banida', desativada: 'ela continua desativada', encerrada: 'ela foi encerrada pelo titular' }[r.situacao.motivo];
      partes.push(`Atenção: o cliente ainda NÃO tem acesso — ${porque || 'a conta segue bloqueada'}.`);
    }
    return partes.join(' ');
  }

  function renderPainel() {
    const painel = $('#painel');
    const c = estado.conversa;
    if (!c) {
      const itens = [
        ['PIN do cliente', '5 dígitos conferidos no atendimento'],
        ['Saldo e ações', 'consultar, adicionar, debitar e reembolsar'],
        ['Compras e extrato', 'ativações e movimentações da conta'],
      ];
      painel.replaceChildren(
        el('div', { class: 'painel-topo' },
          el('span', { class: 'avatar-quadrado neutro' }, icone('pin', ICONE.cadeadoGrande)),
          el('div', { class: 'membro-info' },
            el('span', { class: 'painel-nome suave' }, 'Ficha do cliente'),
            el('span', { class: 'painel-sub' }, 'Nenhuma conversa aberta'))),
        el('div', { class: 'painel-vazio' },
          el('span', {}, 'Ao abrir uma conversa, aparecem aqui o PIN de validação, o saldo em conta, as compras e as notas internas da equipe.'),
          el('div', { class: 'painel-vazio-itens' },
            ...itens.map(([t, sub]) => el('div', { class: 'painel-vazio-item' }, el('strong', {}, t), el('span', {}, sub))))));
      return;
    }
    const ct = c.contato;
    const cli = saldo.conversaId === c.id ? saldo.cliente : null;
    const notas = c.mensagens.filter((m) => m.tipo === 'nota').slice().reverse();

    const textareaNota = el('textarea', {
      id: 'texto-nota', rows: '1', maxlength: '4000', placeholder: 'Escreva uma nota para a equipe…',
      'aria-label': 'Nova nota interna', lang: 'pt-BR', spellcheck: 'true',
      oninput: () => { maiuscularInicio(textareaNota); corrigirEnquantoDigita(textareaNota); ajustarAltura(textareaNota); },
      onkeydown: (e) => {
        if (!deveSalvarNota(e, textareaNota.value)) return;
        e.preventDefault();
        salvarNota();
      },
    });
    const salvarNota = () => enviarMensagem(acentosLigados ? corrigirTexto(textareaNota.value) : textareaNota.value, 'nota', textareaNota);

    const blocoNotas = el('div', { class: 'secao' },
      el('span', { class: 'secao-titulo' }, 'Nota interna'),
      el('div', { class: 'caixa-nota' }, textareaNota),
      ...notas.map((n) => el('div', { class: 'nota-item' },
        editandoAqui(n, 'ficha') ? edicaoDaNota(n) : el('span', { class: 't' }, n.texto),
        el('div', { class: 'nota-item-pe' },
          el('span', { class: 'm' }, `${n.autor?.nomeCurto || 'Equipe'} · ${horaLista(n.criadaEm) === horaCurta(n.criadaEm) ? horaCurta(n.criadaEm) : `${horaLista(n.criadaEm)} ${horaCurta(n.criadaEm)}`}${n.editadaEm ? ' · editada' : ''}`),
          editandoAqui(n, 'ficha') ? null : acoesDaNota(n, 'ficha', 'nota-acoes linha')))),
      notas.length ? null : el('span', { class: 'nota-vazia' }, 'Nenhuma nota ainda.'));

    // Números que já temos de verdade. O resto do Resumo do desenho (gasto
    // total, reembolsos, cliente desde) depende da API do site.
    // Recargas, última recarga e e-mail já aparecem no bloco de saldo e no
    // cabeçalho: aqui fica só o que não está em outro lugar.
    const numeros = [];
    if (cli) {
      numeros.push(['Reembolsos', Number.isFinite(cli.totalReembolsos) ? String(cli.totalReembolsos) : '—']);
      numeros.push(['Situação', situacaoNaTela(cli).texto]);
    }

    const corpoAba = {
      resumo: () => [
        c.alerta ? el('div', { class: 'alerta' }, icone('alerta', ICONE.alerta),
          el('span', {}, el('strong', {}, `${c.alerta.titulo} `), c.alerta.texto)) : null,
        numeros.length
          ? el('div', { class: 'secao' },
            el('span', { class: 'secao-titulo' }, 'Conta do cliente'),
            el('div', { class: 'grade-numeros' },
              ...numeros.map(([k, v]) => el('div', { class: 'numero-ficha' },
                el('span', { class: 'k' }, k), el('span', { class: 'v' }, v)))))
          : null,
        ct.dados?.length ? secao('Dados da conversa',
          el('div', {}, ...ct.dados.map(([k, v, cor]) => el('div', { class: 'linha-dado' },
            el('span', { class: 'k' }, k), el('span', { class: `v${cor ? ` ${cor}` : ''}` }, v))))) : null,
        blocoNotas,
      ],
      compras: () => corpoDeLista('compras', c, {
        titulo: 'Compras',
        textoVazio: 'Este cliente ainda não tem compras registradas.',
        desenhar: itemCompra,
      }),
      transacoes: () => corpoDeLista('transacoes', c, {
        titulo: 'Extrato',
        textoVazio: 'Nenhuma movimentação registrada nesta conta.',
        desenhar: itemTransacao,
      }),
    };
    // Antes da consulta, a ficha continua mostrando notas, alertas e dados da
    // conversa. Controles financeiros e histórico da conta só aparecem depois
    // que a API confirmou o cliente e devolveu o saldo desta conversa.
    const conteudoFinanceiro = cli
      ? [acoesSaldo(c), abasFicha(), ...corpoAba[ficha.aba]()]
      : corpoAba.resumo();

    painel.replaceChildren(
      el('div', { class: 'painel-topo' },
        c.canal === 'telegram'
          ? el('span', { class: 'avatar-quadrado neutro' }, iconeCanal('telegram', 15))
          : avatarCliente({ canal: c.canal, contato: { iniciais: iniciais(ct.empresa || ct.nome) } }, 'avatar-quadrado neutro'),
        el('div', { class: 'membro-info' },
          el('span', { class: 'painel-nome suave' }, ct.empresa || ct.nome || 'Ficha do cliente'),
          el('span', { class: 'painel-sub' },
            c.canal === 'widget' && (ct.email || (saldo.conversaId === c.id ? saldo.cliente?.email : null))
              ? (ct.email || saldo.cliente.email)
              : (ct.cnpj || ct.telefone || (ct.telegramUsuario ? `@${ct.telegramUsuario}` : '')))),
        botaoAbrirConta(c)),
      el('div', { class: 'rolagem painel-corpo' },
        blocoPin(c),
        blocoSaldoEscuro(c),
        ...conteudoFinanceiro),
      zonaDeRisco(c));
    ajustarAltura(textareaNota);
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
  const config = {
    aberto: false, secao: 'equipe', dados: null, carregando: false, erro: null,
    auditoria: null, auditoriaCarregando: false, auditoriaErro: null,
    canais: null, canaisCarregando: false, canaisErro: null, canalAberto: null, eventosDoCanal: null,
  };

  const SECOES_CONFIG = [
    { grupo: 'Atendimento' },
    { id: 'equipe', nome: 'Equipe', icone: 'pessoas', soAdmin: true },
    { id: 'canais', nome: 'Canais', icone: 'elo', soAdmin: true },
    { id: 'auditoria', nome: 'Auditoria', icone: 'olho', soAdmin: true },
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
    if (config.secao === 'canais') carregarCanais();
    if (config.secao === 'auditoria') carregarAuditoria();
  }

  function fecharConfiguracoes() {
    pararSondagem();
    config.aberto = false;
    $('#area-config').hidden = true;
    document.querySelector('.area:not(.config)').hidden = false;
    $('#btn-config').classList.remove('ativo');
    document.querySelector('.rail-btn[title="Atendimento"]')?.classList.add('ativo');
  }

  function escolherSecao(id) {
    if (config.secao === 'canais' && id !== 'canais') pararSondagem();
    config.secao = id;
    renderConfig();
    if (id === 'equipe') carregarEquipe();
    if (id === 'canais') carregarCanais();
    if (id === 'auditoria') carregarAuditoria();
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

  async function carregarAuditoria() {
    config.auditoriaCarregando = true;
    config.auditoriaErro = null;
    renderConfig();
    try {
      config.auditoria = (await api('/auditoria')).eventos;
    } catch (e) {
      config.auditoriaErro = e.message;
    } finally {
      config.auditoriaCarregando = false;
      renderConfig();
    }
  }

  function renderConfig() {
    if (!config.aberto) return;
    const admin = (estado.resumo?.conta || estado.resumo?.usuario)?.papel === 'admin';

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
    const corpo = { equipe: corpoEquipe, canais: corpoCanaisConfig, auditoria: corpoAuditoria, respostas: corpoRespostasConfig, aparencia: corpoAparencia }[config.secao];
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
      return `${ativos} atendente${ativos === 1 ? '' : 's'} ativo${ativos === 1 ? '' : 's'}`;
    }
    if (config.secao === 'canais') {
      const d = config.canais;
      if (!d) return 'WhatsApp, Telegram e o chat do site.';
      const total = d.canais.length + 1; // +1 = o chat do site
      const ligados = d.canais.filter((c) => c.status === 'connected').length + (estado.resumo?.widgetAtivo ? 1 : 0);
      const livres = total - ligados;
      const partes = [`${ligados} ${ligados === 1 ? 'canal conectado' : 'canais conectados'}`];
      if (livres > 0) partes.push(`${livres} ${livres === 1 ? 'disponível' : 'disponíveis'}`);
      return partes.join(' · ');
    }
    if (config.secao === 'auditoria') return 'Registro de segurança das ações dos atendentes.';
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

    return [el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca cabeca-com-acao' },
        el('div', {}, el('span', { class: 'rotulo' }, 'Atendentes'), el('span', { class: 'dica' }, 'Cada pessoa vê as caixas das equipes em que está.')),
        estado.resumo?.cadastroAtendenteAtivo
          ? el('button', { type: 'button', class: 'btn-primario pequeno', onclick: adicionarAtendente }, icone('mais', ICONE.mais), 'Adicionar atendente')
          : desligar(el('button', { type: 'button', class: 'btn-primario pequeno' }, icone('mais', ICONE.mais), 'Adicionar atendente'), 'Cadastro de atendentes temporariamente bloqueado')),
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, ...d.usuarios.map((u) => linhaPessoa(u, d.equipes))))];
  }

  function linhaPessoa(u, equipes) {
    const eu = u.id === estado.resumo?.usuario?.id;
    const ehConta = u.id === estado.resumo?.conta?.id;
    const fase = u.estadoHorario?.fase;
    const pausado = u.presenca === 'online' && ['pausa', 'retorno', 'fora'].includes(fase);
    const presenca = !u.ativo ? 'bloqueado' : u.presenca !== 'online' ? 'offline'
      : fase === 'pausa' ? 'em pausa' : fase === 'retorno' ? 'aguardando retorno' : fase === 'fora' ? 'fora do expediente' : 'online';
    const classePresenca = !u.ativo || pausado ? 'aviso' : (u.presenca === 'online' ? '' : 'cinza');
    return el('div', { class: `pessoa${u.ativo ? '' : ' inativa'}` },
      el('span', { class: 'avatar p' }, u.iniciais),
      el('div', { class: 'dados' },
        el('div', { class: 'pessoa-nome-linha' },
          el('span', { class: 'nome' }, u.nome, eu ? ' (você)' : ''),
          el('button', {
            type: 'button', class: 'btn-editar-nome hov', title: `Editar nome de ${u.nome}`,
            'aria-label': `Editar nome de ${u.nome}`, onclick: () => editarNomeDe(u),
          }, svg(ICONE.lapisPequeno))),
        el('span', { class: 'email' }, u.email || 'Perfil de atendimento · usa o login da equipe'),
        el('span', { class: `horario-resumo${u.horario ? '' : ' vazio'}` }, u.horario
          ? `Atendimento ${u.horario.inicio}–${u.horario.fim} · pausa ${u.horario.pausaInicio}–${u.horario.pausaFim}`
          : 'Horário de atendimento não definido')),
      el('div', { class: 'equipes' }, ...(u.equipes.length
        ? u.equipes.map((e) => el('span', { class: 'selo-equipe' }, el('span', { class: 'ponto', style: `background:${e.cor}` }), e.nome))
        : [el('span', { class: 'dica' }, 'sem equipe')])),
      el('select', {
        class: 'papel', 'aria-label': `Papel de ${u.nome}`, disabled: ehConta ? 'disabled' : null,
        title: u.podeLogar ? null : 'Perfil de administrador: pede a senha do administrador ao ser escolhido no login',
        onchange: (ev) => salvarPessoa(u.id, { papel: ev.target.value }),
      }, ...['atendente', 'admin'].map((v) => el('option', { value: v, selected: u.papel === v ? 'selected' : null }, v === 'admin' ? 'Administrador' : 'Atendente'))),
      el('span', { class: `selo-presenca ${classePresenca}`.trim() }, presenca),
      el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => editarHorarioDe(u) }, 'Horário'),
      el('button', {
        type: 'button', class: 'btn-icone hov', title: u.ativo ? 'Bloquear o acesso' : 'Liberar o acesso',
        disabled: eu || ehConta ? 'disabled' : null,
        onclick: () => salvarPessoa(u.id, { ativo: !u.ativo }),
      }, svg(u.ativo ? ICONE.cadeado : ICONE.check)),
      el('button', { type: 'button', class: 'btn-contorno hov', onclick: () => editarEquipesDe(u, equipes) }, 'Equipes'),
      el('button', {
        type: 'button', class: 'btn-icone perigo hov', title: `Excluir ${u.nome}`, 'aria-label': `Excluir ${u.nome}`,
        disabled: eu || ehConta ? 'disabled' : null,
        onclick: () => excluirPessoa(u),
      }, svg(ICONE.lixeira)));
  }

  // Exclui um atendente (só administrador). Ele some das listas; o histórico
  // das conversas continua mostrando o nome dele.
  async function excluirPessoa(u) {
    const confirmado = await confirmarNoSite({
      titulo: `Excluir ${u.nome}?`,
      texto: 'O atendente sai da equipe e de todas as listas, e o acesso dele é encerrado. As mensagens que ele enviou continuam no histórico com o nome dele.',
      rotuloConfirmar: 'Excluir atendente',
    });
    if (!confirmado) return;
    try {
      await api(`/equipe/usuarios/${u.id}`, { method: 'DELETE' });
      await Promise.all([carregarEquipe(), carregarResumo()]);
      toast(`${u.nome} foi excluído da equipe.`);
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  function editarHorarioDe(u) {
    const padrao = u.horario || { inicio: '09:00', pausaInicio: '12:00', pausaFim: '13:00', fim: '18:00' };
    const erro = el('span', { class: 'dica erro-texto', 'aria-live': 'polite' });
    const campos = [
      ['inicio', 'Início do atendimento'],
      ['pausaInicio', 'Início da pausa'],
      ['pausaFim', 'Retorno da pausa'],
      ['fim', 'Fim do atendimento'],
    ].map(([chave, rotulo]) => {
      const input = el('input', { type: 'time', value: padrao[chave], required: 'required', 'aria-label': rotulo });
      return { chave, input, elemento: el('label', { class: 'config-campo' }, el('span', {}, rotulo), input) };
    });
    let salvando = false;
    const fundo = el('div', { class: 'modal-fundo', onclick: (ev) => { if (ev.target === fundo && !salvando) fundo.remove(); } });
    const cancelar = el('button', { type: 'button', class: 'btn-suave hov', onclick: () => fundo.remove() }, 'Cancelar');
    const remover = el('button', { type: 'button', class: 'btn-suave perigo hov', hidden: u.horario ? null : 'hidden' }, 'Remover horário');
    const salvar = el('button', { type: 'button', class: 'btn-primario' }, 'Salvar horário');

    async function concluir(horario) {
      if (salvando) return;
      salvando = true;
      salvar.disabled = true;
      cancelar.disabled = true;
      remover.disabled = true;
      erro.textContent = '';
      try {
        const resultado = await api(`/equipe/usuarios/${u.id}`, { method: 'PATCH', body: { horario } });
        const salvo = resultado.usuario?.horario;
        if (salvo === undefined || (horario ? !Object.keys(horario).every((chave) => salvo?.[chave] === horario[chave]) : salvo !== null)) {
          throw new Error('O servidor ainda não confirmou os horários. Atualize a página e tente novamente.');
        }
        fundo.remove();
        await Promise.all([carregarEquipe(), carregarResumo()]);
        toast(horario ? 'Horário atualizado.' : 'Horário removido.');
      } catch (e) {
        salvando = false;
        salvar.disabled = false;
        cancelar.disabled = false;
        remover.disabled = false;
        erro.textContent = e.message;
      }
    }

    salvar.addEventListener('click', () => concluir(Object.fromEntries(campos.map((campo) => [campo.chave, campo.input.value]))));
    remover.addEventListener('click', () => concluir(null));
    fundo.append(el('div', { class: 'modal modal-horario', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `horario-${u.id}` },
      el('div', { class: 'modal-corpo' },
        el('div', { class: 'modal-cab' },
          el('span', { class: 'modal-horario-icone', 'aria-hidden': 'true' }, svg(ICONE.relogio)),
          el('div', {}, el('h2', { id: `horario-${u.id}` }, `Horário de ${u.nomeCurto || u.nome}`), el('p', {}, 'De segunda a sexta, no horário de Brasília.')),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: () => fundo.remove() }, svg(ICONE.fechar))),
        el('p', { class: 'dica horario-ajuda' }, 'Configure quem atende o Chat do site. O aviso de pausa só aparece para o cliente quando não houver outro atendente em expediente. Contas sem horário não entram nesse cálculo; as mensagens continuam sendo recebidas.'),
        el('div', { class: 'horario-campos' }, ...campos.map((campo) => campo.elemento)),
        erro,
        el('div', { class: 'modal-acoes horario-acoes' }, remover, cancelar, salvar))));
    document.body.append(fundo);
    campos[0].input.focus();
  }

  function adicionarAtendente() {
    const erro = el('span', { class: 'dica erro-texto', 'aria-live': 'polite' });
    const campo = el('input', {
      type: 'text', maxlength: '120', autocomplete: 'name', placeholder: 'Nome completo',
      'aria-label': 'Nome do novo atendente',
    });
    const fundo = el('div', { class: 'modal-fundo', onclick: (ev) => { if (ev.target === fundo) fundo.remove(); } });
    let salvando = false;
    const cancelar = el('button', { type: 'button', class: 'btn-suave hov', onclick: () => fundo.remove() }, 'Cancelar');
    const salvar = el('button', { type: 'button', class: 'btn-primario' }, 'Adicionar atendente');

    async function concluir() {
      if (salvando) return;
      const nome = campo.value.trim().replace(/\s+/g, ' ');
      if (nome.length < 2) {
        erro.textContent = 'Digite um nome com pelo menos 2 caracteres.';
        campo.focus();
        return;
      }
      salvando = true;
      salvar.disabled = true;
      cancelar.disabled = true;
      erro.textContent = '';
      try {
        await api('/equipe/usuarios', {
          method: 'POST', body: { nome, equipeIds: estado.equipeId ? [estado.equipeId] : [] },
        });
        fundo.remove();
        if (config.aberto && config.secao === 'equipe') await carregarEquipe();
        await carregarResumo();
        toast(`${nome} foi adicionado à equipe.`);
      } catch (e) {
        salvando = false;
        salvar.disabled = false;
        cancelar.disabled = false;
        erro.textContent = e.message;
        campo.focus();
      }
    }

    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') fundo.remove();
      if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); concluir(); }
    });
    salvar.addEventListener('click', concluir);
    fundo.append(el('div', { class: 'modal editar-nome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'adicionar-atendente-titulo' },
      el('div', { class: 'modal-corpo' },
        el('div', { class: 'modal-cab' },
          el('div', {}, el('h2', { id: 'adicionar-atendente-titulo' }, 'Adicionar atendente'), el('p', {}, 'A pessoa aparecerá na escolha após o próximo login. Não é necessário criar outra senha.')),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: () => fundo.remove() }, svg(ICONE.fechar))),
        el('label', { class: 'config-campo' }, el('span', {}, 'Nome do atendente'), campo, erro),
        el('div', { class: 'modal-acoes' }, cancelar, salvar))));
    document.body.append(fundo);
    campo.focus();
  }

  function editarNomeDe(u) {
    const erro = el('span', { class: 'dica erro-texto', 'aria-live': 'polite' });
    const campo = el('input', {
      type: 'text', value: u.nome, maxlength: '120', autocomplete: 'name',
      'aria-label': 'Nome do atendente',
    });
    const fundo = el('div', { class: 'modal-fundo', onclick: (ev) => { if (ev.target === fundo) fundo.remove(); } });
    let salvando = false;
    const cancelar = el('button', { type: 'button', class: 'btn-suave hov', onclick: () => fundo.remove() }, 'Cancelar');
    const salvar = el('button', { type: 'button', class: 'btn-primario' }, 'Salvar nome');

    async function concluir() {
      if (salvando) return;
      const nome = campo.value.trim().replace(/\s+/g, ' ');
      if (nome.length < 2) {
        erro.textContent = 'Digite um nome com pelo menos 2 caracteres.';
        campo.focus();
        return;
      }
      salvando = true;
      salvar.disabled = true;
      cancelar.disabled = true;
      erro.textContent = '';
      try {
        await api(`/equipe/usuarios/${u.id}`, { method: 'PATCH', body: { nome } });
        fundo.remove();
        await carregarEquipe();
        await carregarResumo();
        toast('Nome atualizado.');
      } catch (e) {
        salvando = false;
        salvar.disabled = false;
        cancelar.disabled = false;
        erro.textContent = e.message;
        campo.focus();
      }
    }

    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') fundo.remove();
      if (ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        concluir();
      }
    });
    salvar.addEventListener('click', concluir);
    fundo.append(el('div', { class: 'modal editar-nome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `editar-nome-${u.id}` },
      el('div', { class: 'modal-corpo' },
        el('div', { class: 'modal-cab' },
          el('div', {}, el('h2', { id: `editar-nome-${u.id}` }, 'Editar nome'), el('p', {}, 'Altere como este atendente aparece no atendimento.')),
          el('button', { type: 'button', class: 'btn-icone hov', title: 'Fechar', onclick: () => fundo.remove() }, svg(ICONE.fechar))),
        el('label', { class: 'config-campo' }, el('span', {}, 'Nome do atendente'), campo, erro),
        el('div', { class: 'modal-acoes' }, cancelar, salvar))));
    document.body.append(fundo);
    campo.focus();
    campo.select();
  }

  /* ---------------- Configurações › Auditoria ---------------- */
  function corpoAuditoria() {
    if (config.auditoriaCarregando && !config.auditoria) return [el('div', { class: 'config-vazio' }, 'Carregando auditoria…')];
    if (config.auditoriaErro) return [el('div', { class: 'aviso erro' }, config.auditoriaErro)];
    const eventos = config.auditoria || [];

    return [el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, `Atividades recentes · ${eventos.length}`),
        el('span', { class: 'dica' }, 'Histórico automático e somente para leitura. Os registros não aparecem mais como notas da conversa.')),
      eventos.length
        ? el('div', { class: 'auditoria-lista' }, ...eventos.map((evento) => {
          const quando = new Date(evento.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
          const canal = NOME_CANAL[evento.conversa?.canal] || evento.conversa?.canal || 'Canal não informado';
          return el('div', { class: 'auditoria-item' },
            el('span', { class: 'auditoria-icone' }, svg(ICONE.olho)),
            el('div', { class: 'auditoria-dados' },
              el('strong', {}, evento.descricao),
              el('span', {}, `${evento.usuario?.nome || 'Atendente removido'}${evento.usuario?.email ? ` · ${evento.usuario.email}` : ''}`)),
            el('div', { class: 'auditoria-alvo' },
              el('strong', {}, evento.contato?.nome || 'Cliente não informado'),
              el('span', {}, `${evento.conversa?.protocolo ? `Protocolo ${evento.conversa.protocolo} · ` : ''}${canal}`)),
            el('time', { datetime: new Date(evento.criadoEm).toISOString(), title: quando }, quando));
        }))
        : el('div', { class: 'config-vazio' }, 'Nenhuma ação auditável registrada ainda.'))];
  }

  // Copia o PIN e avisa, para o atendente colar onde precisar.
  function copiarPin(valor) {
    const pin = String(valor || '').trim();
    if (!pin) return;
    navigator.clipboard?.writeText(pin)
      .then(() => toast(`PIN ${pin} copiado.`))
      .catch(() => toast('Não consegui copiar. Selecione o número e use Ctrl+C.'));
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

  /* ---------------- Configurações › Respostas rápidas ---------------- */

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
              el('span', { class: 'email', title: textoDaRespostaRapida(rr) }, textoDaRespostaRapida(rr))),
            el('span', { class: 'papel' }, quemVe(rr)),
            el('span', { class: 'selo-presenca cinza' }, rr.usos ? `${rr.usos} uso${rr.usos === 1 ? '' : 's'}` : 'não usada'),
            rr.dinamica
              ? el('span', { class: 'dica' }, 'fixa')
              : rr.podeEditar
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
   * Canais (WhatsApp via uazapi, Telegram e o chat do site)
   *
   * Tudo isso mora dentro de Configurações › Canais. Antes era uma janela
   * flutuante; agora é página, para caber a lista de canais e o bloco de
   * "Novo número de WhatsApp" na mesma tela, sem tapar o atendimento.
   * ============================================================== */
  let sondagem = null;
  const conexao = { canalId: null, modo: 'qr', qrcode: null, paircode: null, telefone: '', status: null, erro: null, ocupado: false };

  function pararSondagem() {
    clearInterval(sondagem);
    sondagem = null;
  }

  function naPaginaDeCanais() {
    return config.aberto && config.secao === 'canais';
  }

  // Primeira carga da página: mostra "Carregando…" enquanto busca.
  async function carregarCanais() {
    config.canaisCarregando = true;
    config.canaisErro = null;
    renderConfig();
    try {
      config.canais = await api('/canais');
    } catch (e) {
      config.canaisErro = e.message;
    } finally {
      config.canaisCarregando = false;
      renderConfig();
    }
  }

  // Recargas seguintes: busca de novo e redesenha sem piscar a tela.
  async function renderCanais() {
    if (!naPaginaDeCanais()) return;
    try {
      config.canais = await api('/canais');
      config.canaisErro = null;
    } catch (e) {
      config.canaisErro = e.message;
    }
    renderConfig();
  }

  function formatarPair(codigo) {
    const c = String(codigo || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : (codigo || '');
  }

  function corpoCanaisConfig() {
    if (config.canaisCarregando && !config.canais) return [el('div', { class: 'config-vazio' }, 'Carregando…')];
    if (config.canaisErro && !config.canais) return [el('div', { class: 'aviso erro' }, config.canaisErro)];
    const d = config.canais;
    if (!d) return [el('div', { class: 'config-vazio' }, 'Nada por aqui.')];

    const whats = d.canais.filter((c) => c.tipo !== 'telegram');
    const bots = d.canais.filter((c) => c.tipo === 'telegram');

    const partes = [el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, 'Canais de mensagem'),
        el('span', { class: 'dica' }, 'Todos podem ficar ligados ao mesmo tempo: as conversas chegam na mesma caixa, com o selo do canal no avatar.')),
      config.canaisErro ? el('div', { class: 'aviso erro' }, config.canaisErro) : null,
      d.configurado ? null : el('div', { class: 'aviso erro' }, 'Servidor do WhatsApp não configurado. Preencha UAZAPI_URL e UAZAPI_ADMIN_TOKEN no arquivo .env e reinicie o sistema.'),
      el('div', { class: 'lista-canais' },
        ...whats.map(cartaoCanal),
        ...bots.map(cartaoCanal),
        cartaoChatDoSite()))];

    if (d.configurado) partes.push(blocoNovoWhatsapp());
    if (d.telegram) partes.push(blocoNovoTelegram());
    return partes;
  }

  function selo(texto, ok) {
    return el('span', { class: `estado-canal${ok ? ' ok' : ''}` }, el('span', { class: 'bolinha' }), texto);
  }

  function alternarGerenciar(id) {
    config.canalAberto = config.canalAberto === id ? null : id;
    config.eventosDoCanal = null;
    renderConfig();
  }

  function cartaoCanal(c) {
    const tg = c.tipo === 'telegram';
    const conectado = c.status === 'connected';
    const rotulo = conectado
      ? (tg && c.recebendo === false ? 'conectado · aguardando reinício' : 'conectado')
      : (c.status === 'connecting' ? 'conectando…' : 'desconectado');
    const detalhes = [c.numeroFormatado, c.perfil && c.perfil !== c.nome ? c.perfil : null].filter(Boolean).join(' · ')
      || (tg ? 'bot do Telegram' : 'nenhum número conectado ainda');
    const aberto = config.canalAberto === c.id;
    const conectando = conexao.canalId === c.id;
    const eventos = config.eventosDoCanal?.canalId === c.id ? config.eventosDoCanal.itens : null;

    const cartao = el('div', { class: `cartao-canal${aberto || conectando || eventos ? ' aberto' : ''}` },
      el('div', { class: 'linha-canal' },
        el('span', { class: `marca-canal ${tg ? 'telegram' : 'whatsapp'}` }, iconeCanal(tg ? 'telegram' : 'whatsapp', 22)),
        el('div', { class: 'quem-canal' },
          el('div', { class: 'nome-linha' }, el('span', { class: 'nome-canal' }, c.nome), selo(rotulo, conectado)),
          el('span', { class: 'sub-canal' }, detalhes)),
        el('div', { class: 'acoes-canal' },
          conectado ? null : el('button', { type: 'button', class: 'btn-primario pequeno', onclick: () => (tg ? acaoCanal(c.id, 'conectar') : iniciarConexao(c.id, 'qr')) }, tg ? 'Conectar' : 'Gerar QR Code'),
          el('button', { type: 'button', class: 'btn-branco pequeno hov', onclick: () => alternarGerenciar(c.id) }, aberto ? 'Fechar' : 'Gerenciar'))));

    if (conectando) cartao.append(painelConexao(c));
    if (eventos) cartao.append(listaDeEventos(c, eventos));
    else if (aberto) cartao.append(painelGerenciar(c, tg));
    return cartao;
  }

  function painelGerenciar(c, tg) {
    return el('div', { class: 'gerenciar-canal' },
      c.ultimoErro ? el('div', { class: 'canal-aviso' }, `Último erro: ${c.ultimoErro}`) : null,
      c.webhookAviso ? el('div', { class: 'canal-aviso' }, c.webhookAviso) : null,
      el('div', { class: 'botoes-gerenciar' },
        c.status === 'connected'
          ? el('button', { type: 'button', class: 'btn-suave hov', onclick: () => acaoCanal(c.id, 'desconectar') }, 'Desconectar')
          : null,
        tg ? null : el('button', { type: 'button', class: 'btn-suave hov', title: 'Reenviar a configuração do webhook ao servidor do WhatsApp', onclick: () => acaoCanal(c.id, 'webhook') }, 'Reconfigurar webhook'),
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => verEventos(c) }, 'Ver eventos'),
        el('button', { type: 'button', class: 'btn-suave hov perigo', onclick: () => excluirCanal(c) }, 'Excluir canal')),
      el('div', { class: 'canal-nota' }, tg
        ? 'As mensagens enviadas ao bot chegam aqui automaticamente, sem precisar de endereço público.'
        : `Endereço que recebe as mensagens: ${c.webhookUrl}`));
  }

  // O chat do site não é um canal cadastrado: liga ou desliga pelo WIDGET_SEGREDO
  // do servidor. Aqui ele aparece junto dos outros para a pessoa ver tudo de uma vez.
  function cartaoChatDoSite() {
    const ativo = Boolean(estado.resumo?.widgetAtivo);
    const aberto = config.canalAberto === 'widget';
    const cartao = el('div', { class: `cartao-canal${aberto ? ' aberto' : ''}` },
      el('div', { class: 'linha-canal' },
        el('span', { class: 'marca-canal site' }, svg(ICONE.tela)),
        el('div', { class: 'quem-canal' },
          el('div', { class: 'nome-linha' }, el('span', { class: 'nome-canal' }, 'Chat do site'), selo(ativo ? 'ligado' : 'desligado', ativo)),
          el('span', { class: 'sub-canal' }, ativo ? 'bolha de conversa no rodapé do seu site' : 'ainda não configurado no servidor')),
        el('div', { class: 'acoes-canal' },
          el('button', { type: 'button', class: 'btn-branco pequeno hov', onclick: () => alternarGerenciar('widget') }, aberto ? 'Fechar' : 'Gerenciar'))));
    if (aberto) cartao.append(painelChatDoSite(ativo));
    return cartao;
  }

  function painelChatDoSite(ativo) {
    const trecho = `<script src="${location.origin}/widget.js" defer><\/script>`;
    return el('div', { class: 'gerenciar-canal' },
      ativo
        ? null
        : el('div', { class: 'canal-aviso' }, 'Desligado: falta o WIDGET_SEGREDO no arquivo .env do servidor. Sem ele o chat do site não abre para ninguém.'),
      el('div', { class: 'novo-canal-ajuda' },
        el('strong', {}, 'Para colocar no site:'),
        el('ol', {},
          el('li', {}, 'Copie a linha abaixo.'),
          el('li', {}, 'Cole antes de </body> em todas as páginas do site.'),
          el('li', {}, 'A bolha aparece no canto de baixo à direita.'))),
      el('div', { class: 'evento-item' }, trecho),
      el('div', { class: 'botoes-gerenciar' },
        el('button', { type: 'button', class: 'btn-suave hov', onclick: async () => {
          try {
            await navigator.clipboard.writeText(trecho);
            toast('Linha copiada.');
          } catch {
            toast('Não deu para copiar aqui. Selecione o texto e copie à mão.', 5000);
          }
        } }, 'Copiar a linha')),
      el('div', { class: 'canal-nota' }, 'As conversas do site chegam na mesma caixa, com o selo de monitor no avatar.'));
  }

  /* ---------------- novo WhatsApp e novo bot do Telegram ---------------- */
  function blocoNovoWhatsapp() {
    const nome = el('input', { type: 'text', placeholder: 'Ex.: WhatsApp principal', maxlength: '60', 'aria-label': 'Nome do canal' });
    const cor = el('input', { type: 'color', value: '#12B85C', 'aria-label': 'Cor do avatar dos clientes deste canal', title: 'Escolher cor do avatar' });
    const tel = el('input', { type: 'tel', placeholder: '55 11 98842-1075', 'aria-label': 'Número com DDD (opcional)' });
    const botao = el('button', { type: 'button', class: 'btn-primario', onclick: async () => {
      botao.disabled = true;
      try {
        const { canal } = await api('/canais', { method: 'POST', body: { nome: nome.value.trim() || 'WhatsApp', cor: cor.value } });
        const numero = tel.value.trim();
        config.canalAberto = null;
        config.eventosDoCanal = null;
        if (numero && numero.replace(/\D/g, '').length >= 10) await iniciarConexao(canal.id, 'numero', numero);
        else await iniciarConexao(canal.id, 'qr');
      } catch (e) {
        toast(e.message, 5000);
      } finally {
        botao.disabled = false;
      }
    } }, 'Gerar QR Code');
    nome.addEventListener('keydown', (e) => { if (e.key === 'Enter') botao.click(); });
    tel.addEventListener('keydown', (e) => { if (e.key === 'Enter') botao.click(); });

    return el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, 'Novo número de WhatsApp'),
        el('span', { class: 'dica' }, 'A conexão é feita lendo o QR Code no aplicativo do número. Se preferir digitar um código no celular, preencha o número aqui.')),
      el('div', { class: 'linha-campos' },
        el('label', { class: 'campo-canal' }, el('span', {}, 'Nome do canal'), nome),
        el('label', { class: 'campo-canal cor-avatar' }, el('span', {}, 'Cor do avatar'), cor),
        el('label', { class: 'campo-canal estreito' }, el('span', {}, 'Número com DDD (opcional)'), tel),
        botao));
  }

  function blocoNovoTelegram() {
    const input = el('input', { type: 'text', placeholder: '123456789:AAF…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Token do bot do Telegram' });
    const botao = el('button', { type: 'button', class: 'btn-primario', onclick: async () => {
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

    return el('div', { class: 'config-bloco' },
      el('div', { class: 'cabeca' },
        el('span', { class: 'rotulo' }, 'Novo bot do Telegram'),
        el('span', { class: 'dica' }, 'Aqui não tem QR Code: o Telegram usa um token que o @BotFather entrega para você.')),
      el('div', { class: 'linha-campos' },
        el('label', { class: 'campo-canal' }, el('span', {}, 'Token do bot'), input),
        botao),
      el('div', { class: 'novo-canal-ajuda' },
        el('strong', {}, 'Como criar o bot (leva 1 minuto):'),
        el('ol', {},
          el('li', {}, 'No Telegram, abra o @BotFather e envie /newbot.'),
          el('li', {}, 'Escolha um nome (ex.: Bigteck Atendimento) e um usuário terminado em "bot".'),
          el('li', {}, 'Copie o token que ele mostra e cole no campo acima. Depois, divulgue o @usuário do bot para os clientes.'))));
  }

  /* ---------------- ações em um canal ---------------- */
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
      if (config.canalAberto === c.id) config.canalAberto = null;
      config.eventosDoCanal = null;
      toast('Canal excluído.');
      await renderCanais();
      carregarResumo().catch(() => {});
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async function verEventos(c) {
    try {
      const { eventos } = await api(`/canais/${c.id}/eventos`);
      config.canalAberto = c.id;
      config.eventosDoCanal = { canalId: c.id, itens: eventos };
      renderConfig();
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  function listaDeEventos(c, eventos) {
    const lista = el('div', { class: 'eventos-lista' }, ...eventos.map((e) => el('div', { class: 'evento-item' },
      el('span', { class: 'm' }, `${new Date(e.recebidoEm).toLocaleString('pt-BR')} · ${e.tipo || 'sem tipo'}`),
      typeof e.corpo === 'string' ? e.corpo : JSON.stringify(e.corpo, null, 1).slice(0, 1500))));
    if (!eventos.length) lista.append(el('div', { class: 'vazio' }, 'Nenhum evento recebido ainda. Quando alguém mandar mensagem para este canal, o evento aparece aqui.'));
    return el('div', { class: 'gerenciar-canal' },
      el('div', { class: 'canal-nota' }, 'Últimos 50 avisos que este canal entregou ao CRM. Serve para descobrir por que uma mensagem não chegou.'),
      lista,
      el('div', { class: 'botoes-gerenciar' },
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => { config.eventosDoCanal = null; renderConfig(); } }, '← Voltar')));
  }

  /* ---------------- conectar o WhatsApp (QR code ou código) ---------------- */
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
    if (!conexao.canalId || !naPaginaDeCanais()) return pararSondagem();
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
        if (painel) painel.replaceWith(painelConexao(r.canal || { id: conexao.canalId, nome: '' }));
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
            el('button', { type: 'button', class: 'btn-primario pequeno', onclick: () => {
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
          el('button', { type: 'button', class: `aba${!modoQr ? ' ativa' : ''}`, onclick: () => { pararSondagem(); Object.assign(conexao, { modo: 'numero', paircode: null, status: null, erro: null }); renderConfig(); } }, 'Digitar número')),
        el('button', { type: 'button', class: 'btn-suave hov', onclick: () => { pararSondagem(); conexao.canalId = null; renderConfig(); } }, 'Fechar')),
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

    $('#btn-filtros').addEventListener('click', abrirMenuNotificacoes);
    // O que ainda não funciona fica desligado, sem responder ao clique.
    document.querySelectorAll('.rail-btn[data-modulo]').forEach((b) => desligar(b, `${b.dataset.modulo}: em breve`));

    $('#btn-config').addEventListener('click', () => (config.aberto ? fecharConfiguracoes() : abrirConfiguracoes()));
    document.querySelector('.rail-btn[title="Atendimento"]')?.addEventListener('click', fecharConfiguracoes);

    const menuUsuario = $('#menu-usuario');
    $('#btn-usuario').addEventListener('click', (e) => {
      e.stopPropagation();
      menuUsuario.hidden = !menuUsuario.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!menuUsuario.hidden && !menuUsuario.contains(e.target)) menuUsuario.hidden = true;
      if (!e.target.closest('.menu-flutuante')) fecharMenus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { fecharVisor(); fecharRapidas(); menuUsuario.hidden = true; fecharMenus(); $('#painel').classList.remove('aberto'); }
    });
    window.addEventListener('pagehide', encerrarPresenca);
    window.addEventListener('pageshow', (e) => { if (e.persisted) sinalizarPresenca().then(carregarResumo).catch(() => {}); });
  }

  async function iniciar() {
    montarIcones();
    ligarEventos();
    try {
      await sinalizarPresenca();
      await carregarResumo();
      await carregarConversas({ selecionarPrimeira: true });
      alertasAtivos = true;
    } catch (e) {
      toast(e.message);
      // O skeleton das colunas não pode ficar "carregando" para sempre.
      document.querySelectorAll('.esqueleto, .somente-leitor').forEach((no) => no.remove());
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
    setInterval(() => sinalizarPresenca().catch(() => {}), 20_000);
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
    fluxo.onmessage = (mensagemEvento) => {
      let evento = null;
      try { evento = JSON.parse(mensagemEvento.data); } catch { /* aviso antigo */ }
      if (evento?.origem === 'exclusao'
        && Number(evento.conversaId) === Number(estado.conversa?.id)
        && Number.isInteger(Number(evento.mensagemId))) {
        estado.conversa.mensagens = estado.conversa.mensagens.filter((m) => Number(m.id) !== Number(evento.mensagemId));
        aplicarConversa(estado.conversa);
      }
      // Várias mensagens seguidas viram uma única atualização.
      clearTimeout(pendente);
      pendente = setTimeout(atualizarSilencioso, 120);
    };
    // O EventSource reconecta sozinho; só registra para não passar em silêncio.
    fluxo.onerror = () => { /* reconecta sozinho */ };
  }

  iniciar();
})();
