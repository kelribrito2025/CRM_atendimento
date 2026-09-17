'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarFundoLogin, CAMINHO_FUNDO_LOGIN } = require('../src/fundo-login');
const arquivo = path.join(__dirname, '..', 'client', 'public', 'imagens', 'login-rotina-equipe.webp');
const bytes = fs.readFileSync(arquivo);
function resposta() {
  return { statusCode: 200, headers: {}, setHeader(n,v){this.headers[n]=v;}, end(b){this.body=b;} };
}

test('fundo login: cache compartilha leitura local e não envia credenciais', async () => {
  const servir=criarFundoLogin({arquivo});
  const a=resposta(), b=resposta();
  await Promise.all([servir({method:'GET'},a),servir({method:'GET'},b)]);
  assert.deepEqual(a.body,bytes);
  assert.deepEqual(b.body,bytes);
  assert.equal(a.headers['Content-Type'],'image/webp');
  assert.match(a.headers['Cache-Control'],/max-age=31536000, immutable/);
  assert.match(a.headers['X-Robots-Tag'],/noindex/);
  const cabecalho=resposta(); await servir({method:'HEAD'},cabecalho);
  assert.equal(cabecalho.body,undefined);
});

test('fundo login: erro local responde indisponível sem corpo ou credencial', async () => {
  const servir=criarFundoLogin({arquivo:path.join(__dirname, 'nao-existe.webp')});
  const erro=resposta();await servir({method:'GET'},erro);
  assert.equal(erro.statusCode,503);assert.equal(erro.body,undefined);
  assert.equal(erro.headers['Cache-Control'],'no-store');
});

test('fundo login UI: decoração a 30% de opacidade só no login desktop e atrás dos textos', () => {
  const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const css=ler('client/assets/css/acesso.css');
  assert.match(css,/body\[data-pagina="login"\] \.hero \{ isolation: isolate; \}/);
  const camada=css.match(/body\[data-pagina="login"\] \.hero::before \{([^}]+)\}/)?.[1];
  assert.ok(camada);
  assert.match(camada,/opacity: \.3;/);
  assert.match(camada,/z-index: -1;/);
  assert.match(camada,/pointer-events: none;/);
  assert.ok(camada.includes(CAMINHO_FUNDO_LOGIN));
  assert.match(css,/@media \(min-width: 861px\) \{\s+body\[data-pagina="login"\] \.hero::before/);
  assert.match(css,/\.hero \{[^}]*background: var\(--rail\)/);
  assert.match(ler('src/app.js'),/app\.get\(CAMINHO_FUNDO_LOGIN, criarFundoLogin\(\)\)/);
  assert.doesNotMatch(ler('vite.config.mjs'),/manus-storage|BUILT_IN_FORGE|vite-plugin-manus-runtime/);
});
