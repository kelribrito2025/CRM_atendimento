// Configuração do Vite — usada pelo Manus (`pnpm dev` / `npm run dev`) e pelo `npm run build`.
//
// O servidor do CRM (login, API, banco de dados) roda DENTRO do servidor do Vite,
// então o projeto funciona completo no Manus, com login de verdade.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(RAIZ, 'client');
const PAGINAS = ['login', 'atendimento', 'convite', 'verificar', 'recuperar', 'nova-senha'];

/* ------------------------- CRM dentro do Vite ------------------------- */
function pluginCrm() {
  return {
    name: 'crm-atendimento',
    configureServer(server) {
      const { montarSistema, mostrarBoasVindas } = require('./src/sistema.js');
      const sistema = montarSistema({
        semEstaticos: true, // o Vite serve /assets, /icones e /vendor no modo dev
        publicoDir: path.resolve(CLIENT, 'public'),
        servirPagina: async (req, res, arquivo) => {
          try {
            const bruto = fs.readFileSync(path.join(CLIENT, arquivo), 'utf8');
            const html = await server.transformIndexHtml(req.originalUrl, bruto);
            res.type('html').send(html);
          } catch (erro) {
            res.status(500).type('text').send(`Erro ao carregar a página: ${erro.message}`);
          }
        },
      });
      server.httpServer?.once('listening', () => {
        const endereco = server.httpServer.address();
        const porta = typeof endereco === 'object' && endereco ? endereco.port : '';
        mostrarBoasVindas(sistema, `http://localhost:${porta}`);
      });
      // Registrado depois dos middlewares internos do Vite, para que
      // /assets e /__manus__ continuem sendo servidos pelo próprio Vite.
      return () => {
        server.middlewares.use(sistema.app);
      };
    },
  };
}

/* ------------------- Coletor de logs do Manus (dev) ------------------- */
const LOG_DIR = path.join(RAIZ, '.manus-logs');
const MAX_LOG_SIZE_BYTES = 1024 * 1024;
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);

function trimLogFile(logPath) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= MAX_LOG_SIZE_BYTES) return;
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
    const kept = [];
    let bytes = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const size = Buffer.byteLength(`${lines[i]}\n`, 'utf-8');
      if (bytes + size > TRIM_TARGET_BYTES) break;
      kept.unshift(lines[i]);
      bytes += size;
    }
    fs.writeFileSync(logPath, kept.join('\n'), 'utf-8');
  } catch { /* ignora */ }
}

function writeToLogFile(source, entries) {
  if (!entries?.length) return;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => `[${new Date().toISOString()}] ${JSON.stringify(entry)}`);
  fs.appendFileSync(logPath, `${lines.join('\n')}\n`, 'utf-8');
  trimLogFile(logPath);
}

function pluginManusDebugCollector() {
  return {
    name: 'manus-debug-collector',
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === 'production') return html;
      return {
        html,
        tags: [{ tag: 'script', attrs: { src: '/__manus__/debug-collector.js', defer: true }, injectTo: 'head' }],
      };
    },
    configureServer(server) {
      server.middlewares.use('/__manus__/logs', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            writeToLogFile('browserConsole', payload.consoleLogs);
            writeToLogFile('networkRequests', payload.networkRequests);
            writeToLogFile('sessionReplay', payload.sessionEvents);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/* ------------------- Proxy de armazenamento do Manus ------------------- */
function pluginManusStorageProxy() {
  return {
    name: 'manus-storage-proxy',
    configureServer(server) {
      server.middlewares.use('/manus-storage', async (req, res) => {
        const key = req.url?.replace(/^\//, '');
        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || '').replace(/\/+$/, '');
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
        if (!key) { res.writeHead(400); return res.end('Missing storage key'); }
        if (!forgeBaseUrl || !forgeKey) { res.writeHead(500); return res.end('Storage proxy not configured'); }
        try {
          const url = new URL('v1/storage/presign/get', `${forgeBaseUrl}/`);
          url.searchParams.set('path', key);
          const resposta = await fetch(url, { headers: { Authorization: `Bearer ${forgeKey}` } });
          if (!resposta.ok) { res.writeHead(502); return res.end('Storage backend error'); }
          const { url: assinada } = await resposta.json();
          if (!assinada) { res.writeHead(502); return res.end('Empty signed URL'); }
          res.writeHead(307, { Location: assinada, 'Cache-Control': 'no-store' });
          res.end();
        } catch {
          res.writeHead(502);
          res.end('Storage proxy error');
        }
      });
    },
  };
}

async function pluginManusRuntime() {
  try {
    const modulo = await import('vite-plugin-manus-runtime');
    return [modulo.vitePluginManusRuntime()];
  } catch {
    return []; // fora do Manus o plugin não é necessário
  }
}

export default defineConfig(async ({ command }) => ({
  root: CLIENT,
  publicDir: path.resolve(CLIENT, 'public'),
  appType: 'custom', // as páginas passam pelo servidor do CRM (login obrigatório)
  envDir: RAIZ,
  // O runtime do Manus só entra no modo dev (prévia); a versão compilada fica limpa.
  plugins: [pluginCrm(), pluginManusDebugCollector(), pluginManusStorageProxy(), ...(command === 'serve' ? await pluginManusRuntime() : [])],
  build: {
    outDir: path.resolve(RAIZ, 'dist', 'public'),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(PAGINAS.map((p) => [p, path.resolve(CLIENT, `${p}.html`)])),
    },
  },
  server: {
    port: 3000,
    strictPort: false, // se a 3000 estiver ocupada, usa a próxima livre
    host: true,
    allowedHosts: [
      '.manuspre.computer',
      '.manus.computer',
      '.manus-asia.computer',
      '.manuscomputer.ai',
      '.manusvm.computer',
      'localhost',
      '127.0.0.1',
    ],
    fs: { strict: true, deny: ['**/.*'] },
  },
  preview: { port: 3000, host: true },
}));
