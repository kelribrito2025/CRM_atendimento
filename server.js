'use strict';

// Inicia o CRM sem o Vite: `npm start` (é o que os arquivos "iniciar" usam)
// ou `node dist/index.js` (publicação). Serve a versão compilada em dist/public
// se existir, senão os arquivos de client/.

// O banco embutido do Node ainda é marcado como "experimental": esconde só esse aviso.
process.removeAllListeners('warning');
process.on('warning', (aviso) => {
  if (aviso.name === 'ExperimentalWarning' && /SQLite/i.test(aviso.message)) return;
  console.warn(aviso);
});

const { montarSistema, mostrarBoasVindas, pastaPaginas } = require('./src/sistema');

montarSistema().then((sistema) => {
  const { app, config } = sistema;
  app.listen(config.porta, () => {
    mostrarBoasVindas(sistema, `http://localhost:${config.porta}`);
    console.log(`📁 Páginas servidas de: ${pastaPaginas()}`);
    console.log('');
  });
}).catch((erro) => {
  console.error('');
  console.error('❌ Não foi possível iniciar o CRM:', erro.message);
  console.error('   Se estiver usando banco na nuvem, confira a variável DATABASE_URL.');
  console.error('');
  process.exit(1);
});
