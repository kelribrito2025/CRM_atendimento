'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CAMINHO_FUNDO_LOGIN } = require('../src/fundo-login');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('portabilidade: o fundo de login usa rota local e não Forge ou manus-storage', () => {
  const fundo = ler('src/fundo-login.js');
  const css = ler('client/assets/css/acesso.css');
  assert.equal(CAMINHO_FUNDO_LOGIN, '/acesso/imagens/login-ondas.svg');
  assert.match(fundo, /fs\.promises\.readFile/);
  assert.doesNotMatch(fundo, /BUILT_IN_FORGE|Authorization|manus-storage|fetch\s*\(/);
  assert.match(css, /url\('\/acesso\/imagens\/login-ondas\.svg'\)/);
  assert.doesNotMatch(css, /manus-storage/);
});

test('portabilidade: o fundo do login é um SVG estático local', () => {
  const ativo = path.join(raiz, 'client/public/imagens/login-ondas.svg');
  const texto = fs.readFileSync(ativo, 'utf8');
  assert.ok(Buffer.byteLength(texto) < 100_000);
  assert.match(texto, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1200 900"/);
  assert.doesNotMatch(texto, /<script|https?:\/\/(?!www\.w3\.org)|\son[a-z]+=/i);
  assert.ok((texto.match(/<path /g) || []).length >= 4, 'tem as camadas de ondas');
  assert.ok(!fs.existsSync(path.join(raiz, 'client/public/imagens/login-rotina-equipe.webp')), 'o WebP pixelado saiu do projeto');
});

test('portabilidade: Vite mantém somente o plugin crm-atendimento e o multipage real', () => {
  const vite = ler('vite.config.mjs');
  assert.match(vite, /name: 'crm-atendimento'/);
  assert.match(vite, /rollupOptions:/);
  assert.match(vite, /PAGINAS\.map/);
  assert.doesNotMatch(vite, /vite-plugin-manus-runtime|manus-debug|manus-storage|__manus__|BUILT_IN_FORGE/);
});

test('portabilidade: Dockerfile é explícito, fixado, não-root e sem migração', () => {
  const dockerfile = ler('Dockerfile');
  assert.match(dockerfile, /FROM node:22\.22\.0-bookworm-slim@sha256:/);
  assert.match(dockerfile, /pnpm@11\.24\.0/);
  assert.match(dockerfile, /pnpm install --frozen-lockfile --prod=false --ignore-scripts/);
  assert.match(dockerfile, /pnpm run build/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /CMD \["node", "dist\/index\.js"\]/);
  const runtime = dockerfile.split(' AS runtime')[1];
  assert.doesNotMatch(runtime, /corepack|pnpm@|pnpm install/);
  assert.doesNotMatch(dockerfile, /migrate|migration|db:push|drizzle|predeploy/i);
});

test('portabilidade: build context não leva ambiente, dados, testes ou dependências locais', () => {
  const ignore = ler('.dockerignore');
  for (const item of ['.git', '.env', 'node_modules', 'test', 'data', '.manus-logs']) assert.match(ignore, new RegExp(`^${item.replace('.', '\\.')}$`, 'm'));
});

test('portabilidade: plugin Manus não está no manifesto nem nos lockfiles', () => {
  assert.doesNotMatch(ler('package.json'), /vite-plugin-manus-runtime/);
  assert.doesNotMatch(ler('pnpm-lock.yaml'), /vite-plugin-manus-runtime/);
  assert.doesNotMatch(ler('package-lock.json'), /vite-plugin-manus-runtime/);
});
