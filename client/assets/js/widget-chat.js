// Conversa que roda dentro do quadro do chat do site.
// Recebe os dados de quem está logado pelo site (postMessage do widget.js),
// abre a sessão no CRM e fica conferindo se chegou resposta do atendimento.

const $ = (s) => document.querySelector(s);
const CHAVE_TOKEN = 'chat_atendimento_token';

const estado = { token: null, ultimaId: 0, sondagem: null, enviando: false, naoLidas: 0 };

function guardarToken(token) {
  estado.token = token;
  try { localStorage.setItem(CHAVE_TOKEN, token || ''); } catch { /* navegador sem armazenamento */ }
}

function lerToken() {
  try { return localStorage.getItem(CHAVE_TOKEN) || null; } catch { return null; }
}

function avisarSite(mensagem) {
  if (window.parent !== window) window.parent.postMessage(mensagem, '*');
}

function hora(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Recado no meio do quadro (boas-vindas, carregando, erro). Cria a caixa se ela já saiu.
function mostrarEstado(texto) {
  let alvo = $('#estado');
  if (!alvo) {
    alvo = document.createElement('div');
    alvo.className = 'carregando';
    alvo.id = 'estado';
    $('#mensagens').append(alvo);
  }
  alvo.textContent = texto;
}

function limparEstado() {
  $('#estado')?.remove();
}

// O arquivo não vem por link direto do S3: a gente busca com a chave da conversa
// e mostra o conteúdo aqui dentro. Assim o endereço do arquivo não vaza.
async function baixarArquivo(midia) {
  const resposta = await fetch(midia.url, { headers: { 'x-widget-token': estado.token || '' } });
  if (!resposta.ok) throw new Error('Não foi possível abrir o arquivo.');
  return URL.createObjectURL(await resposta.blob());
}

function iconeArquivo() {
  return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"></path><path d="M14 3v5h5"></path></svg>';
}

function desenharArquivo(balao, m) {
  const midia = m.midia;
  balao.classList.add('com-arquivo');
  if (midia.tipo === 'imagem') {
    const imagem = document.createElement('img');
    imagem.className = 'arquivo-imagem';
    imagem.alt = midia.nome || 'Imagem enviada';
    // Só dá para rolar até o fim depois que a imagem ocupa o espaço dela.
    imagem.addEventListener('load', rolarParaFim);
    balao.append(imagem);
    baixarArquivo(midia).then((url) => { imagem.src = url; }).catch(() => { balao.textContent = 'Não foi possível abrir a imagem.'; });
    return;
  }
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'arquivo-linha';
  botao.innerHTML = `${iconeArquivo()}<span></span>`;
  botao.querySelector('span').textContent = midia.nome || m.texto;
  botao.addEventListener('click', async () => {
    try {
      const url = await baixarArquivo(midia);
      const link = document.createElement('a');
      link.href = url;
      link.download = midia.nome || 'arquivo';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      mostrarEstado('Não foi possível baixar o arquivo.');
    }
  });
  balao.append(botao);
}

// Enquanto o quadro está fechado ele não tem altura, e mandar rolar não faz
// efeito: por isso a rolagem é repetida no quadro seguinte, quando o chat abre.
function rolarParaFim() {
  const caixa = $('#mensagens');
  caixa.scrollTop = caixa.scrollHeight;
  requestAnimationFrame(() => { caixa.scrollTop = caixa.scrollHeight; });
}

function desenharMensagem(m) {
  const linha = document.createElement('div');
  linha.className = `msg ${m.de === 'voce' ? 'saida' : 'entrada'}`;
  const balao = document.createElement('div');
  balao.className = 'balao';
  if (m.midia) desenharArquivo(balao, m);
  else balao.textContent = m.texto;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = [m.de === 'voce' ? 'Você' : (m.autor || 'Atendimento'), hora(m.criadaEm)].join(' · ');
  linha.append(balao, meta);
  $('#mensagens').append(linha);
  rolarParaFim();
}

async function chamar(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', 'x-widget-token': estado.token || '', ...(opcoes.headers || {}) },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível falar com o atendimento.');
  return dados;
}

async function identificar(dados) {
  try {
    const r = await chamar('/widget/sessao', { method: 'POST', body: dados });
    guardarToken(r.token);
    estado.ultimaId = 0;
    $('#mensagens').replaceChildren();
    mostrarEstado('Carregando a conversa…');
    liberarEnvio(true);
    await buscarMensagens(true);
    iniciarSondagem();
  } catch (e) {
    liberarEnvio(false);
    mostrarEstado(e.message);
  }
}

function liberarEnvio(pode) {
  $('#texto').disabled = !pode;
  $('#enviar').disabled = !pode;
  $('#btn-anexar').disabled = !pode;
}

async function buscarMensagens(primeira = false) {
  if (!estado.token) return;
  try {
    const { mensagens } = await chamar(`/widget/mensagens?desde=${estado.ultimaId}`);
    if (mensagens.length) {
      limparEstado();
      for (const m of mensagens) {
        desenharMensagem(m);
        estado.ultimaId = Math.max(estado.ultimaId, m.id);
        if (!primeira && m.de !== 'voce') {
          estado.naoLidas += 1;
          avisarSite({ tipo: 'nao-lidas', quantidade: estado.naoLidas });
        }
      }
    } else if (primeira) {
      mostrarEstado('Oi! 👋\nEscreva sua dúvida que a gente responde por aqui.');
    }
  } catch (e) {
    if (/expirou/i.test(e.message)) { guardarToken(null); liberarEnvio(false); mostrarEstado(e.message); pararSondagem(); }
  }
}

function iniciarSondagem() {
  pararSondagem();
  estado.sondagem = setInterval(() => { if (!document.hidden) buscarMensagens(); }, 5000);
}

function pararSondagem() {
  if (estado.sondagem) clearInterval(estado.sondagem);
  estado.sondagem = null;
}

async function enviar() {
  const campo = $('#texto');
  const texto = campo.value.trim();
  if (!texto || estado.enviando || !estado.token) return;
  estado.enviando = true;
  campo.value = '';
  ajustarAltura();
  try {
    const { mensagem } = await chamar('/widget/mensagens', { method: 'POST', body: { texto } });
    limparEstado();
    desenharMensagem(mensagem);
    estado.ultimaId = Math.max(estado.ultimaId, mensagem.id);
  } catch (e) {
    campo.value = texto;
    mostrarEstado(e.message);
  } finally {
    estado.enviando = false;
    campo.focus();
  }
}

const TAMANHO_MAXIMO = 20 * 1024 * 1024;

// O arquivo vai do navegador do cliente direto para o nosso servidor, que guarda
// no nosso S3 e mostra a mensagem no CRM como qualquer outra.
async function enviarArquivo(arquivo) {
  if (!arquivo || estado.enviando || !estado.token) return;
  if (arquivo.size > TAMANHO_MAXIMO) { mostrarEstado('Esse arquivo passa de 20 MB. Envie um menor.'); return; }
  estado.enviando = true;
  liberarEnvio(false);
  mostrarEstado(`Enviando ${arquivo.name}…`);
  try {
    const resposta = await fetch('/widget/anexos', {
      method: 'POST',
      headers: {
        'Content-Type': arquivo.type || 'application/octet-stream',
        'x-nome-arquivo': encodeURIComponent(arquivo.name),
        'x-widget-token': estado.token || '',
      },
      body: arquivo,
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível enviar o arquivo.');
    limparEstado();
    desenharMensagem(dados.mensagem);
    estado.ultimaId = Math.max(estado.ultimaId, dados.mensagem.id);
  } catch (e) {
    mostrarEstado(e.message);
  } finally {
    estado.enviando = false;
    liberarEnvio(true);
  }
}

function ajustarAltura() {
  const campo = $('#texto');
  campo.style.height = 'auto';
  campo.style.height = `${Math.min(campo.scrollHeight, 120)}px`;
}

/* ---------------- conversa com o site que hospeda o chat ---------------- */
window.addEventListener('message', (evento) => {
  const dados = evento.data;
  if (!dados || typeof dados !== 'object') return;
  if (dados.tipo === 'identificar') identificar(dados.dados || {});
  else if (dados.tipo === 'abrir') {
    estado.naoLidas = 0;
    avisarSite({ tipo: 'nao-lidas', quantidade: 0 });
    rolarParaFim();
    buscarMensagens().then(rolarParaFim);
    $('#texto')?.focus();
  }
  else if (dados.tipo === 'sair') { guardarToken(null); pararSondagem(); $('#mensagens').replaceChildren(); liberarEnvio(false); }
});

$('#form').addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
$('#texto').addEventListener('input', ajustarAltura);
$('#texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
});
$('#btn-fechar').addEventListener('click', () => avisarSite({ tipo: 'fechar' }));
$('#btn-anexar').addEventListener('click', () => $('#arquivo').click());
$('#arquivo').addEventListener('change', (e) => {
  const arquivo = e.target.files?.[0];
  e.target.value = '';
  enviarArquivo(arquivo);
});

// Conversa anterior neste navegador continua de onde parou.
const guardado = lerToken();
if (guardado) {
  estado.token = guardado;
  liberarEnvio(true);
  buscarMensagens(true).then(() => { rolarParaFim(); iniciarSondagem(); });
} else {
  mostrarEstado('Aguardando os dados do seu login…');
}

avisarSite({ tipo: 'pronto' });
