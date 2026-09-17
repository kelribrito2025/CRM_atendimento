'use strict';

// Envio de e-mails (código de verificação, link de nova senha).
//
// Ainda não há servidor de e-mail configurado. As mensagens ficam disponíveis
// em memória para testes; quando houver um serviço de e-mail, basta trocar a
// função `enviar` deste arquivo.

function criarEnviador({ modo = 'terminal' } = {}) {
  const enviados = [];
  return {
    modo,
    enviados,
    async enviar({ para, assunto, texto }) {
      enviados.push({ para, assunto, texto, em: Date.now() });
      if (enviados.length > 200) enviados.shift();
      if (modo === 'silencioso') return;
      console.warn('Serviço de e-mail não configurado; mensagem mantida apenas em memória.');
    },
  };
}

module.exports = { criarEnviador };
