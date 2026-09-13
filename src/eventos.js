'use strict';

// Aviso de "chegou mensagem".
//
// Antes as telas ficavam perguntando ao servidor de tempos em tempos, e por isso
// uma mensagem demorava alguns segundos para aparecer. Agora o servidor avisa na
// hora quem está com a tela aberta.
//
// O aviso não leva o conteúdo da mensagem, só diz que algo mudou: quem recebe
// busca pelo caminho normal, que já confere de quem é cada conversa. Assim um
// erro aqui nunca mostra a conversa de um cliente para outro.
//
// É de memória e vale só para este processo — se um dia o sistema rodar em duas
// máquinas, o aviso não cruza de uma para a outra. Por isso as telas continuam
// perguntando de tempos em tempos, como rede de segurança.
function criarAvisos() {
  const ouvintes = new Set();
  return {
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    avisar(evento) {
      // Cópia da lista: um ouvinte pode sair no meio do aviso.
      for (const ouvinte of [...ouvintes]) {
        try {
          ouvinte(evento);
        } catch {
          /* uma tela com problema não derruba as outras */
        }
      }
    },
    get quantos() {
      return ouvintes.size;
    },
  };
}

module.exports = { criarAvisos };
