export const CHAVE_SOM_NOTIFICACOES = 'crm_som_notificacoes';

export function lerSomAtivo(armazenamento = localStorage) {
  try {
    return armazenamento.getItem(CHAVE_SOM_NOTIFICACOES) !== 'off';
  } catch {
    return true;
  }
}

export function gravarSomAtivo(ativo, armazenamento = localStorage) {
  const ligado = Boolean(ativo);
  try {
    armazenamento.setItem(CHAVE_SOM_NOTIFICACOES, ligado ? 'on' : 'off');
  } catch {
    /* A preferência vale nesta aba mesmo se o navegador bloquear o armazenamento. */
  }
  return ligado;
}

export function deveTocarNotificacao(recebeuMensagem, somAtivo) {
  return Boolean(recebeuMensagem && somAtivo);
}
