'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarFundoLogin, CAMINHO_FUNDO_LOGIN } = require('../src/fundo-login');
const bytes = Buffer.from('RIFF0000WEBPteste');
function resposta() {
  return { statusCode: 200, headers: {}, setHeader(n,v){this.headers[n]=v;}, end(b){this.body=b;} };
}

test('fundo login: cache compartilha download e não envia credenciais ao arquivo', async () => {
  const chamadas=[];
  const servir=criarFundoLogin({baseUrl:'https://forge.example/',chave:'segredo-falso',fetchFn:async (u,o)=>{
    chamadas.push([String(u),o]);
    return chamadas.length===1 ? Response.json({url:'https://storage.example/imagem.webp'}) : new Response(bytes);
  }});
  const a=resposta(), b=resposta();
  await Promise.all([servir({method:'GET'},a),servir({method:'GET'},b)]);
  assert.equal(chamadas.length,2);
  assert.equal(new URL(chamadas[0][0]).searchParams.get('path'),CAMINHO_FUNDO_LOGIN.slice('/manus-storage/'.length));
  assert.equal(chamadas[0][1].headers.Authorization,'Bearer segredo-falso');
  assert.equal(chamadas[1][1].headers,undefined);
  assert.deepEqual(a.body,bytes);
  assert.deepEqual(b.body,bytes);
  assert.equal(a.headers['Content-Type'],'image/webp');
  assert.match(a.headers['Cache-Control'],/max-age=31536000, immutable/);
  assert.match(a.headers['X-Robots-Tag'],/noindex/);
  const cabecalho=resposta(); await servir({method:'HEAD'},cabecalho);
  assert.equal(cabecalho.body,undefined);
  assert.equal(chamadas.length,2);
});

test('fundo login: erro não vaza segredo e permite recuperação na próxima leitura', async () => {
  let n=0;
  const servir=criarFundoLogin({baseUrl:'https://forge.example/',chave:'segredo',fetchFn:async()=>{
    n++;
    if(n===1) throw new Error('segredo não pode aparecer');
    return n===2 ? Response.json({url:'https://storage.example/imagem.webp'}) : new Response(bytes);
  }});
  const erro=resposta();await servir({method:'GET'},erro);
  assert.equal(erro.statusCode,503);assert.equal(erro.body,undefined);
  assert.equal(erro.headers['Cache-Control'],'no-store');
  const ok=resposta();await servir({method:'GET'},ok);assert.deepEqual(ok.body,bytes);
});

test('fundo login: limita tamanho e rejeita conteúdo que não seja WebP', async () => {
  for (const corpo of [Buffer.alloc(100001), Buffer.from('<script>alert(1)</script>')]) {
    let n=0;
    const servir=criarFundoLogin({baseUrl:'https://forge.example/',chave:'teste',fetchFn:async()=>++n===1?Response.json({url:'https://storage.example/fundo'}):new Response(corpo)});
    const r=resposta();await servir({method:'GET'},r);assert.equal(r.statusCode,503);
  }
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
  assert.match(ler('vite.config.mjs'),/return fundoLogin\(req, res\)/);
});
