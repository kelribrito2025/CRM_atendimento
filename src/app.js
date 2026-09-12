'use strict';

const path = require('node:path');
const express = require('express');
const { verificarSenha, HASH_FALSO } = require('./senha');
const sessoes = require('./sessoes');
const acesso = require('./acesso');
const { LimitadorTentativas } = require('./limitador');
const { criarEnviador } = require('./email');
const { criarRotasApi } = require('./rotas-api');

const RAIZ = path.join(__dirname, '..');
const COOKIE_VERIFICACAO = 'crm_verificacao';
const EMAIL_VALIDO = /^\S+@\S+\.\S+$/;

function criarApp(db, opcoes = {}) {
  const cookieSeguro = Boolean(opcoes.cookieSeguro);
  const doisFatores = Boolean(opcoes.doisFatores);
  const enviador = opcoes.enviador || criarEnviador();
  const limitador = opcoes.limitador || new LimitadorTentativas();
  const limitadorRecuperar = new LimitadorTentativas({ maximo: 5 });
  const limitadorConvite = new LimitadorTentativas({ maximo: 10 });
  const baseUrl = String(opcoes.baseUrl || '').replace(/\/$/, '');
  const modoTeste = enviador.modo !== 'real';

  // De onde vêm as páginas HTML e os arquivos estáticos (CSS, JS, ícones).
  // No Vite/Manus, `servirPagina` é substituída para passar pelo Vite e
  // `semEstaticos` evita servir os arquivos duas vezes.
  const paginasDir = opcoes.paginasDir || path.join(RAIZ, 'client');
  const servirPagina = opcoes.servirPagina || ((req, res, arquivo) => res.sendFile(path.join(paginasDir, arquivo)));

  const app = express();
  app.disable('x-powered-by');
  if (opcoes.trustProxy) app.set('trust proxy', opcoes.trustProxy);

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false }));

  // Cabeçalhos básicos de segurança
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  // Arquivos estáticos (CSS, JS, ícones) — públicos
  if (!opcoes.semEstaticos) {
    app.use('/assets', express.static(path.join(paginasDir, 'assets'), { maxAge: '1h' }));
  }

  // Identifica o usuário logado pelo cookie de sessão
  app.use((req, res, next) => {
    const cookies = sessoes.lerCookies(req);
    req.cookies = cookies;
    req.tokenSessao = cookies[sessoes.NOME_COOKIE] || null;
    req.usuario = sessoes.buscarUsuarioDaSessao(db, req.tokenSessao);
    next();
  });

  /* ------------------------------ auxiliares ------------------------------ */

  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: cookieSeguro, path: '/' };

  function iniciarSessao(res, usuarioId, lembrar) {
    const { token, expira } = sessoes.criarSessao(db, usuarioId, lembrar);
    res.cookie(sessoes.NOME_COOKIE, token, { ...cookieBase, expires: new Date(expira) });
  }

  function exigirLogin(req, res, next) {
    if (req.usuario) return next();
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    const destino = req.originalUrl && req.originalUrl !== '/' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
    return res.redirect(`/login${destino}`);
  }

  function querJson(req) {
    return Boolean(req.is('application/json')) || (req.get('accept') || '').includes('application/json');
  }

  function destinoSeguro(valor) {
    return typeof valor === 'string' && valor.startsWith('/') && !valor.startsWith('//') ? valor : '/';
  }

  function enviarPagina(req, res, arquivo) {
    res.set('Cache-Control', 'no-store');
    return servirPagina(req, res, arquivo);
  }

  function urlBase(req) {
    return baseUrl || `${req.protocol}://${req.get('host')}`;
  }

  function enviarCodigo(usuario, codigo) {
    return enviador.enviar({
      para: usuario.email,
      assunto: 'Seu código de verificação',
      texto: `Olá, ${usuario.nome}!\n\nSeu código de verificação é: ${codigo}\nEle vale por 5 minutos.\n\nSe não foi você que tentou entrar, troque sua senha.`,
    }).catch((erro) => console.error('Falha ao enviar e-mail:', erro));
  }

  function tokenVerificacao(req) {
    return req.cookies[COOKIE_VERIFICACAO] || null;
  }

  function encerrarVerificacao(req, res) {
    acesso.cancelarVerificacao(db, tokenVerificacao(req));
    res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
  }

  /* -------------------------------- páginas -------------------------------- */

  app.get('/saude', (req, res) => res.json({ ok: true }));

  app.get('/login', (req, res) => (req.usuario ? res.redirect('/') : enviarPagina(req, res, 'login.html')));

  app.get('/verificar', (req, res) => {
    if (req.usuario) return res.redirect('/');
    if (!acesso.buscarVerificacao(db, tokenVerificacao(req))) return res.redirect('/login');
    enviarPagina(req, res, 'verificar.html');
  });

  app.get('/recuperar', (req, res) => (req.usuario ? res.redirect('/') : enviarPagina(req, res, 'recuperar.html')));
  app.get('/nova-senha', (req, res) => enviarPagina(req, res, 'nova-senha.html'));
  app.get('/convite', (req, res) => enviarPagina(req, res, 'convite.html'));

  /* --------------------------------- login --------------------------------- */

  app.post('/login', (req, res) => {
    const json = querJson(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    const lembrar = req.body?.lembrar === true || req.body?.lembrar === 'on' || req.body?.lembrar === '1';
    const chave = `${req.ip}|${email}`;
    const destino = destinoSeguro(req.body?.next);

    const responderErro = (status, mensagem) => (json
      ? res.status(status).json({ erro: mensagem })
      : res.redirect(`/login?erro=${encodeURIComponent(mensagem)}`));

    if (!email || !senha) return responderErro(400, 'Informe e-mail e senha.');

    const bloqueio = limitador.bloqueadoPor(chave);
    if (bloqueio > 0) {
      const minutos = Math.max(1, Math.ceil(bloqueio / 60000));
      return responderErro(429, `Muitas tentativas. Tente novamente em ${minutos} min.`);
    }

    const usuario = db.prepare('SELECT id, nome, email, senha_hash, ativo FROM usuarios WHERE email = ?').get(email);
    const senhaOk = verificarSenha(senha, usuario ? usuario.senha_hash : HASH_FALSO);
    if (!usuario || !usuario.ativo || !senhaOk) {
      limitador.registrarFalha(chave);
      return responderErro(401, 'E-mail ou senha inválidos.');
    }
    limitador.limpar(chave);

    if (doisFatores) {
      const { token, codigo, expira } = acesso.criarVerificacao(db, usuario.id, lembrar);
      enviarCodigo(usuario, codigo);
      res.cookie(COOKIE_VERIFICACAO, token, { ...cookieBase, expires: new Date(expira + 60_000) });
      const url = destino !== '/' ? `/verificar?next=${encodeURIComponent(destino)}` : '/verificar';
      return json ? res.json({ ok: true, redirect: url, verificacao: true }) : res.redirect(url);
    }

    iniciarSessao(res, usuario.id, lembrar);
    return json ? res.json({ ok: true, redirect: destino }) : res.redirect(destino);
  });

  app.post('/logout', (req, res) => {
    sessoes.encerrarSessao(db, req.tokenSessao);
    res.clearCookie(sessoes.NOME_COOKIE, { path: '/' });
    return querJson(req) ? res.json({ ok: true }) : res.redirect('/login');
  });

  /* ----------------------- verificação em duas etapas ----------------------- */

  app.get('/acesso/verificacao', (req, res) => {
    const v = acesso.buscarVerificacao(db, tokenVerificacao(req));
    if (!v) return res.status(401).json({ erro: 'A verificação expirou. Entre novamente.', reiniciar: true });
    res.set('Cache-Control', 'no-store');
    res.json({
      email: acesso.mascararEmail(v.email),
      expiraEm: v.expira_em,
      reenvioEm: v.reenviado_em + acesso.INTERVALO_REENVIO_MS,
      modoTeste,
    });
  });

  app.post('/acesso/verificar', (req, res) => {
    const r = acesso.confirmarVerificacao(db, tokenVerificacao(req), req.body?.codigo);
    if (r.erro) {
      if (r.reiniciar) res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
      return res.status(r.reiniciar ? 401 : 400).json({ erro: r.erro, reiniciar: Boolean(r.reiniciar) });
    }
    res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
    iniciarSessao(res, r.usuarioId, r.lembrar);
    res.json({ ok: true, redirect: destinoSeguro(req.body?.next) });
  });

  app.post('/acesso/verificar/reenviar', (req, res) => {
    const r = acesso.reenviarCodigo(db, tokenVerificacao(req));
    if (r.erro) {
      if (r.reiniciar) res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
      return res.status(r.reiniciar ? 401 : 429).json({ erro: r.erro, reiniciar: Boolean(r.reiniciar) });
    }
    enviarCodigo({ nome: r.nome, email: r.email }, r.codigo);
    res.json({ ok: true, expiraEm: r.expira, reenvioEm: r.reenvioEm });
  });

  app.get('/acesso/cancelar-verificacao', (req, res) => {
    encerrarVerificacao(req, res);
    res.redirect('/login');
  });

  /* --------------------------- recuperação de senha --------------------------- */

  app.post('/acesso/recuperar', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_VALIDO.test(email)) return res.status(400).json({ erro: 'Digite um e-mail válido.' });

    const chave = `recuperar|${req.ip}`;
    if (limitadorRecuperar.bloqueadoPor(chave) > 0) {
      return res.status(429).json({ erro: 'Muitos pedidos seguidos. Tente novamente em alguns minutos.' });
    }
    limitadorRecuperar.registrarFalha(chave);

    const usuario = db.prepare('SELECT id, nome, email FROM usuarios WHERE email = ? AND ativo = 1').get(email);
    if (usuario) {
      const { token } = acesso.criarRedefinicao(db, usuario.id);
      const link = `${urlBase(req)}/nova-senha?token=${token}`;
      enviador.enviar({
        para: usuario.email,
        assunto: 'Recuperação de acesso ao CRM',
        texto: `Olá, ${usuario.nome}!\n\nPara definir uma nova senha, abra o link abaixo. Ele vale por 30 minutos e só funciona uma vez:\n${link}\n\nSe você não pediu isso, ignore este e-mail.`,
      }).catch((erro) => console.error('Falha ao enviar e-mail:', erro));
    }
    // Resposta igual existindo ou não a conta, para não revelar e-mails cadastrados.
    res.json({ ok: true, modoTeste });
  });

  app.get('/acesso/redefinicao', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const r = acesso.buscarRedefinicao(db, String(req.query.token || ''));
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json({ email: r.redefinicao.email, expiraEm: r.redefinicao.expiraEm });
  });

  app.post('/acesso/nova-senha', (req, res) => {
    const token = String(req.body?.token || '');
    const senha = String(req.body?.senha || '');
    const repetir = String(req.body?.repetir || '');

    const problemas = acesso.validarSenhaNova(senha);
    if (problemas.length) return res.status(400).json({ erro: `A senha precisa ter: ${problemas.join(' e ').toLowerCase()}.` });
    if (senha !== repetir) return res.status(400).json({ erro: 'As senhas não conferem.' });

    const r = acesso.usarRedefinicao(db, token, senha);
    if (r.erro) return res.status(400).json({ erro: r.erro });

    iniciarSessao(res, r.usuarioId, false);
    res.json({ ok: true, redirect: '/' });
  });

  /* --------------------------------- convite --------------------------------- */

  app.get('/acesso/convite', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const r = acesso.buscarConvite(db, String(req.query.token || ''));
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json({ convite: r.convite });
  });

  app.post('/acesso/convite', (req, res) => {
    const chave = `convite|${req.ip}`;
    if (limitadorConvite.bloqueadoPor(chave) > 0) {
      return res.status(429).json({ erro: 'Muitas tentativas. Tente novamente em alguns minutos.' });
    }
    const token = String(req.body?.token || '');
    const nome = String(req.body?.nome || '').trim();
    const senha = String(req.body?.senha || '');

    if (nome.length < 2) return res.status(400).json({ erro: 'Digite seu nome completo.' });
    const problemas = acesso.validarSenhaNova(senha);
    if (problemas.length) return res.status(400).json({ erro: `A senha precisa ter: ${problemas.join(' e ').toLowerCase()}.` });
    if (req.body?.aceito !== true) return res.status(400).json({ erro: 'Você precisa aceitar a política de uso interno.' });

    const r = acesso.usarConvite(db, token, { nome, senha });
    if (r.erro) {
      limitadorConvite.registrarFalha(chave);
      return res.status(400).json({ erro: r.erro });
    }
    iniciarSessao(res, r.usuarioId, false);
    res.status(201).json({ ok: true, redirect: '/' });
  });

  /* ------------------------------ área logada ------------------------------ */

  app.get('/', exigirLogin, (req, res) => enviarPagina(req, res, 'atendimento.html'));

  app.use('/api', exigirLogin, criarRotasApi(db));

  app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/acesso/')) {
      return res.status(404).json({ erro: 'Rota não encontrada.' });
    }
    res.status(404).type('text').send('Página não encontrada.');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((erro, req, res, next) => {
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados inválidos.' });
    if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'Conteúdo muito grande.' });
    console.error(erro);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { criarApp };
