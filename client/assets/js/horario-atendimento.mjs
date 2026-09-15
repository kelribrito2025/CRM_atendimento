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

const CAFE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h12v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a3 3 0 0 1 0 6h-2M7 5l1-2M12 5l1-2"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 4 12 8-12 8z"/></svg>';
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
    caixa.append(icone(fim ? RELOGIO : pausa ? CAFE : PLAY, 'jornada-icone'), titulo, descricao);
    let numeros = null;
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
    fundo.append(caixa);
    const foco = document.activeElement;
    const teclado = (ev) => {
      if (ev.key === 'Tab') { ev.preventDefault(); botao.focus(); }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); if (informativo) botao.click(); }
    };
    modal = { chave, fundo, foco, teclado, numeros };
    document.body.append(fundo);
    document.addEventListener('keydown', teclado, true);
    botao.focus();
    atualizarNumeros();
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
