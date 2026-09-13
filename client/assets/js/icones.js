// Ícones da interface.
//
// Os ícones do Iconly ficam em client/public/icones/ (servidos em /icones/):
//   nome.svg  -> versão estática, usada em toda a interface
//   nome.json -> versão animada (Lottie), usada no menu lateral e no botão Enviar
// Se um arquivo não existir, o ícone padrão desenhado no código continua sendo usado.

const BASE = '/icones';
let manifesto = null;
let carregandoManifesto = null;
const cacheSvg = new Map();

function carregarManifesto() {
  if (manifesto) return Promise.resolve(manifesto);
  if (!carregandoManifesto) {
    carregandoManifesto = fetch(`${BASE}/manifesto`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { svg: [], json: [] }))
      .catch(() => ({ svg: [], json: [] }))
      .then((d) => {
        manifesto = { svg: new Set(d.svg || []), json: new Set(d.json || []) };
        return manifesto;
      });
  }
  return carregandoManifesto;
}

// Deixa o SVG do Iconly herdar a cor do texto ao redor e o tamanho do contêiner.
function normalizar(texto) {
  const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return null;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.querySelectorAll('title, desc').forEach((el) => el.remove());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.querySelectorAll('[stroke]').forEach((el) => {
    if (el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', 'currentColor');
  });
  svg.querySelectorAll('[fill]').forEach((el) => {
    const fill = el.getAttribute('fill');
    if (fill && fill !== 'none') el.setAttribute('fill', 'currentColor');
  });
  svg.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  return svg.outerHTML;
}

async function obterSvg(nome) {
  const m = await carregarManifesto();
  if (!m.svg.has(nome)) return null;
  if (!cacheSvg.has(nome)) {
    cacheSvg.set(nome, fetch(`${BASE}/${nome}.svg`)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => (t ? normalizar(t) : null))
      .catch(() => null));
  }
  return cacheSvg.get(nome);
}

function animar(span, nome) {
  const lottie = window.lottie;
  if (!lottie || !manifesto || !manifesto.json.has(nome)) return;
  const estatico = span.innerHTML;
  const alvo = document.createElement('span');
  alvo.className = 'ic-anim';
  const anim = lottie.loadAnimation({
    container: alvo,
    renderer: 'svg',
    loop: false,
    autoplay: false,
    path: `${BASE}/${nome}.json`,
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  });
  anim.addEventListener('data_failed', () => {
    alvo.remove();
    span.innerHTML = estatico;
  });
  anim.addEventListener('DOMLoaded', () => {
    span.innerHTML = '';
    span.appendChild(alvo);
    anim.goToAndStop(0, true);
    const gatilho = span.closest('button, a, .hov') || span;
    gatilho.addEventListener('mouseenter', () => anim.goToAndPlay(0, true));
    if (gatilho.classList.contains('ativo')) anim.goToAndPlay(0, true);
  });
}

async function aplicar(span) {
  if (span.dataset.icPronto !== undefined) return;
  span.dataset.icPronto = '';
  const nome = span.dataset.ic;
  if (!nome) return;
  const svg = await obterSvg(nome);
  if (svg) span.innerHTML = svg;
  if ('icAnim' in span.dataset) animar(span, nome);
}

// Cria um ícone: `nome` é o arquivo em /icones; `padrao` é o SVG desenhado no código (reserva).
export function icone(nome, padrao = '', { animado = false, classe = '' } = {}) {
  const span = document.createElement('span');
  span.className = `ic${classe ? ` ${classe}` : ''}`;
  span.dataset.ic = nome;
  if (animado) span.dataset.icAnim = '';
  const tamanho = /width="(\d+(?:\.\d+)?)"/.exec(padrao || '');
  if (tamanho) span.style.setProperty('--ic', `${tamanho[1]}px`);
  span.innerHTML = padrao;
  aplicar(span);
  return span;
}

// Aplica os ícones do Iconly nos elementos <span class="ic" data-ic="nome"> já presentes no HTML.
export function montarIcones(raiz = document) {
  raiz.querySelectorAll('[data-ic]').forEach((el) => aplicar(el));
}
