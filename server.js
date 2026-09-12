'use strict';

// Inicia o CRM sem o Vite: `npm start` (é o que os arquivos "iniciar" usam).
// Serve a versão compilada em dist/public se existir, senão os arquivos de client/.

const { montarSistema, mostrarBoasVindas, pastaPaginas } = require('./src/sistema');

const sistema = montarSistema();
const { app, config } = sistema;

app.listen(config.porta, () => {
  mostrarBoasVindas(sistema, `http://localhost:${config.porta}`);
  console.log(`📁 Páginas servidas de: ${pastaPaginas()}`);
  console.log('');
});
