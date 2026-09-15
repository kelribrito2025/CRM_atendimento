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
