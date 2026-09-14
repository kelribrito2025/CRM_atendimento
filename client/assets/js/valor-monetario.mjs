const formatoInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatarValorEmCentavos(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digitos) return '';

  const centavos = Number.parseInt(digitos, 10);
  if (!Number.isSafeInteger(centavos)) return '';

  const inteiros = Math.floor(centavos / 100);
  const decimais = String(centavos % 100).padStart(2, '0');
  return `${formatoInteiro.format(inteiros)},${decimais}`;
}

export function centavosDoValorFormatado(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos) return null;

  const centavos = Number.parseInt(digitos, 10);
  return Number.isSafeInteger(centavos) && centavos > 0 ? centavos : null;
}
