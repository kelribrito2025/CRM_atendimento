import { CAFE, HEADSET, FIM } from './ilustracoes-jornada.mjs';

// Relógio apenas visual: cada transição consulta o servidor. Sem decrementar um
// contador local (que atrasaria em abas suspensas) e sem requisições a cada segundo.
export function contagemRegressiva(destino, agora) {
  const segundos = Math.max(0, Math.ceil((Number(destino) - Number(agora)) / 1000));
  if (!Number.isFinite(segundos)) return '00:00';
  return `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;
}

export function faseDoModal(horario) {
  if (!horario?.configurado) return null;
  if (['pausa', 'retorno'].includes(horario.fase)) return horario.fase;
  return horario.fase === 'fora' && Number(horario.encerrouEm) > 0 ? 'fim' : null;
}

const RELOGIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const SINO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4"/></svg>';

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  elemento.className = classe || '';
  if (texto != null) elemento.textContent = texto;
  return elemento;
}
function icone(markup, classe) {
  const elemento = criar('span', classe);
  elemento.setAttribute('aria-hidden', 'true');
  elemento.innerHTML = markup; // Somente SVGs constantes, nenhum dado externo.
  return elemento;
}

export function criarAvisosHorario({ api, recarregar }) {
  let resumo = null;
  let recebidoEm = 0;
  let servidorEm = 0;
  let transicao = null;
  let intervalo = null;
  let modal = null;
  let consultando = false;
  const reconhecidas = new Set();
  const agora = () => servidorEm + (performance.now() - recebidoEm);

  function fechar() {
    clearInterval(intervalo);
    intervalo = null;
    if (modal) {
      modal.fundo.remove();
      document.removeEventListener('keydown', modal.teclado, true);
      if (modal.foco?.isConnected) modal.foco.focus();
      modal = null;
    }
  }

  async function sincronizar() {
    if (consultando) return;
    consultando = true;
    try { await recarregar(); }
    catch {
      clearTimeout(transicao);
      transicao = setTimeout(sincronizar, 8000);
    } finally { consultando = false; }
  }

  function abrir(horario, chave) {
    fechar();
    const pausa = horario.fase === 'pausa';
    const fim = faseDoModal(horario) === 'fim';
    const informativo = pausa || fim;
    const fundo = criar('div', 'modal-fundo fundo-jornada');
    const caixa = criar('section', `modal jornada-modal${fim ? ' fim' : pausa ? '' : ' retorno'}`);
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-modal', 'true');
    caixa.setAttribute('aria-labelledby', 'jornada-titulo');
    caixa.setAttribute('aria-describedby', 'jornada-descricao');
    const titulo = criar('h2', '', fim ? 'Fim do atendimento' : pausa ? 'Hora da pausa' : 'Volta ao trabalho');
    titulo.id = 'jornada-titulo';
    const descricao = criar('p', 'jornada-descricao', pausa
      ? 'Suas conversas continuam na fila da equipe até você voltar.'
      : fim ? `Seu expediente terminou às ${horario.horario.fim}. Suas conversas continuam na fila da equipe.`
        : `Sua pausa terminou às ${horario.horario.pausaFim}. Seu status volta para disponível ao confirmar.`);
    descricao.id = 'jornada-descricao';
    const botao = criar('button', 'btn-primario jornada-acao', informativo ? 'Entendi' : 'Voltar a atender');
    botao.type = 'button';
    const erro = criar('p', 'jornada-erro');
    erro.setAttribute('role', 'alert');
    erro.hidden = true;
    caixa.append(icone(fim ? FIM : pausa ? CAFE : HEADSET, 'jornada-ilustracao'), titulo, descricao);
    let numeros = null;
    let metricas = null;
    if (pausa) {
      const contador = criar('div', 'jornada-tempo');
      const tempo = criar('strong', 'jornada-contagem');
      tempo.setAttribute('role', 'timer');
      tempo.setAttribute('aria-label', 'Tempo restante da pausa');
      const atualizarTempo = () => { tempo.textContent = contagemRegressiva(horario.retornaEm, agora()); };
      atualizarTempo();
      intervalo = setInterval(atualizarTempo, 1000);
      contador.append(tempo, criar('span', '', `Volta às ${horario.horario.pausaFim}`));
      caixa.append(contador);
    } else if (fim) {
      metricas = criar('div', 'jornada-metricas');
      metricas.setAttribute('aria-live', 'polite');
      caixa.append(metricas);
      const proximo = criar('div', 'jornada-tempo');
      proximo.append(criar('span', '', 'Próximo atendimento'),
        criar('strong', 'jornada-proximo', horario.proximoInicioTexto || `às ${horario.horario.inicio}`));
      caixa.append(proximo);
    } else {
      numeros = criar('div', 'jornada-resumo');
      caixa.append(numeros);
    }
    botao.addEventListener('click', async () => {
      if (informativo) {
        reconhecidas.add(chave);
        try { localStorage.setItem(chave, '1'); } catch { /* modo privado */ }
        fechar();
        return;
      }
      botao.disabled = true;
      botao.textContent = 'Voltando…';
      erro.hidden = true;
      try {
        await api('/horario/retornar', { method: 'POST', body: {} });
        fechar();
        await recarregar();
      } catch (e) {
        erro.textContent = e.message;
        erro.hidden = false;
        botao.disabled = false;
        botao.textContent = 'Voltar a atender';
      }
    });
    caixa.append(erro, botao);
    if (fim) {
      const pendencias = criar('button', 'jornada-pendencias', 'Finalizar pendências');
      pendencias.type = 'button';
      pendencias.title = 'Voltar ao chat para finalizar os atendimentos pendentes';
      // Apenas libera a tela para continuar atendendo. Não resolve conversas,
      // não encerra a sessão nem altera o horário configurado.
      pendencias.addEventListener('click', () => botao.click());
      caixa.append(pendencias);
    }
    fundo.append(caixa);
    const foco = document.activeElement;
    const teclado = (ev) => {
      if (ev.key === 'Tab') {
        const controles = [...caixa.querySelectorAll('button:not([disabled])')];
        const indice = controles.indexOf(document.activeElement);
        ev.preventDefault();
        controles[(indice + (ev.shiftKey ? -1 : 1) + controles.length) % controles.length]?.focus();
      }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); if (informativo) botao.click(); }
    };
    modal = { chave, fundo, foco, teclado, numeros };
    document.body.append(fundo);
    document.addEventListener('keydown', teclado, true);
    botao.focus();
    atualizarNumeros();
    if (metricas) carregarMetricas(metricas, chave);
  }

  async function carregarMetricas(alvo, chave) {
    alvo.setAttribute('aria-busy', 'true');
    alvo.replaceChildren(criar('p', 'jornada-metricas-aviso', 'Carregando seu resumo do dia…'));
    try {
      const dados = await api('/horario/metricas');
      if (modal?.chave !== chave || !alvo.isConnected) return;
      const cabecalho = criar('div', 'jornada-metricas-titulo');
      cabecalho.append(criar('span', '', 'Conversas atendidas hoje'), criar('strong', '', dados.conversasAtendidas));
      const canais = criar('div', 'jornada-canais');
      for (const [canal, nome] of [['whatsapp', 'WhatsApp'], ['telegram', 'Telegram'], ['widget', 'Chat do site']]) {
        const card = criar('div', `jornada-canal ${canal}`);
        card.append(criar('span', 'jornada-canal-nome', nome), criar('strong', '', dados.porCanal[canal]));
        canais.append(card);
      }
      const indicadores = criar('div', 'jornada-indicadores');
      for (const [nome, valor, dica] of [
        ['Tempo médio de resposta', formatarTempoMetrica(dados.tempoMedioRespostaMs, true), 'Da primeira mensagem pendente do cliente até a sua resposta bem-sucedida. Notas e falhas não entram.'],
        ['Tempo online no CRM', formatarTempoMetrica(dados.tempoOnlineMs), 'Estimativa pelos sinais de presença, dentro do expediente, sem a pausa e sem duplicar abas. O registro começa nesta atualização; não é ponto eletrônico.'],
      ]) {
        const card = criar('div', 'jornada-indicador');
        card.title = dica;
        card.append(criar('span', '', nome), criar('strong', '', valor));
        indicadores.append(card);
      }
      alvo.replaceChildren(cabecalho, canais, indicadores,
        criar('p', 'jornada-metricas-aviso', 'Somente suas respostas de hoje. Tempo estimado pela presença registrada, descontando a pausa.'));
    } catch {
      if (modal?.chave !== chave || !alvo.isConnected) return;
      const tentar = criar('button', 'btn-contorno pequeno', 'Tentar novamente');
      tentar.type = 'button';
      tentar.addEventListener('click', () => carregarMetricas(alvo, chave));
      alvo.replaceChildren(criar('p', 'jornada-metricas-aviso', 'Não foi possível carregar suas métricas.'), tentar);
    } finally { alvo.removeAttribute('aria-busy'); }
  }

  function atualizarNumeros() {
    if (!modal?.numeros) return;
    const novas = Number(resumo?.retornoPausa?.mensagensNovas) || 0;
    const esperando = Number(resumo?.retornoPausa?.aguardandoDezMin) || 0;
    const linha = (imagem, texto) => {
      const alvo = criar('div', '');
      alvo.append(icone(imagem, ''), criar('span', '', texto));
      return alvo;
    };
    modal.numeros.replaceChildren(
      linha(SINO, `${novas} ${novas === 1 ? 'mensagem nova' : 'mensagens novas'} na sua caixa durante a pausa`),
      linha(RELOGIO, `${esperando} ${esperando === 1 ? 'conversa aguardando' : 'conversas aguardando'} há mais de 10 min`),
    );
  }

  function atualizar(novoResumo) {
    resumo = novoResumo;
    recebidoEm = performance.now();
    servidorEm = Number(resumo.agoraServidor) || Date.now();
    const h = resumo.estadoHorario;
    clearTimeout(transicao);
    if (h?.proximaMudancaEm) {
      transicao = setTimeout(sincronizar, Math.min(2_147_000_000, Math.max(250, h.proximaMudancaEm - agora() + 100)));
    }
    const fase = faseDoModal(h);
    if (!fase) { fechar(); return; }
    const chave = `crm-pausa:${resumo.usuario.id}:${fase}:${h.encerrouEm || h.retornaEm || h.retornoDaPausaEm}`;
    let jaViu = reconhecidas.has(chave);
    try { jaViu ||= localStorage.getItem(chave) === '1'; } catch { /* modo privado */ }
    if (fase !== 'retorno' && jaViu) { fechar(); return; }
    if (modal?.chave !== chave) abrir(h, chave);
    else atualizarNumeros();
  }

  const aoVoltar = () => { if (!document.hidden) sincronizar(); };
  document.addEventListener('visibilitychange', aoVoltar);
  const aoArmazenar = (e) => { if (e.key?.startsWith('crm-pausa:') && resumo) sincronizar(); };
  window.addEventListener('storage', aoArmazenar);
  return {
    atualizar,
    encerrar() {
      clearTimeout(transicao);
      fechar();
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('storage', aoArmazenar);
    },
  };
}

export function formatarTempoMetrica(ms, segundos = false) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0) return '—';
  const total = Math.floor(Number(ms) / 1000);
  if (segundos && total < 60) return `${total}s`;
  const minutos = Math.floor(total / 60);
  if (segundos && minutos < 60) return `${minutos}min ${String(total % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, '0')}min`;
}
