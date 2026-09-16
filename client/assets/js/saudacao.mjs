export function periodoDaSaudacao(agora = new Date()) {
  const hora = agora instanceof Date ? agora.getHours() : new Date(agora).getHours();
  if (hora >= 5 && hora < 12) return 'bom dia';
  if (hora >= 12 && hora < 18) return 'boa tarde';
  return 'boa noite';
}

export function textoDaRespostaRapida(resposta, agora = new Date()) {
  if (resposta?.dinamica !== 'saudacao') return String(resposta?.texto || '');
  return `Olá, ${periodoDaSaudacao(agora)}, tudo bem? Como podemos ajudar?`;
}

// Expande somente o token // junto ao cursor. Não altera protocolos, caminhos
// nem o restante do rascunho. Quem chama decide se foi digitação ou colagem.
export function expandirAtalhoSaudacao(texto, inicio, fim = inicio, agora = new Date()) {
  if (typeof texto !== 'string' || !Number.isInteger(inicio) || inicio < 2
      || inicio > texto.length || inicio !== fim) return null;
  const antes = texto.slice(0, inicio);
  const depois = texto.slice(inicio);
  if (!/(?:^|\s)\/\/$/u.test(antes) || (depois && !/^\s/u.test(depois))) return null;
  const prefixo = antes.slice(0, -2);
  const saudacao = textoDaRespostaRapida({ dinamica: 'saudacao' }, agora);
  return { texto: prefixo + saudacao + depois, cursor: prefixo.length + saudacao.length };
}
