(() => {
  'use strict';

  const form = document.getElementById('form-login');
  const erro = document.getElementById('erro');
  const botao = document.getElementById('btn-entrar');
  const senha = document.getElementById('senha');
  const olho = document.getElementById('btn-olho');
  const next = document.getElementById('next');

  const params = new URLSearchParams(location.search);
  if (params.get('erro')) mostrarErro(params.get('erro'));
  const destino = params.get('next');
  if (destino && destino.startsWith('/') && !destino.startsWith('//')) next.value = destino;

  function mostrarErro(msg) {
    erro.textContent = msg;
    erro.hidden = false;
  }

  olho.addEventListener('click', () => {
    const mostrar = senha.type === 'password';
    senha.type = mostrar ? 'text' : 'password';
    olho.title = mostrar ? 'Ocultar senha' : 'Mostrar senha';
    olho.setAttribute('aria-label', olho.title);
    senha.focus();
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erro.hidden = true;

    const email = document.getElementById('email').value.trim();
    const valorSenha = senha.value;
    if (!email || !valorSenha) return mostrarErro('Informe e-mail e senha.');

    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      const resposta = await fetch('/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email,
          senha: valorSenha,
          lembrar: document.getElementById('lembrar').checked,
          next: next.value,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível entrar. Tente novamente.');
      location.href = dados.redirect || '/';
    } catch (e) {
      mostrarErro(e.message === 'Failed to fetch' ? 'Sem conexão com o servidor.' : e.message);
      botao.disabled = false;
      botao.textContent = 'Entrar';
      senha.focus();
      senha.select();
    }
  });
})();
