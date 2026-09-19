/* Chat do site — arquivo que o site do cliente inclui em uma linha.
 *
 *   <script src="https://SEU-CRM/widget.js" defer></script>
 *   <script>
 *     window.addEventListener('load', () => {
 *       ChatAtendimento.identificar({
 *         id: '12345',                 // id do usuário logado no seu sistema
 *         nome: 'Carla Menezes',
 *         email: 'carla@empresa.com.br',
 *         pin: '5446',                 // opcional
 *         assinatura: '...'            // gerada no SEU servidor (veja o README)
 *       });
 *     });
 *   </script>
 *
 * Ele só desenha o botão e o quadro; a conversa acontece dentro do quadro,
 * servido pelo próprio CRM. Nenhum dado do cliente passa pelo site.
 */
(function () {
  'use strict';

  const script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  const BASE = new URL(script ? script.src : window.location.href).origin;
  const COR = (script && script.dataset.cor) || '#12B85C';
  const TITULO = (script && script.dataset.titulo) || 'Atendimento';

  let caixa = null;
  let quadro = null;
  let botao = null;
  let aberto = false;
  let pendente = null;
  let pronto = false;
  let naoLidas = 0;

  function estilo(el, regras) {
    Object.assign(el.style, regras);
  }

  function montar() {
    if (caixa) return;
    caixa = document.createElement('div');
    caixa.id = 'chat-atendimento';
    estilo(caixa, { position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483000', fontFamily: 'inherit' });

    quadro = document.createElement('iframe');
    quadro.src = `${BASE}/widget`;
    quadro.title = TITULO;
    quadro.setAttribute('allow', 'clipboard-write; microphone');
    estilo(quadro, {
      width: 'min(384px, calc(100vw - 40px))', height: 'min(600px, calc(100vh - 120px))',
      border: '0', borderRadius: '18px', boxShadow: '0 24px 60px rgba(11, 31, 20, .28)',
      background: '#fff', display: 'none', marginBottom: '12px', opacity: '0',
      transform: 'translateY(12px)', transition: 'opacity .16s ease, transform .16s ease',
    });

    botao = document.createElement('button');
    botao.type = 'button';
    botao.setAttribute('aria-label', TITULO);
    estilo(botao, {
      width: '56px', height: '56px', borderRadius: '50%', border: '0', background: COR, color: '#fff',
      boxShadow: '0 10px 28px rgba(11, 31, 20, .28)', cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', padding: '0',
    });
    botao.innerHTML = marcaBalao();
    botao.addEventListener('click', () => (aberto ? fechar() : abrir()));

    const marca = document.createElement('span');
    estilo(marca, {
      position: 'absolute', top: '-4px', right: '-4px', minWidth: '20px', height: '20px', padding: '0 5px',
      borderRadius: '10px', background: '#E5544A', color: '#fff', fontSize: '11px', fontWeight: '700',
      display: 'none', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff',
    });
    marca.id = 'chat-atendimento-badge';

    const pe = document.createElement('div');
    estilo(pe, { position: 'relative', display: 'flex', justifyContent: 'flex-end' });
    pe.append(botao, marca);
    caixa.append(quadro, pe);
    document.body.append(caixa);

    window.addEventListener('message', receber);
  }

  function marcaBalao() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M20.5 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1120.5 12z"></path>'
      + '<path d="M8.8 10.4h6.4"></path><path d="M8.8 13.8h4.2"></path></svg>';
  }

  function marcaFechar() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
      + '<path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>';
  }

  function abrir() {
    montar();
    aberto = true;
    quadro.style.display = 'block';
    requestAnimationFrame(() => { quadro.style.opacity = '1'; quadro.style.transform = 'none'; });
    botao.innerHTML = marcaFechar();
    zerarNaoLidas();
    enviarParaQuadro({ tipo: 'abrir' });
  }

  function fechar() {
    aberto = false;
    quadro.style.opacity = '0';
    quadro.style.transform = 'translateY(12px)';
    botao.innerHTML = marcaBalao();
    setTimeout(() => { if (!aberto) quadro.style.display = 'none'; }, 160);
  }

  function zerarNaoLidas() {
    naoLidas = 0;
    const marca = document.getElementById('chat-atendimento-badge');
    if (marca) marca.style.display = 'none';
  }

  function mostrarNaoLidas(quantidade) {
    naoLidas = quantidade;
    const marca = document.getElementById('chat-atendimento-badge');
    if (!marca) return;
    marca.textContent = String(quantidade);
    marca.style.display = quantidade > 0 && !aberto ? 'flex' : 'none';
  }

  function enviarParaQuadro(mensagem) {
    if (!quadro?.contentWindow) return;
    if (!pronto) { pendente = pendente || []; pendente.push(mensagem); return; }
    quadro.contentWindow.postMessage(mensagem, BASE);
  }

  function receber(evento) {
    if (evento.origin !== BASE || !evento.data || typeof evento.data !== 'object') return;
    const { tipo, quantidade } = evento.data;
    if (tipo === 'pronto') {
      pronto = true;
      (pendente || []).forEach((m) => quadro.contentWindow.postMessage(m, BASE));
      pendente = null;
    } else if (tipo === 'fechar') {
      fechar();
    } else if (tipo === 'nao-lidas') {
      mostrarNaoLidas(Number(quantidade) || 0);
    }
  }

  const api = {
    // Chame depois que a pessoa estiver logada no seu sistema.
    identificar(dados) {
      montar();
      enviarParaQuadro({ tipo: 'identificar', dados: dados || {} });
      return api;
    },
    abrir() { abrir(); return api; },
    fechar() { fechar(); return api; },
    alternar() { return aberto ? api.fechar() : api.abrir(); },
    // Encerra a conversa neste navegador (use no logout do seu sistema).
    sair() {
      enviarParaQuadro({ tipo: 'sair' });
      zerarNaoLidas();
      return api;
    },
  };

  window.ChatAtendimento = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
