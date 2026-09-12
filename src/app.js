'use strict';

const path = require('node:path');
const express = require('express');
const { verificarSenha, HASH_FALSO } = require('./senha');
const sessoes = require('./sessoes');
const { LimitadorTentativas } = require('./limitador');
const { criarRotasApi } = require('./rotas-api');

const PUBLIC = path.join(__dirname, '..', 'public');

function criarApp(db, opcoes = {}) {
  const cookieSeguro = Boolean(opcoes.cookieSeguro);
  const limitador = opcoes.limitador || new LimitadorTentativas();

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
  app.use('/assets', express.static(path.join(PUBLIC, 'assets'), { maxAge: '1h' }));

  // Identifica o usuário logado pelo cookie de sessão
  app.use((req, res, next) => {
    const cookies = sessoes.lerCookies(req);
    req.tokenSessao = cookies[sessoes.NOME_COOKIE] || null;
    req.usuario = sessoes.buscarUsuarioDaSessao(db, req.tokenSessao);
    next();
  });

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

  app.get('/saude', (req, res) => res.json({ ok: true }));

  app.get('/login', (req, res) => {
    if (req.usuario) return res.redirect('/');
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(PUBLIC, 'login.html'));
  });

  app.post('/login', (req, res) => {
    const json = querJson(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    const lembrar = req.body?.lembrar === true || req.body?.lembrar === 'on' || req.body?.lembrar === '1';
    const chave = `${req.ip}|${email}`;

    const responderErro = (status, mensagem) => (json
      ? res.status(status).json({ erro: mensagem })
      : res.redirect(`/login?erro=${encodeURIComponent(mensagem)}`));

    if (!email || !senha) return responderErro(400, 'Informe e-mail e senha.');

    const bloqueio = limitador.bloqueadoPor(chave);
    if (bloqueio > 0) {
      const minutos = Math.max(1, Math.ceil(bloqueio / 60000));
      return responderErro(429, `Muitas tentativas. Tente novamente em ${minutos} min.`);
    }

    const usuario = db.prepare('SELECT id, nome, senha_hash, ativo FROM usuarios WHERE email = ?').get(email);
    const senhaOk = verificarSenha(senha, usuario ? usuario.senha_hash : HASH_FALSO);
    if (!usuario || !usuario.ativo || !senhaOk) {
      limitador.registrarFalha(chave);
      return responderErro(401, 'E-mail ou senha inválidos.');
    }

    limitador.limpar(chave);
    const { token, expira } = sessoes.criarSessao(db, usuario.id, lembrar);
    res.cookie(sessoes.NOME_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguro,
      path: '/',
      expires: new Date(expira),
    });

    const destino = destinoSeguro(req.body?.next);
    return json ? res.json({ ok: true, redirect: destino }) : res.redirect(destino);
  });

  app.post('/logout', (req, res) => {
    sessoes.encerrarSessao(db, req.tokenSessao);
    res.clearCookie(sessoes.NOME_COOKIE, { path: '/' });
    return querJson(req) ? res.json({ ok: true }) : res.redirect('/login');
  });

  app.get('/', exigirLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(PUBLIC, 'atendimento.html'));
  });

  app.use('/api', exigirLogin, criarRotasApi(db));

  app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ erro: 'Rota não encontrada.' });
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
