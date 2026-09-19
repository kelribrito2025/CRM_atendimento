import { montarIcones } from './icones.js';

(() => {
  'use strict';

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const pagina = document.body.dataset.pagina;
  const params = new URLSearchParams(location.search);

  /* ------------------------------ utilidades ------------------------------ */
  function mostrar(el, msg) {
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; } else { el.hidden = true; }
  }

  function destinoSeguro(v) {
    return v && v.startsWith('/') && !v.startsWith('//') ? v : '/';
  }

  async function chamar(url, { method = 'GET', body } = {}) {
    let resposta;
    try {
      resposta = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Sem conexão com o servidor. Verifique se ele está ligado.');
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(dados.erro || 'Algo deu errado. Tente novamente.');
      erro.dados = dados;
      erro.status = resposta.status;
      throw erro;
    }
    return dados;
  }

  function carregando(botao, ativo) {
    botao.disabled = ativo;
    if (ativo) {
      botao.dataset.texto = botao.textContent;
      botao.textContent = 'Aguarde…';
    } else if (botao.dataset.texto) {
      botao.textContent = botao.dataset.texto;
    }
  }

  function ligarOlhos() {
    document.querySelectorAll('.olho').forEach((botao) => {
      botao.addEventListener('click', () => {
        const input = botao.parentElement.querySelector('input');
        const mostrarSenha = input.type === 'password';
        input.type = mostrarSenha ? 'text' : 'password';
        botao.setAttribute('aria-label', mostrarSenha ? 'Ocultar senha' : 'Mostrar senha');
        botao.title = botao.getAttribute('aria-label');
        input.focus();
      });
    });
  }

  function avaliarSenha(s) {
    const req = {
      tamanho: s.length >= 10,
      maiusculaNumero: /[A-ZÀ-Ý]/.test(s) && /\d/.test(s),
      simbolo: /[^A-Za-zÀ-ÿ0-9\s]/.test(s),
    };
    let pontos = 0;
    if (s.length >= 10) pontos += 1;
    if (/[A-ZÀ-Ý]/.test(s)) pontos += 1;
    if (/\d/.test(s)) pontos += 1;
    if (req.simbolo) pontos += 1;
    return { req, pontos, valida: req.tamanho && req.maiusculaNumero };
  }

  function ligarForca(input, forca, requisitos) {
    if (!input) return;
    const atualizar = () => {
      const a = avaliarSenha(input.value);
      if (forca) {
        forca.querySelectorAll('span').forEach((barra, i) => barra.classList.toggle('on', i < a.pontos));
        forca.classList.toggle('fraca', a.pontos === 1);
        forca.classList.toggle('media', a.pontos === 2);
      }
      if (requisitos) {
        for (const [chave, ok] of Object.entries(a.req)) {
          requisitos.querySelector(`[data-req="${chave}"]`)?.classList.toggle('ok', ok);
        }
      }
    };
    input.addEventListener('input', atualizar);
    atualizar();
  }

  function mmss(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function comNegrito(el, antes, forte, depois) {
    el.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = forte;
    el.append(antes, strong, depois || '');
  }

  const MENSAGEM_SENHA = 'A senha precisa ter pelo menos 10 caracteres, uma letra maiúscula e um número.';

  /* -------------------------------- páginas -------------------------------- */
  const paginas = {
    login() {
      const form = $('#form');
      const erro = $('#erro');
      const botao = $('#btn');
      const next = $('#next');
      if (params.get('erro')) mostrar(erro, params.get('erro'));
      if (params.get('next')) next.value = destinoSeguro(params.get('next'));

      $('#btn-google').addEventListener('click', () => {
        mostrar($('#info'), 'Entrar com Google ainda não está disponível. Use seu e-mail e senha.');
      });

      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrar(erro);
        const email = $('#email').value.trim();
        const senha = $('#senha').value;
        if (!email || !senha) return mostrar(erro, 'Informe e-mail e senha.');
        carregando(botao, true);
        try {
          const d = await chamar('/login', { method: 'POST', body: { email, senha, lembrar: $('#lembrar').checked, next: next.value } });
          location.href = d.redirect || '/';
        } catch (e) {
          mostrar(erro, e.message);
          carregando(botao, false);
          $('#senha').focus();
          $('#senha').select();
        }
      });
    },

    'escolher-atendente'() {
      const lista = $('#lista-atendentes');
      const erro = $('#erro');
      const form = $('#form-atendente');
      const botao = $('#btn');
      const campoSenha = $('#senha-admin');
      const senha = $('#senha-perfil');
      let selecionadoId = null;
      let pedeSenha = {};

      const iniciais = (nome) => {
        const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
        return partes.length > 1
          ? `${partes[0][0]}${partes[1][0]}`.toUpperCase()
          : String(partes[0] || '?').slice(0, 2).toUpperCase();
      };

      const selecionar = (id, { foco = true } = {}) => {
        selecionadoId = Number(id);
        lista.querySelectorAll('.opcao-atendente').forEach((item) => {
          const ativo = Number(item.dataset.id) === selecionadoId;
          item.classList.toggle('selecionado', ativo);
          item.setAttribute('aria-pressed', String(ativo));
        });
        // Perfil de administrador: o campo de senha aparece logo abaixo da lista.
        const precisa = Boolean(pedeSenha[selecionadoId]);
        campoSenha.hidden = !precisa;
        if (!precisa) senha.value = '';
        else if (foco) senha.focus();
        botao.disabled = false;
      };

      (async () => {
        try {
          const dados = await chamar('/acesso/atendentes');
          $('#conta-iniciais').textContent = iniciais(dados.conta.nome);
          $('#conta-nome').textContent = dados.conta.nome;
          $('#conta-email').textContent = dados.conta.email;
          pedeSenha = Object.fromEntries(dados.atendentes.map((a) => [Number(a.id), Boolean(a.pedeSenha)]));
          lista.replaceChildren(...dados.atendentes.map((atendente) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'opcao-atendente';
            item.dataset.id = atendente.id;
            item.setAttribute('aria-pressed', 'false');

            const avatar = document.createElement('span');
            avatar.className = 'avatar-escolha';
            avatar.textContent = iniciais(atendente.nome);
            const informacoes = document.createElement('span');
            informacoes.className = 'dados';
            const nome = document.createElement('strong');
            nome.textContent = atendente.nome;
            const status = document.createElement('small');
            status.textContent = atendente.pedeSenha ? 'Administrador · pede senha' : (atendente.presenca === 'online' ? 'Disponível para atendimento' : 'Atendente');
            informacoes.append(nome, status);
            const marcador = document.createElement('span');
            marcador.className = 'marcador-atendente';
            marcador.setAttribute('aria-hidden', 'true');
            item.append(avatar, informacoes, marcador);
            item.addEventListener('click', () => selecionar(atendente.id));
            return item;
          }));
          if (!dados.atendentes.length) {
            mostrar(erro, 'Nenhum atendente está disponível. Peça ajuda a um administrador.');
          } else if (dados.selecionadoId) {
            selecionar(dados.selecionadoId, { foco: false });
          }
        } catch (e) {
          mostrar(erro, e.message);
        }
      })();

      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrar(erro);
        if (!selecionadoId) return mostrar(erro, 'Escolha seu nome para continuar.');
        if (pedeSenha[selecionadoId] && !senha.value) { senha.focus(); return mostrar(erro, 'Digite a senha do administrador para usar este perfil.'); }
        carregando(botao, true);
        try {
          const dados = await chamar('/acesso/atendente', {
            method: 'POST',
            body: { atendenteId: selecionadoId, next: destinoSeguro(params.get('next')), senha: pedeSenha[selecionadoId] ? senha.value : undefined },
          });
          location.href = dados.redirect || '/';
        } catch (e) {
          mostrar(erro, e.message);
          carregando(botao, false);
        }
      });
    },

    verificar() {
      const inputs = [...document.querySelectorAll('#codigo input')];
      const erro = $('#erro');
      const sucesso = $('#sucesso');
      const botao = $('#btn');
      const botaoReenviar = $('#btn-reenviar');
      let expiraEm = 0;
      let reenvioEm = 0;
      let enviando = false;

      const codigo = () => inputs.map((i) => i.value).join('');
      const limpar = () => { inputs.forEach((i) => { i.value = ''; i.classList.remove('cheio'); }); inputs[0].focus(); };
      const sairParaLogin = (mensagem) => { location.href = `/login?erro=${encodeURIComponent(mensagem)}`; };

      inputs.forEach((input, i) => {
        input.addEventListener('input', () => {
          input.value = input.value.replace(/\D/g, '').slice(-1);
          input.classList.toggle('cheio', Boolean(input.value));
          if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
          if (codigo().length === 6) enviar();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !input.value && i > 0) {
            inputs[i - 1].value = '';
            inputs[i - 1].classList.remove('cheio');
            inputs[i - 1].focus();
          }
          if (e.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
          if (e.key === 'ArrowRight' && i < inputs.length - 1) inputs[i + 1].focus();
        });
        input.addEventListener('paste', (e) => {
          const texto = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
          if (!texto) return;
          e.preventDefault();
          [...texto.slice(0, 6)].forEach((d, j) => { inputs[j].value = d; inputs[j].classList.add('cheio'); });
          inputs[Math.min(texto.length, 5)].focus();
          if (codigo().length === 6) enviar();
        });
      });

      async function enviar() {
        if (enviando) return;
        if (codigo().length !== 6) return mostrar(erro, 'Digite os 6 dígitos do código.');
        mostrar(erro);
        mostrar(sucesso);
        enviando = true;
        carregando(botao, true);
        try {
          const d = await chamar('/acesso/verificar', { method: 'POST', body: { codigo: codigo(), next: destinoSeguro(params.get('next')) } });
          location.href = d.redirect || '/';
        } catch (e) {
          if (e.dados?.reiniciar) return sairParaLogin(e.message);
          mostrar(erro, e.message);
          limpar();
          carregando(botao, false);
          enviando = false;
        }
      }

      $('#form').addEventListener('submit', (e) => { e.preventDefault(); enviar(); });

      function tique() {
        const agora = Date.now();
        $('#expira').textContent = mmss(expiraEm - agora);
        if (expiraEm && expiraEm - agora <= 0 && erro.hidden) mostrar(erro, 'O código expirou. Peça um novo código.');
        const espera = reenvioEm - agora;
        if (espera > 0) {
          botaoReenviar.disabled = true;
          botaoReenviar.textContent = `Reenviar em ${Math.ceil(espera / 1000)}s`;
        } else {
          botaoReenviar.disabled = false;
          botaoReenviar.textContent = 'Reenviar código';
        }
      }

      botaoReenviar.addEventListener('click', async () => {
        botaoReenviar.disabled = true;
        mostrar(erro);
        try {
          const d = await chamar('/acesso/verificar/reenviar', { method: 'POST', body: {} });
          expiraEm = d.expiraEm;
          reenvioEm = d.reenvioEm;
          limpar();
          mostrar(sucesso, 'Novo código enviado.');
        } catch (e) {
          if (e.dados?.reiniciar) return sairParaLogin(e.message);
          mostrar(erro, e.message);
        }
        tique();
      });

      (async () => {
        try {
          const d = await chamar('/acesso/verificacao');
          $('#email').textContent = d.email;
          expiraEm = d.expiraEm;
          reenvioEm = d.reenvioEm;
          if (d.modoTeste) {
            $('#info-texto').textContent = 'Modo de teste: como o envio de e-mail ainda não está configurado, o código aparece na janela preta do servidor.';
          }
          tique();
          setInterval(tique, 1000);
          inputs[0].focus();
        } catch (e) {
          sairParaLogin(e.message);
        }
      })();
    },

    recuperar() {
      const form = $('#form');
      const erro = $('#erro');
      const botao = $('#btn');
      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrar(erro);
        const email = $('#email').value.trim();
        if (!email) return mostrar(erro, 'Digite o e-mail cadastrado.');
        carregando(botao, true);
        try {
          const d = await chamar('/acesso/recuperar', { method: 'POST', body: { email } });
          const texto = $('#ok-texto');
          comNegrito(texto, 'Se ', email, ' estiver na equipe, o e-mail chega em instantes.');
          if (d.modoTeste) texto.append(document.createElement('br'), 'Modo de teste: o link aparece na janela preta do servidor.');
          $('#ok').hidden = false;
          form.hidden = true;
        } catch (e) {
          mostrar(erro, e.message);
          carregando(botao, false);
        }
      });
    },

    'nova-senha'() {
      const token = params.get('token') || '';
      const form = $('#form');
      const erro = $('#erro');
      const botao = $('#btn');
      ligarForca($('#senha'), $('#forca'), $('#requisitos'));

      (async () => {
        try {
          const d = await chamar(`/acesso/redefinicao?token=${encodeURIComponent(token)}`);
          comNegrito($('#sub'), 'Para ', d.email);
          form.hidden = false;
          $('#senha').focus();
        } catch (e) {
          $('#sub').textContent = 'Não foi possível abrir este link.';
          mostrar($('#erro-link'), e.message);
          $('#sem-link').hidden = false;
        }
      })();

      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrar(erro);
        const senha = $('#senha').value;
        const repetir = $('#repetir').value;
        if (!avaliarSenha(senha).valida) return mostrar(erro, MENSAGEM_SENHA);
        if (senha !== repetir) return mostrar(erro, 'As senhas não conferem.');
        carregando(botao, true);
        try {
          const d = await chamar('/acesso/nova-senha', { method: 'POST', body: { token, senha, repetir } });
          location.href = d.redirect || '/';
        } catch (e) {
          mostrar(erro, e.message);
          carregando(botao, false);
        }
      });
    },

    convite() {
      const token = params.get('token') || '';
      const form = $('#form');
      const erro = $('#erro');
      const botao = $('#btn');
      ligarForca($('#senha'), $('#forca'), $('#requisitos'));

      (async () => {
        try {
          const { convite } = await chamar(`/acesso/convite?token=${encodeURIComponent(token)}`);
          comNegrito($('#sub'), 'Convite para ', convite.email);
          $('#hero-texto').textContent = `${convite.convidante || 'O administrador'} criou um acesso para você no painel de atendimento.`;

          const lista = $('#hero-equipes');
          lista.replaceChildren(...convite.equipes.map((eq) => {
            const item = document.createElement('span');
            item.className = 'item';
            const cor = document.createElement('span');
            cor.className = 'cor';
            cor.style.background = eq.cor;
            item.append(cor, `Equipe de ${eq.nome}`);
            return item;
          }));
          if (!convite.equipes.length) {
            const item = document.createElement('span');
            item.className = 'item';
            item.textContent = 'Todas as caixas de entrada';
            lista.append(item);
          }
          const dias = Math.max(1, Math.ceil((convite.expiraEm - Date.now()) / 86400000));
          $('#hero-papel').textContent = `Papel: ${convite.papel === 'admin' ? 'Administrador' : 'Atendente'} · expira em ${dias} dia${dias === 1 ? '' : 's'}`;
          $('#hero-caixa').hidden = false;
          form.hidden = false;
          $('#nome').focus();
        } catch (e) {
          $('#sub').textContent = 'Não foi possível abrir este convite.';
          mostrar($('#erro-convite'), e.message);
          $('#sem-convite').hidden = false;
          $('#hero-badge').textContent = 'Convite';
          $('#hero-titulo').textContent = 'Precisa de um convite.';
          $('#hero-texto').textContent = 'Peça ao administrador um link de convite para criar a sua conta.';
        }
      })();

      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrar(erro);
        const nome = $('#nome').value.trim();
        const senha = $('#senha').value;
        if (nome.length < 2) return mostrar(erro, 'Digite seu nome completo.');
        if (!avaliarSenha(senha).valida) return mostrar(erro, MENSAGEM_SENHA);
        if (!$('#aceito').checked) return mostrar(erro, 'Você precisa aceitar a política de uso interno.');
        carregando(botao, true);
        try {
          const d = await chamar('/acesso/convite', { method: 'POST', body: { token, nome, senha, aceito: true } });
          location.href = d.redirect || '/';
        } catch (e) {
          mostrar(erro, e.message);
          carregando(botao, false);
        }
      });
    },
  };

  montarIcones();
  ligarOlhos();
  if (paginas[pagina]) paginas[pagina]();
})();
