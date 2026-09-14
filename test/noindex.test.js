'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');

const RAIZ = path.join(__dirname, '..');
const CLIENT = path.join(RAIZ, 'client');
const DIRETIVA = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
const PAGINAS = [
  'atendimento.html',
  'convite.html',
  'login.html',
  'nova-senha.html',
  'recuperar.html',
  'verificar.html',
  'widget.html',
];

test('noindex: todas as páginas HTML proíbem indexação', () => {
  for (const pagina of PAGINAS) {
    const html = fs.readFileSync(path.join(CLIENT, pagina), 'utf8');
    assert.match(html, new RegExp(`<meta name="robots" content="${DIRETIVA}">`), pagina);
  }
});

test('noindex: robots.txt bloqueia o domínio inteiro', () => {
  const robots = fs.readFileSync(path.join(CLIENT, 'public', 'robots.txt'), 'utf8');
  assert.equal(robots, 'User-agent: *\nDisallow: /\n');
});

test('noindex: servidor aplica X-Robots-Tag inclusive em páginas e APIs', async () => {
  const db = await abrirBancoDeTeste();
  const app = criarApp(db, {
    paginasDir: CLIENT,
    publicoDir: path.join(CLIENT, 'public'),
    enviador: criarEnviador({ modo: 'silencioso' }),
  });
  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, () => resolve(instancia));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    for (const caminho of ['/login', '/widget', '/api/resumo']) {
      const resposta = await fetch(`${base}${caminho}`, { redirect: 'manual' });
      assert.equal(resposta.headers.get('x-robots-tag'), DIRETIVA, caminho);
    }

    const robots = await fetch(`${base}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(robots.headers.get('content-type') || '', /^text\/plain/);
    assert.equal(robots.headers.get('x-robots-tag'), DIRETIVA);
    assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
    await db.fechar();
  }
});
