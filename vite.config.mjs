// Configuração do Vite — usada pelo CRM no desenvolvimento e no build.
// O plugin crm-atendimento integra o servidor Express ao modo de desenvolvimento.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(RAIZ, 'client');
const PAGINAS = ['login', 'escolher-atendente', 'atendimento', 'convite', 'verificar', 'recuperar', 'nova-senha', 'widget'];

function pluginCrm() {
  return {
    name: 'crm-atendimento',
    async configureServer(server) {
      const { montarSistema, mostrarBoasVindas } = require('./src/sistema.js');
      const sistema = await montarSistema({
        semEstaticos: true,
        publicoDir: path.resolve(CLIENT, 'public'),
        servirPagina: async (req, res, arquivo) => {
          try {
            const bruto = fs.readFileSync(path.join(CLIENT, arquivo), 'utf8');
            const html = await server.transformIndexHtml(req.originalUrl, bruto);
            res.type('html').send(html);
          } catch (erro) {
            res.status(500).type('text').send('Erro ao carregar a página: ' + erro.message);
          }
        },
      });
      server.httpServer?.once('listening', () => {
        const endereco = server.httpServer.address();
        const porta = typeof endereco === 'object' && endereco ? endereco.port : '';
        mostrarBoasVindas(sistema, 'http://localhost:' + porta);
      });
      return () => {
        server.middlewares.use(sistema.app);
      };
    },
  };
}

export default defineConfig({
  root: CLIENT,
  publicDir: path.resolve(CLIENT, 'public'),
  appType: 'custom',
  envDir: RAIZ,
  plugins: [pluginCrm()],
  build: {
    outDir: path.resolve(RAIZ, 'dist', 'public'),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(PAGINAS.map((p) => [p, path.resolve(CLIENT, p + '.html')])),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    allowedHosts: ['localhost', '127.0.0.1'],
    fs: { strict: true, deny: ['**/.*'] },
  },
  preview: { port: 3000, host: true },
});
