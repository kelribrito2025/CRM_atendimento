'use strict';

// Bloqueia temporariamente quem erra a senha muitas vezes seguidas.
class LimitadorTentativas {
  constructor({ maximo = 8, janelaMs = 15 * 60 * 1000 } = {}) {
    this.maximo = maximo;
    this.janelaMs = janelaMs;
    this.registros = new Map();
  }

  _limparAntigos(agora) {
    if (this.registros.size < 1000) return;
    for (const [chave, r] of this.registros) {
      if (r.primeiraEm + this.janelaMs < agora && (!r.bloqueadoAte || r.bloqueadoAte < agora)) {
        this.registros.delete(chave);
      }
    }
  }

  // Retorna quantos ms faltam para liberar (0 = liberado).
  bloqueadoPor(chave) {
    const r = this.registros.get(chave);
    if (!r || !r.bloqueadoAte) return 0;
    const restante = r.bloqueadoAte - Date.now();
    if (restante <= 0) {
      this.registros.delete(chave);
      return 0;
    }
    return restante;
  }

  registrarFalha(chave) {
    const agora = Date.now();
    this._limparAntigos(agora);
    let r = this.registros.get(chave);
    if (!r || r.primeiraEm + this.janelaMs < agora) {
      r = { tentativas: 0, primeiraEm: agora, bloqueadoAte: null };
      this.registros.set(chave, r);
    }
    r.tentativas += 1;
    if (r.tentativas >= this.maximo) r.bloqueadoAte = agora + this.janelaMs;
    return r;
  }

  limpar(chave) {
    this.registros.delete(chave);
  }
}

module.exports = { LimitadorTentativas };
