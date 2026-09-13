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

function desenharMensagem(m) {
  const linha = document.createElement('div');
  linha.className = `msg ${m.de === 'voce' ? 'saida' : 'entrada'}`;
  const balao = document.createElement('div');
  balao.className = 'balao';
  balao.textContent = m.texto;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = [m.de === 'voce' ? 'Você' : (m.autor || 'Atendimento'), hora(m.criadaEm)].join(' · ');
  linha.append(balao, meta);
  $('#mensagens').append(linha);
  $('#mensagens').scrollTop = $('#mensagens').scrollHeight;
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
  else if (dados.tipo === 'abrir') { estado.naoLidas = 0; avisarSite({ tipo: 'nao-lidas', quantidade: 0 }); buscarMensagens(); $('#texto')?.focus(); }
  else if (dados.tipo === 'sair') { guardarToken(null); pararSondagem(); $('#mensagens').replaceChildren(); liberarEnvio(false); }
});

$('#form').addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
$('#texto').addEventListener('input', ajustarAltura);
$('#texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
});
$('#btn-fechar').addEventListener('click', () => avisarSite({ tipo: 'fechar' }));

// Conversa anterior neste navegador continua de onde parou.
const guardado = lerToken();
if (guardado) {
  estado.token = guardado;
  liberarEnvio(true);
  buscarMensagens(true).then(iniciarSondagem);
} else {
  mostrarEstado('Aguardando os dados do seu login…');
}

avisarSite({ tipo: 'pronto' });
