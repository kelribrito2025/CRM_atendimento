// Acentuação automática do português: corrige a palavra quando o atendente
// termina de escrevê-la (espaço, ponto, vírgula…).
//
// Só corrige o que não tem outro sentido sem acento. Palavras como "esta/está",
// "e/é", "a/à", "de/dê" ficam de fora de propósito: sem saber a frase inteira,
// trocar essas mudaria o que a pessoa quis dizer.

// Terminações que quase sempre levam acento ou cedilha. A ordem importa:
// as mais específicas vêm primeiro ("coes" antes de "oes").
const REGRAS = [
  ['coes', 'ções'], // informacoes -> informações
  ['cao', 'ção'], // informacao -> informação
  ['oes', 'ões'], // cartoes -> cartões
  ['ao', 'ão'], // cartao -> cartão
  ['encias', 'ências'],
  ['encia', 'ência'], // transferencia -> transferência
  ['ancias', 'âncias'],
  ['ancia', 'ância'], // importancia -> importância
  ['aveis', 'áveis'],
  ['avel', 'ável'], // responsavel -> responsável
  ['iveis', 'íveis'],
  ['ivel', 'ível'], // disponivel -> disponível
  ['arios', 'ários'],
  ['ario', 'ário'], // usuario -> usuário
  ['arias', 'árias'],
  ['aria', 'ária'], // bancaria -> bancária
  ['orios', 'órios'],
  ['orio', 'ório'], // relatorio -> relatório
  ['orias', 'órias'],
  ['oria', 'ória'],
];

// Palavras do dia a dia do atendimento que não seguem regra.
const PALAVRAS = new Map(Object.entries({
  nao: 'não', voce: 'você', voces: 'vocês', entao: 'então', tambem: 'também',
  ola: 'olá', agua: 'água', aguas: 'águas', cafe: 'café', cafes: 'cafés',
  ate: 'até', apos: 'após', atras: 'atrás', atraves: 'através', alem: 'além',
  so: 'só', tres: 'três', mes: 'mês', pes: 'pés', ja: 'já', la: 'lá', ca: 'cá',
  agencia: 'agência', numero: 'número', numeros: 'números', codigo: 'código', codigos: 'códigos',
  servico: 'serviço', servicos: 'serviços', endereco: 'endereço', enderecos: 'endereços',
  preco: 'preço', precos: 'preços', comeco: 'começo', comecar: 'começar', comecou: 'começou',
  atencao: 'atenção', obrigacao: 'obrigação', licenca: 'licença', diferenca: 'diferença',
  seguranca: 'segurança', cobranca: 'cobrança', mudanca: 'mudança', confianca: 'confiança',
  crianca: 'criança', criancas: 'crianças', experiencia: 'experiência',
  saldo: 'saldo', credito: 'crédito', creditos: 'créditos', debito: 'débito', debitos: 'débitos',
  fatura: 'fatura', boleto: 'boleto', pagina: 'página', paginas: 'páginas',
  historico: 'histórico', automatico: 'automático', basico: 'básico', publico: 'público',
  unico: 'único', unica: 'única', proprio: 'próprio', propria: 'própria',
  minimo: 'mínimo', maximo: 'máximo', otimo: 'ótimo', otima: 'ótima', pessimo: 'péssimo',
  ultimo: 'último', ultima: 'última', ultimos: 'últimos', ultimas: 'últimas',
  proximo: 'próximo', proxima: 'próxima', proximos: 'próximos', proximas: 'próximas',
  rapido: 'rápido', rapida: 'rápida', facil: 'fácil', dificil: 'difícil',
  periodo: 'período', horario: 'horário', calendario: 'calendário',
  duvida: 'dúvida', duvidas: 'dúvidas', analise: 'análise', analises: 'análises',
  ideia: 'ideia', video: 'vídeo', videos: 'vídeos', audio: 'áudio', audios: 'áudios',
  pais: 'país', mae: 'mãe', pai: 'pai', irmao: 'irmão', irmaos: 'irmãos',
  amanha: 'amanhã', manha: 'manhã', ninguem: 'ninguém', alguem: 'alguém', porem: 'porém',
  parabens: 'parabéns', voltara: 'voltará', sera: 'será', serao: 'serão', estara: 'estará',
  estarao: 'estarão', tera: 'terá', terao: 'terão', fara: 'fará', farao: 'farão',
  podera: 'poderá', poderao: 'poderão', ira: 'irá', irao: 'irão', havera: 'haverá',
  ficara: 'ficará', ficarao: 'ficarão', precisara: 'precisará', devera: 'deverá',
  aparecera: 'aparecerá', chegara: 'chegará', comecara: 'começará',
  valido: 'válido', valida: 'válida', invalido: 'inválido', invalida: 'inválida',
  possivel: 'possível', impossivel: 'impossível', indisponivel: 'indisponível',
  usuario: 'usuário', usuarios: 'usuários', relatorio: 'relatório', relatorios: 'relatórios',
  necessario: 'necessário', necessaria: 'necessária', obrigatorio: 'obrigatório',
  bancario: 'bancário', bancaria: 'bancária', salario: 'salário', diario: 'diário',
  memoria: 'memória', categoria: 'categoria', transferencia: 'transferência',
  referencia: 'referência', urgencia: 'urgência', pendencia: 'pendência',
  assistencia: 'assistência', preferencia: 'preferência', importancia: 'importância',
  distancia: 'distância', instancia: 'instância', tolerancia: 'tolerância',
  responsavel: 'responsável', disponivel: 'disponível', visivel: 'visível',
  aceitavel: 'aceitável', confiavel: 'confiável', razoavel: 'razoável',
  vario: 'vário', varios: 'vários', varias: 'várias', proximidade: 'proximidade',
  familia: 'família', empresario: 'empresário', escritorio: 'escritório',
  inicio: 'início', iniciou: 'iniciou', beneficio: 'benefício', beneficios: 'benefícios',
  exercicio: 'exercício', prejuizo: 'prejuízo', juizo: 'juízo',
  numerario: 'numerário', tarifa: 'tarifa', conteudo: 'conteúdo', conteudos: 'conteúdos',
  reembolso: 'reembolso', estorno: 'estorno', cartao: 'cartão', cartoes: 'cartões',
  celular: 'celular', telefone: 'telefone', conexao: 'conexão', conexoes: 'conexões',
  sessao: 'sessão', sessoes: 'sessões', senha: 'senha', confirmacao: 'confirmação',
  solicitacao: 'solicitação', solicitacoes: 'solicitações', autorizacao: 'autorização',
  verificacao: 'verificação', validacao: 'validação', ativacao: 'ativação',
  aprovacao: 'aprovação', devolucao: 'devolução', resolucao: 'resolução',
  recarga: 'recarga', deposito: 'depósito', depositos: 'depósitos',
}));

function ehMaiuscula(letra) {
  return letra === letra.toUpperCase() && letra !== letra.toLowerCase();
}

// Devolve a palavra com o mesmo tipo de letra da original (Maiúscula, MAIÚSCULA).
function manterCaixa(original, corrigida) {
  if (original === original.toUpperCase() && /[A-ZÀ-Ý]{2,}/.test(original)) return corrigida.toUpperCase();
  if (ehMaiuscula(original[0])) return corrigida[0].toUpperCase() + corrigida.slice(1);
  return corrigida;
}

// Corrige uma palavra; devolve null quando não há nada a mudar.
export function corrigirPalavra(palavra) {
  const original = String(palavra || '');
  if (original.length < 2) return null;
  // Já tem acento ou não é uma palavra simples: não mexe.
  if (!/^[A-Za-z]+$/.test(original)) return null;

  const minuscula = original.toLowerCase();
  const daLista = PALAVRAS.get(minuscula);
  if (daLista && daLista !== minuscula) return manterCaixa(original, daLista);

  for (const [fim, troca] of REGRAS) {
    // Precisa sobrar pelo menos uma letra antes da terminação ("ao" sozinho não muda).
    if (minuscula.endsWith(fim) && minuscula.length > fim.length) {
      return manterCaixa(original, minuscula.slice(0, -fim.length) + troca);
    }
  }
  return null;
}

// Corrige o texto inteiro (usado ao colar ou antes de enviar).
export function corrigirTexto(texto) {
  return String(texto || '').replace(/[A-Za-z]+/g, (p) => corrigirPalavra(p) ?? p);
}

export { PALAVRAS, REGRAS };
