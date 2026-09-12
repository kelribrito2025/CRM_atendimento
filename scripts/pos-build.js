'use strict';

// Roda depois do `vite build`. Cria dist/index.js, o ponto de entrada que a
// publicação do Manus espera (`node dist/index.js`). Ele apenas inicia o
// servidor normal (server.js), que já serve a versão compilada em dist/public.

const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.js'), [
  "'use strict';",
  '// Gerado por `npm run build`. Inicia o CRM (server.js) da pasta acima.',
  "require('../server.js');",
  '',
].join('\n'));
console.log('dist/index.js criado (ponto de entrada para publicação).');
