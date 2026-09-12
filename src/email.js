'use strict';

// Envio de e-mails (código de verificação, link de nova senha).
//
// Ainda não há servidor de e-mail configurado. Enquanto isso, as mensagens
// são mostradas na janela do servidor ("modo de teste"). Quando houver um
// serviço de e-mail, basta trocar a função `enviar` deste arquivo.

function criarEnviador({ modo = 'terminal' } = {}) {
  const enviados = [];
  return {
    modo,
    enviados,
    async enviar({ para, assunto, texto }) {
      enviados.push({ para, assunto, texto, em: Date.now() });
      if (enviados.length > 200) enviados.shift();
      if (modo === 'silencioso') return;
      console.log('');
      console.log('📧 E-MAIL DE TESTE (nenhum serviço de e-mail configurado)');
      console.log(`   Para: ${para}`);
      console.log(`   Assunto: ${assunto}`);
      for (const linha of String(texto).split('\n')) console.log(`   ${linha}`);
      console.log('');
    },
  };
}

module.exports = { criarEnviador };
