'use strict';

// Inicia o CRM sem o Vite e serve o build, quando disponível.
process.removeAllListeners('warning');
process.on('warning', (aviso) => {
  if (aviso.name === 'ExperimentalWarning' && /SQLite/i.test(aviso.message)) return;
  console.warn('Aviso do processo.');
});

const { montarSistema, mostrarBoasVindas } = require('./src/sistema');
const TEMPO_DRAIN_MS = 10_000;
let servidor = null;
let sistema = null;
let encerrando = false;

async function encerrar(sinal, codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  // O limite cobre requisições E fechamento do pool; não apenas server.close.
  const limite = setTimeout(() => {
    servidor?.closeAllConnections?.();
    console.error('Prazo de encerramento excedido.');
    process.exit(1);
  }, TEMPO_DRAIN_MS);
  limite.unref?.();
  try {
    sistema?.pararAutomacoes?.();
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    await sistema?.fechar?.();
  } catch {
    codigo = 1;
    console.error('Falha ao encerrar recursos do CRM.');
  }
  clearTimeout(limite);
  console.log(`Encerramento solicitado (${sinal}).`);
  process.exit(codigo);
}

process.on('SIGTERM', () => { void encerrar('SIGTERM'); });
process.on('SIGINT', () => { void encerrar('SIGINT'); });

montarSistema().then(async (montado) => {
  sistema = montado;
  if (encerrando) { await montado.fechar?.(); return; }
  const { app, config } = montado;
  servidor = app.listen(config.porta, '0.0.0.0', () => {
    mostrarBoasVindas(montado, `http://0.0.0.0:${config.porta}`);
  });
  servidor.on('error', () => {
    console.error('Não foi possível escutar na porta configurada.');
    void encerrar('erro de escuta', 1);
  });
}).catch(() => {
  console.error('Não foi possível iniciar o CRM.');
  process.exit(1);
});
