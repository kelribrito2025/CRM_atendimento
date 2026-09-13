'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { verificarSenha, HASH_FALSO } = require('./senha');
const sessoes = require('./sessoes');
const acesso = require('./acesso');
const { LimitadorTentativas } = require('./limitador');
const { criarEnviador } = require('./email');
const { criarRotasApi } = require('./rotas-api');
const canais = require('./canais');

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
  const publicoDir = opcoes.publicoDir || path.join(RAIZ, 'client', 'public');
  const servirPagina = opcoes.servirPagina || ((req, res, arquivo) => res.sendFile(path.join(paginasDir, arquivo)));

  const app = express();
  app.disable('x-powered-by');
  if (opcoes.trustProxy) app.set('trust proxy', opcoes.trustProxy);

  // O webhook do WhatsApp usa um leitor de JSON próprio (mensagens maiores)
  const jsonPadrao = express.json({ limit: '200kb' });
  app.use((req, res, next) => (req.path.startsWith('/webhook/') ? next() : jsonPadrao(req, res, next)));
  app.use(express.urlencoded({ extended: false }));

  // Cabeçalhos básicos de segurança
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  // Lista dos ícones do Iconly disponíveis na pasta (o navegador só pede os que existem)
  app.get('/icones/manifesto', (req, res) => {
    let arquivos = [];
    try { arquivos = fs.readdirSync(path.join(publicoDir, 'icones')); } catch { /* pasta ainda não existe */ }
    res.set('Cache-Control', 'no-store');
    res.json({
      svg: arquivos.filter((a) => a.endsWith('.svg')).map((a) => a.slice(0, -4)),
      json: arquivos.filter((a) => a.endsWith('.json')).map((a) => a.slice(0, -5)),
    });
  });

  // Arquivos estáticos (CSS, JS, ícones, bibliotecas) — públicos
  if (!opcoes.semEstaticos) {
    app.use('/assets', express.static(path.join(paginasDir, 'assets'), { maxAge: '1h' }));
    app.use('/icones', express.static(path.join(publicoDir, 'icones'), { maxAge: '1h' }));
    app.use('/vendor', express.static(path.join(publicoDir, 'vendor'), { maxAge: '1d' }));
  }

  // Identifica o usuário logado pelo cookie de sessão
  app.use(async (req, res, next) => {
    try {
      const cookies = sessoes.lerCookies(req);
      req.cookies = cookies;
      req.tokenSessao = cookies[sessoes.NOME_COOKIE] || null;
      req.usuario = await sessoes.buscarUsuarioDaSessao(db, req.tokenSessao);
      next();
    } catch (erro) {
      next(erro);
    }
  });

  /* ------------------------------ auxiliares ------------------------------ */

  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: cookieSeguro, path: '/' };

  async function iniciarSessao(res, usuarioId, lembrar) {
    const { token, expira } = await sessoes.criarSessao(db, usuarioId, lembrar);
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

  async function encerrarVerificacao(req, res) {
    await acesso.cancelarVerificacao(db, tokenVerificacao(req));
    res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
  }

  /* -------------------------------- páginas -------------------------------- */

  app.get('/saude', (req, res) => res.json({ ok: true }));

  app.get('/login', (req, res) => (req.usuario ? res.redirect('/') : enviarPagina(req, res, 'login.html')));

  app.get('/verificar', async (req, res) => {
    if (req.usuario) return res.redirect('/');
    if (!await acesso.buscarVerificacao(db, tokenVerificacao(req))) return res.redirect('/login');
    enviarPagina(req, res, 'verificar.html');
  });

  app.get('/recuperar', (req, res) => (req.usuario ? res.redirect('/') : enviarPagina(req, res, 'recuperar.html')));
  app.get('/nova-senha', (req, res) => enviarPagina(req, res, 'nova-senha.html'));
  app.get('/convite', (req, res) => enviarPagina(req, res, 'convite.html'));

  /* --------------------------------- login --------------------------------- */

  app.post('/login', async (req, res) => {
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

    const usuario = await db.prepare('SELECT id, nome, email, senha_hash, ativo FROM usuarios WHERE email = ?').get(email);
    const senhaOk = verificarSenha(senha, usuario ? usuario.senha_hash : HASH_FALSO);
    if (!usuario || !usuario.ativo || !senhaOk) {
      limitador.registrarFalha(chave);
      return responderErro(401, 'E-mail ou senha inválidos.');
    }
    limitador.limpar(chave);

    if (doisFatores) {
      const { token, codigo, expira } = await acesso.criarVerificacao(db, usuario.id, lembrar);
      enviarCodigo(usuario, codigo);
      res.cookie(COOKIE_VERIFICACAO, token, { ...cookieBase, expires: new Date(expira + 60_000) });
      const url = destino !== '/' ? `/verificar?next=${encodeURIComponent(destino)}` : '/verificar';
      return json ? res.json({ ok: true, redirect: url, verificacao: true }) : res.redirect(url);
    }

    await iniciarSessao(res, usuario.id, lembrar);
    return json ? res.json({ ok: true, redirect: destino }) : res.redirect(destino);
  });

  app.post('/logout', async (req, res) => {
    await sessoes.encerrarSessao(db, req.tokenSessao);
    res.clearCookie(sessoes.NOME_COOKIE, { path: '/' });
    return querJson(req) ? res.json({ ok: true }) : res.redirect('/login');
  });

  /* ----------------------- verificação em duas etapas ----------------------- */

  app.get('/acesso/verificacao', async (req, res) => {
    const v = await acesso.buscarVerificacao(db, tokenVerificacao(req));
    if (!v) return res.status(401).json({ erro: 'A verificação expirou. Entre novamente.', reiniciar: true });
    res.set('Cache-Control', 'no-store');
    res.json({
      email: acesso.mascararEmail(v.email),
      expiraEm: v.expira_em,
      reenvioEm: v.reenviado_em + acesso.INTERVALO_REENVIO_MS,
      modoTeste,
    });
  });

  app.post('/acesso/verificar', async (req, res) => {
    const r = await acesso.confirmarVerificacao(db, tokenVerificacao(req), req.body?.codigo);
    if (r.erro) {
      if (r.reiniciar) res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
      return res.status(r.reiniciar ? 401 : 400).json({ erro: r.erro, reiniciar: Boolean(r.reiniciar) });
    }
    res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
    await iniciarSessao(res, r.usuarioId, r.lembrar);
    res.json({ ok: true, redirect: destinoSeguro(req.body?.next) });
  });

  app.post('/acesso/verificar/reenviar', async (req, res) => {
    const r = await acesso.reenviarCodigo(db, tokenVerificacao(req));
    if (r.erro) {
      if (r.reiniciar) res.clearCookie(COOKIE_VERIFICACAO, { path: '/' });
      return res.status(r.reiniciar ? 401 : 429).json({ erro: r.erro, reiniciar: Boolean(r.reiniciar) });
    }
    enviarCodigo({ nome: r.nome, email: r.email }, r.codigo);
    res.json({ ok: true, expiraEm: r.expira, reenvioEm: r.reenvioEm });
  });

  app.get('/acesso/cancelar-verificacao', async (req, res) => {
    await encerrarVerificacao(req, res);
    res.redirect('/login');
  });

  /* --------------------------- recuperação de senha --------------------------- */

  app.post('/acesso/recuperar', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_VALIDO.test(email)) return res.status(400).json({ erro: 'Digite um e-mail válido.' });

    const chave = `recuperar|${req.ip}`;
    if (limitadorRecuperar.bloqueadoPor(chave) > 0) {
      return res.status(429).json({ erro: 'Muitos pedidos seguidos. Tente novamente em alguns minutos.' });
    }
    limitadorRecuperar.registrarFalha(chave);

    const usuario = await db.prepare('SELECT id, nome, email FROM usuarios WHERE email = ? AND ativo = 1').get(email);
    if (usuario) {
      const { token } = await acesso.criarRedefinicao(db, usuario.id);
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

  app.get('/acesso/redefinicao', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const r = await acesso.buscarRedefinicao(db, String(req.query.token || ''));
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json({ email: r.redefinicao.email, expiraEm: r.redefinicao.expiraEm });
  });

  app.post('/acesso/nova-senha', async (req, res) => {
    const token = String(req.body?.token || '');
    const senha = String(req.body?.senha || '');
    const repetir = String(req.body?.repetir || '');

    const problemas = acesso.validarSenhaNova(senha);
    if (problemas.length) return res.status(400).json({ erro: `A senha precisa ter: ${problemas.join(' e ').toLowerCase()}.` });
    if (senha !== repetir) return res.status(400).json({ erro: 'As senhas não conferem.' });

    const r = await acesso.usarRedefinicao(db, token, senha);
    if (r.erro) return res.status(400).json({ erro: r.erro });

    await iniciarSessao(res, r.usuarioId, false);
    res.json({ ok: true, redirect: '/' });
  });

  /* --------------------------------- convite --------------------------------- */

  app.get('/acesso/convite', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const r = await acesso.buscarConvite(db, String(req.query.token || ''));
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json({ convite: r.convite });
  });

  app.post('/acesso/convite', async (req, res) => {
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

    const r = await acesso.usarConvite(db, token, { nome, senha });
    if (r.erro) {
      limitadorConvite.registrarFalha(chave);
      return res.status(400).json({ erro: r.erro });
    }
    await iniciarSessao(res, r.usuarioId, false);
    res.status(201).json({ ok: true, redirect: '/' });
  });

  /* ------------------------ chat do site (widget) ------------------------ */
  // Páginas e rotas públicas: quem usa é o cliente final, no site da empresa.
  const widget = opcoes.widget || null;

  if (widget) {
    const limitadorWidget = new LimitadorTentativas({ maximo: 40, janelaMs: 5 * 60 * 1000 });

    // O arquivo que o site do cliente inclui numa linha.
    app.get('/widget.js', (req, res) => {
      res.type('application/javascript');
      res.set('Cache-Control', 'public, max-age=300');
      res.set('Access-Control-Allow-Origin', '*');
      res.sendFile(path.join(publicoDir, 'widget.js'));
    });

    // A página que roda dentro do quadro do chat.
    app.get('/widget', (req, res) => {
      res.set('Content-Security-Policy', "frame-ancestors *");
      enviarPagina(req, res, 'widget.html');
    });

    const tokenDoVisitante = (req) => String(req.get('x-widget-token') || req.body?.token || '');

    async function comSessaoWidget(req, res, next) {
      try {
        const sessao = await widget.sessaoDoToken(tokenDoVisitante(req));
        if (!sessao) return res.status(401).json({ erro: 'Sua conversa expirou. Recarregue a página.' });
        req.sessaoWidget = sessao;
        next();
      } catch (erro) {
        next(erro);
      }
    }

    // O site identifica quem está logado; o CRM devolve a chave da conversa.
    app.post('/widget/sessao', async (req, res) => {
      const chave = `widget|${req.ip}`;
      if (limitadorWidget.bloqueadoPor(chave) > 0) {
        return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em alguns minutos.' });
      }
      const { id, nome, email, empresa, pin, assinatura } = req.body || {};
      if (!widget.conferirAssinatura(id, assinatura)) {
        limitadorWidget.registrarFalha(chave);
        return res.status(401).json({ erro: 'Assinatura inválida. Confira o segredo do chat no servidor do site.' });
      }
      try {
        const r = await widget.abrirSessao({ id, nome, email, empresa, pin });
        res.json(r);
      } catch (erro) {
        res.status(400).json({ erro: erro.message });
      }
    });

    app.get('/widget/mensagens', comSessaoWidget, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ mensagens: await widget.listarMensagens(req.sessaoWidget, req.query.desde) });
    });

    app.post('/widget/mensagens', comSessaoWidget, async (req, res) => {
      try {
        const mensagem = await widget.enviarMensagem(req.sessaoWidget, req.body?.texto);
        res.status(201).json({ mensagem });
      } catch (erro) {
        res.status(400).json({ erro: erro.message });
      }
    });
  }

  /* ------------------------ webhook do WhatsApp (uazapi) ------------------------ */
  // Público, protegido pelo segredo na URL. Sempre responde 200 para o uazapi não reenviar.
  app.post('/webhook/uazapi/:segredo', express.json({ limit: '5mb', type: () => true }), async (req, res) => {
    const segredo = String(req.params.segredo || '');
    const canal = /^[a-f0-9]{32}$/.test(segredo) ? await db.prepare('SELECT * FROM canais WHERE webhook_segredo = ?').get(segredo) : null;
    if (!canal) return res.status(404).json({ erro: 'Canal não encontrado.' });
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const { tipo } = canais.extrairEvento(corpo);
    let resultado;
    try {
      await canais.registrarEvento(db, canal.id, tipo, corpo);
      resultado = await canais.processarEvento(db, canal, corpo, { arquivos: opcoes.arquivos || null });
    } catch (erro) {
      console.error('Erro ao processar webhook do WhatsApp:', erro);
      resultado = { resultado: 'erro', motivo: erro.message };
    }
    res.json({ ok: true, ...resultado });
  });

  /* ------------------------------ área logada ------------------------------ */

  app.get('/', exigirLogin, (req, res) => enviarPagina(req, res, 'atendimento.html'));

  app.use('/api', exigirLogin, criarRotasApi(db, { uazapi: opcoes.uazapi || null, telegram: opcoes.telegram || null, saldo: opcoes.saldo || null, arquivos: opcoes.arquivos || null, urlBase }));

  app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/acesso/') || req.originalUrl.startsWith('/webhook/')) {
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
