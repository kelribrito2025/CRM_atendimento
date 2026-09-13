export function capturarCompositor(documento = document) {
  const campoMensagem = documento.querySelector('#texto-msg');
  const campoNota = documento.querySelector('#texto-nota');
  const foco = documento.activeElement === campoMensagem ? 'mensagem'
    : (documento.activeElement === campoNota ? 'nota' : null);
  const campoFocado = foco === 'mensagem' ? campoMensagem : campoNota;

  return {
    textoMensagem: campoMensagem?.value,
    textoNota: campoNota?.value,
    foco,
    selecao: campoFocado
      ? { inicio: campoFocado.selectionStart, fim: campoFocado.selectionEnd }
      : null,
  };
}

export function restaurarCompositor(estado, { documento = document, ajustarAltura = () => {} } = {}) {
  const campoMensagem = documento.querySelector('#texto-msg');
  const campoNota = documento.querySelector('#texto-nota');

  if (campoMensagem && estado.textoMensagem !== undefined) {
    campoMensagem.value = estado.textoMensagem;
    ajustarAltura(campoMensagem);
  }
  if (campoNota && estado.textoNota !== undefined) campoNota.value = estado.textoNota;

  const campoFocado = estado.foco === 'mensagem' ? campoMensagem
    : (estado.foco === 'nota' ? campoNota : null);
  if (!campoFocado) return;

  campoFocado.focus({ preventScroll: true });
  if (estado.selecao && typeof campoFocado.setSelectionRange === 'function') {
    const limite = campoFocado.value.length;
    campoFocado.setSelectionRange(
      Math.min(estado.selecao.inicio ?? limite, limite),
      Math.min(estado.selecao.fim ?? limite, limite),
    );
  }
}
