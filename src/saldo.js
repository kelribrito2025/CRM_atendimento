'use strict';

// Ficha do cliente pela API de agentes do Número Virtual: saldo, compras e
// extrato. A chave do agente fica só no servidor — o navegador nunca a recebe.
//
// São três POSTs irmãos, todos com { pin } (número) no corpo:
//   /customer/lookup        saldo, recargas e situação da conta
//   /customer/activations   compras (ativações), com paginação por cursor
//   /customer/transactions  extrato, com o saldo antes e depois de cada linha
// Todos só leem: a chave do CRM tem pode_consultar e nada de dinheiro.

const URL_PADRAO = 'https://app.numero-virtual.com/api/agents/customer/lookup';

class ErroSaldo extends Error {
  constructor(mensagem, { status = 0, naoEncontrado = false, codigo = null, podeRepetir = false } = {}) {
    super(mensagem);
    this.name = 'ErroSaldo';
    this.status = status;
    this.naoEncontrado = naoEncontrado;
    // Código estável da recusa (ver RECADO_DA_RECUSA) e se vale tentar de novo
    // com a MESMA marca de segurança.
    this.codigo = codigo;
    this.podeRepetir = podeRepetir;
  }
}

// O PIN precisa ir como número; o campo da tela entrega texto.
function normalizarPin(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos || digitos.length > 12) return null;
  const numero = Number(digitos);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function emReais(centavos) {
  return (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Guarda o valor em centavos (inteiro) para nunca somar em reais.
function centavosDe(cliente) {
  if (Number.isFinite(cliente?.balanceCents)) return Math.round(cliente.balanceCents);
  if (Number.isFinite(cliente?.balance)) return Math.round(cliente.balance * 100);
  return 0;
}

const ROTULO_STATUS = { active: 'ativa', deactivated: 'desativada', deleted: 'excluída' };

// A situação da conta vem decidida pelo site, pela mesma função que o login dele
// usa para barrar — então a nossa tela e o login nunca discordam.
//
// Deduzir pelo status cru não funciona: existem contas com status "active" que
// estão bloqueadas de fato, e a tela mostrava "Ativa / Sem bloqueio" para elas.
// O trecho abaixo só deduz quando o site é antigo e não manda a decisão.
function situacaoDoCliente(dados) {
  const status = dados?.status || null;
  const banida = Boolean(dados?.banned ?? dados?.banida);
  const pronta = dados?.situacao;
  const situacao = pronta && typeof pronta.permitida === 'boolean'
    ? { permitida: pronta.permitida, motivo: pronta.motivo || null, mensagem: pronta.mensagem || null }
    : deduzirSituacao({ banida, status });
  return {
    status,
    statusTexto: ROTULO_STATUS[status] || status || null,
    bloqueada: banida,
    ativa: typeof dados?.ativa === 'boolean' ? dados.ativa : status === 'active',
    encerradaPeloTitular: Boolean(dados?.encerradaPeloTitular),
    situacao,
  };
}

function deduzirSituacao({ banida, status }) {
  if (banida) return { permitida: false, motivo: 'banida', mensagem: 'Esta conta foi bloqueada.' };
  if (status && status !== 'active') return { permitida: false, motivo: 'desativada', mensagem: 'Esta conta está desativada.' };
  return { permitida: true, motivo: null, mensagem: null };
}

// Devolve só o que a tela precisa mostrar.
function resumirCliente(cliente) {
  const centavos = centavosDe(cliente);
  const recargas = Array.isArray(cliente?.recharges) ? cliente.recharges : [];
  return {
    nome: cliente?.name || null,
    email: cliente?.email || null,
    pin: Number.isFinite(cliente?.pin) ? cliente.pin : null,
    saldoCentavos: centavos,
    saldo: emReais(centavos),
    ...situacaoDoCliente(cliente),
    totalRecargas: Number.isFinite(cliente?.totalRecharges) ? cliente.totalRecharges : recargas.length,
    // Quantos reembolsos este cliente já recebeu. O campo ainda não vem da API
    // do site: quando vier, a ficha mostra sozinha, sem mexer na tela.
    totalReembolsos: Number.isFinite(cliente?.totalRefunds) ? cliente.totalRefunds : null,
    ultimaRecarga: recargas.length ? resumirRecarga(recargas[0]) : null,
  };
}

const ROTULO_ATIVACAO = {
  pending: 'Pendente', active: 'Ativa', completed: 'Concluída',
  cancelled: 'Cancelada', failed: 'Falhou', expired: 'Expirada',
};

// Uma compra (ativação) como a ficha mostra. De propósito não carregamos o
// custo de fornecedor que vem na resposta: é margem do Número Virtual e a tela
// do atendente não tem o que fazer com ela.
function resumirCompra(a) {
  const centavos = Number.isFinite(a?.sellingPriceCents) ? Math.round(a.sellingPriceCents)
    : (Number.isFinite(a?.sellingPrice) ? Math.round(a.sellingPrice * 100) : 0);
  const rotulo = [a?.service?.name, a?.country?.name].filter(Boolean).join(' · ');
  return {
    id: a?.id ?? null,
    descricao: a?.descricao || rotulo || 'Compra',
    numero: a?.phoneNumber || null,
    valor: emReais(centavos),
    valorCentavos: centavos,
    status: a?.status || null,
    statusTexto: ROTULO_ATIVACAO[a?.status] || a?.status || '—',
    reembolsada: Boolean(a?.isRefunded),
    podeReembolsar: Boolean(a?.podeReembolsar),
    motivoNaoPodeReembolsar: a?.motivoNaoPodeReembolsar || null,
    recebeuSms: Boolean(a?.recebeuSms),
    data: a?.createdAt || null,
  };
}

// Uma linha do extrato. O valor vem com sinal e o saldo que ficou depois dela.
function resumirTransacao(t) {
  const centavos = Number.isFinite(t?.valorCents) ? Math.round(t.valorCents)
    : (Number.isFinite(t?.valor) ? Math.round(t.valor * 100) : 0);
  const depois = Number.isFinite(t?.saldoDepoisCents) ? Math.round(t.saldoDepoisCents)
    : (Number.isFinite(t?.saldoDepois) ? Math.round(t.saldoDepois * 100) : null);
  return {
    id: t?.id ?? null,
    tipo: t?.tipo || 'outro',
    tipoTexto: t?.tipoLegivel || 'Movimentação',
    descricao: t?.descricao || t?.tipoLegivel || 'Movimentação',
    valor: emReais(centavos),
    valorCentavos: centavos,
    entrada: typeof t?.entrada === 'boolean' ? t.entrada : centavos >= 0,
    saldoDepois: depois === null ? null : emReais(depois),
    ativacaoId: Number.isFinite(t?.ativacaoId) ? t.ativacaoId : null,
    feitoPorAdmin: Boolean(t?.feitoPorAdmin),
    data: t?.data || null,
  };
}

function resumirRecarga(r) {
  const centavos = Number.isFinite(r?.amountCents) ? Math.round(r.amountCents)
    : (Number.isFinite(r?.valueCents) ? Math.round(r.valueCents)
      : (Number.isFinite(r?.amount) ? Math.round(r.amount * 100) : 0));
  const data = r?.createdAt || r?.created_at || r?.date || null;
  return { valor: emReais(centavos), valorCentavos: centavos, data };
}

// As ações de saldo ficam em /api/agents/saldo/<ação>, um nível acima das
// consultas (/api/agents/customer/<consulta>).
function enderecoDaAcao(url, nome) {
  const limpo = String(url || URL_PADRAO).trim().replace(/\/+$/, '');
  const corte = limpo.lastIndexOf('/customer/');
  const base = corte >= 0 ? limpo.slice(0, corte) : limpo.split('/').slice(0, -2).join('/');
  return `${base}/saldo/${nome}`;
}

// Recados em português para cada motivo de recusa. O código é estável; o texto
// do outro lado pode mudar, então quem manda aqui é o código.
const RECADO_DA_RECUSA = {
  sem_idempotency_key: 'O CRM não enviou a marca de segurança da operação. Recarregue a página e tente de novo.',
  chave_repetida_corpo_diferente: 'Este pedido já foi enviado com outros dados. Feche esta janela e comece de novo.',
  operacao_em_andamento: 'Esta operação ainda está sendo processada. Espere um instante e tente de novo.',
  cliente_nao_encontrado: 'Nenhum cliente encontrado com este PIN.',
  saldo_insuficiente: 'Saldo insuficiente para este débito. O saldo do cliente não foi alterado.',
  // conta_bloqueada de propósito não está aqui: o texto que o site manda nesse
  // caso traz o motivo do bloqueio ("fraude confirmada", por exemplo), e trocar
  // por um recado nosso perderia justamente a parte útil.
  compra_ja_reembolsada: 'Esta compra já foi reembolsada — o dinheiro já voltou para o cliente.',
  compra_nao_reembolsavel: 'Esta compra não existe ou não é deste cliente.',
  erro_interno: 'O sistema do site teve um erro. Pode tentar de novo: a operação não foi feita duas vezes.',
};

// As quatro ações de conta também são irmãs do /customer/lookup.
const CAMINHO_DA_CONTA = { desativar: 'deactivate', reativar: 'reactivate', banir: 'ban', desbanir: 'unban' };

// A mesma recusa quer dizer coisas diferentes conforme a ação, e o atendente
// precisa saber o que fazer em seguida — por isso o recado é por ação.
const RECADO_DA_CONTA = {
  desativar: {
    conta_banida: 'Esta conta já está banida, ou seja, já está bloqueada. Desativar não mudaria nada.',
    conta_encerrada_pelo_titular: 'Esta conta foi encerrada pelo próprio cliente — ela já está fora do ar.',
  },
  reativar: {
    conta_banida: 'Esta conta está banida. Reativar não desbloqueia: é preciso desbanir primeiro.',
    conta_encerrada_pelo_titular: 'Esta conta foi encerrada pelo próprio cliente. Reabrir é decisão de administrador, pelo painel do site.',
  },
};

// Os três endpoints são irmãos: trocam só o último pedaço do endereço.
function enderecoIrmao(url, nome) {
  const limpo = String(url || URL_PADRAO).trim().replace(/\/+$/, '');
  return `${limpo.slice(0, limpo.lastIndexOf('/'))}/${nome}`;
}

function criarSaldo({ url = URL_PADRAO, token = '', fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const endereco = String(url || URL_PADRAO).trim();
  const chave = String(token || '').trim();
  const configurado = Boolean(endereco && chave);

  // Uma chamada só, com os mesmos recados de erro para os três endpoints.
  async function chamar(destino, corpo) {
    if (!configurado) throw new ErroSaldo('Consulta de saldo não configurada. Preencha SALDO_TOKEN no arquivo .env e reinicie o sistema.', { status: 400 });

    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), timeoutMs);
    let resposta;
    try {
      resposta = await fetchImpl(destino, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });
    } catch (erro) {
      const motivo = erro.name === 'AbortError' ? 'tempo esgotado' : erro.message;
      throw new ErroSaldo(`Não foi possível falar com o sistema de saldo (${motivo}).`);
    } finally {
      clearTimeout(temporizador);
    }

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }

    if (resposta.status === 404) throw new ErroSaldo('Nenhum cliente encontrado com este PIN.', { status: 404, naoEncontrado: true });
    if (resposta.status === 401) throw new ErroSaldo('A chave de acesso ao sistema de saldo é inválida ou expirou. Avise o administrador.', { status: 401 });
    if (resposta.status === 403) throw new ErroSaldo('A chave do CRM não tem permissão para esta consulta. Avise o administrador.', { status: 403 });
    if (resposta.status === 429) throw new ErroSaldo('Muitas consultas seguidas ao sistema de saldo. Espere um minuto e tente de novo.', { status: 429 });
    if (resposta.status === 400) throw new ErroSaldo('Digite um PIN válido (só números).', { status: 400 });
    if (!resposta.ok) throw new ErroSaldo('O sistema de saldo respondeu com erro. Tente de novo em instantes.', { status: resposta.status });
    if (!dados || typeof dados !== 'object') throw new ErroSaldo('O sistema de saldo devolveu uma resposta inesperada.');
    return dados;
  }

  // O PIN vai como NÚMERO nestes endpoints (no chat do site ele é texto, para
  // não perder zero à esquerda). Converter aqui evita 400 do outro lado.
  function pinNumero(pinBruto) {
    const pin = normalizarPin(pinBruto);
    if (pin === null) throw new ErroSaldo('Digite um PIN válido (só números).', { status: 400 });
    return pin;
  }

  async function consultarPorPin(pinBruto) {
    return resumirCliente(await chamar(endereco, { pin: pinNumero(pinBruto) }));
  }

  // Compras (ativações), da mais nova para a mais antiga.
  async function listarCompras(pinBruto, { limite = 20, cursor = null } = {}) {
    const corpo = { pin: pinNumero(pinBruto), limit: Math.min(Math.max(Number(limite) || 20, 1), 100) };
    if (Number.isFinite(Number(cursor)) && cursor !== null) corpo.cursor = Number(cursor);
    const dados = await chamar(enderecoIrmao(endereco, 'activations'), corpo);
    const lista = Array.isArray(dados.activations) ? dados.activations : [];
    return {
      compras: lista.map(resumirCompra),
      total: Number.isFinite(dados.total) ? dados.total : lista.length,
      proximoCursor: Number.isFinite(dados.proximoCursor) ? dados.proximoCursor : null,
    };
  }

  // Extrato: cada linha traz o saldo que ficou depois dela.
  async function listarTransacoes(pinBruto, { limite = 30, cursor = null } = {}) {
    const corpo = { pin: pinNumero(pinBruto), limit: Math.min(Math.max(Number(limite) || 30, 1), 100) };
    if (Number.isFinite(Number(cursor)) && cursor !== null) corpo.cursor = Number(cursor);
    const dados = await chamar(enderecoIrmao(endereco, 'transactions'), corpo);
    const lista = Array.isArray(dados.transactions) ? dados.transactions : [];
    return {
      transacoes: lista.map(resumirTransacao),
      total: Number.isFinite(dados.total) ? dados.total : lista.length,
      proximoCursor: Number.isFinite(dados.proximoCursor) ? dados.proximoCursor : null,
    };
  }

  // ===== Ações que mudam alguma coisa =====
  //
  // A marca de segurança (Idempotency-Key) vem de fora, criada no clique do
  // atendente: se a rede cair e o CRM repetir, o site devolve o resultado da
  // primeira em vez de fazer de novo. Por isso ela NUNCA é criada aqui —
  // aqui já seria tarde, cada tentativa ganharia uma marca diferente.
  //
  // Dinheiro e conta seguem o mesmo desenho, então a conferência do pedido e o
  // envio são os mesmos; muda só o endereço e o que volta na resposta.
  function conferirPedido({ pin, motivo, atendente, chaveIdempotencia }) {
    if (!configurado) throw new ErroSaldo('Ações no site não configuradas. Preencha SALDO_TOKEN no arquivo .env e reinicie o sistema.', { status: 400 });
    const marca = String(chaveIdempotencia || '').trim();
    if (!marca || marca.length > 120) throw new ErroSaldo(RECADO_DA_RECUSA.sem_idempotency_key, { status: 400, codigo: 'sem_idempotency_key' });

    const razao = String(motivo || '').trim();
    if (razao.length > 300) {
      throw new ErroSaldo('O motivo pode ter no máximo 300 caracteres.', { status: 400, codigo: 'dados_invalidos' });
    }
    if (!atendente?.nome || !String(atendente?.email || '').includes('@')) {
      throw new ErroSaldo('Faltou identificar o atendente. Saia e entre de novo no CRM.', { status: 400, codigo: 'dados_invalidos' });
    }

    const corpo = {
      pin: pinNumero(pin),
      atendente: { id: String(atendente.id), nome: String(atendente.nome), email: String(atendente.email) },
    };
    // Motivo vazio não vai como campo em branco: o site trata a ausência.
    if (razao) corpo.motivo = razao;
    return { marca, corpo };
  }

  // Manda o pedido e devolve a resposta já lida. Recusa vira ErroSaldo com o
  // código do site: quem escolhe o recado da tela é o código, não o texto.
  async function postar(destino, marca, corpo, recados) {
    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), timeoutMs);
    let resposta;
    try {
      resposta = await fetchImpl(destino, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': marca,
        },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });
    } catch (erro) {
      // Não sabemos se chegou. Repetir com a MESMA marca é seguro — é para isso
      // que ela existe — então o recado convida a tentar de novo.
      const motivoFalha = erro.name === 'AbortError' ? 'tempo esgotado' : erro.message;
      throw new ErroSaldo(`Não deu para falar com o sistema do site (${motivoFalha}). Tente de novo: a operação não será feita duas vezes.`, { podeRepetir: true });
    } finally {
      clearTimeout(temporizador);
    }

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }

    if (!resposta.ok) {
      const codigo = dados?.codigo || null;
      if (resposta.status === 429) throw new ErroSaldo('Muitas operações seguidas. Espere um minuto e tente de novo.', { status: 429, codigo, podeRepetir: true });
      // Quando o site manda um código, ele está dizendo o motivo exato — e o
      // número da resposta vira detalhe. Um 403 com código pode ser "esta conta
      // está bloqueada", e dizer ao atendente que a CHAVE está sem permissão o
      // faria chamar o administrador por um problema que não existe.
      if (!codigo) {
        if (resposta.status === 403) throw new ErroSaldo('A chave do CRM não tem permissão para esta ação. Avise o administrador.', { status: 403, codigo });
        if (resposta.status === 401) throw new ErroSaldo('A chave de acesso ao sistema do site é inválida ou expirou. Avise o administrador.', { status: 401, codigo });
      }
      const recado = recados[codigo] || RECADO_DA_RECUSA[codigo] || dados?.message || 'O sistema do site recusou a operação.';
      throw new ErroSaldo(recado, {
        status: resposta.status,
        codigo,
        naoEncontrado: codigo === 'cliente_nao_encontrado',
        // Estes dois valem repetir com a mesma marca; os outros não.
        podeRepetir: codigo === 'operacao_em_andamento' || codigo === 'erro_interno',
      });
    }
    if (!dados?.success) throw new ErroSaldo('O sistema do site devolveu uma resposta inesperada.');
    // Verdadeiro quando o site devolveu o resultado guardado de uma tentativa
    // anterior, em vez de fazer a operação de novo.
    return { dados, repetida: resposta.headers.get?.('Idempotency-Replayed') === 'true' };
  }

  async function acaoDeSaldo(nome, { pin, valorCents, activationId, motivo, atendente, chaveIdempotencia }) {
    const { marca, corpo } = conferirPedido({ pin, motivo, atendente, chaveIdempotencia });
    if (nome === 'reembolsar') {
      const id = Number(activationId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new ErroSaldo('Escolha a compra que será reembolsada.', { status: 400, codigo: 'dados_invalidos' });
      corpo.activationId = id;
      // valorCents no reembolso é ignorado pelo site: quem manda é o preço da compra.
    } else {
      const centavos = Number(valorCents);
      if (!Number.isSafeInteger(centavos) || centavos <= 0) {
        throw new ErroSaldo('Digite um valor maior que zero.', { status: 400, codigo: 'dados_invalidos' });
      }
      corpo.valorCents = centavos;
    }

    const { dados, repetida } = await postar(enderecoDaAcao(endereco, nome), marca, corpo, {});
    const centavos = Number.isFinite(dados.valorCents) ? Math.round(dados.valorCents) : 0;
    const atual = Number.isFinite(dados.saldoAtualCents) ? Math.round(dados.saldoAtualCents) : 0;
    const anterior = Number.isFinite(dados.saldoAnteriorCents) ? Math.round(dados.saldoAnteriorCents) : null;
    return {
      acao: nome,
      clienteId: dados.clienteId ?? null,
      activationId: dados.activationId ?? null,
      valorCentavos: centavos,
      valor: emReais(Math.abs(centavos)),
      saldoAnteriorCentavos: anterior,
      saldoAnterior: anterior === null ? null : emReais(anterior),
      saldoAtualCentavos: atual,
      saldoAtual: emReais(atual),
      repetida,
    };
  }

  // ===== Ações que mudam a situação da conta =====
  //
  // O site recusa as combinações que não fazem sentido (reativar conta banida,
  // por exemplo) para a tela não precisar decidir — e para o atendente não
  // achar que resolveu quando a conta continua bloqueada por outro motivo.
  async function acaoDeConta(nome, { pin, motivo, atendente, chaveIdempotencia }) {
    // Aqui o motivo é obrigatório, ao contrário das ações de saldo: é ele que
    // explica, meses depois, por que a conta de alguém foi cortada. O site
    // também exige — de 5 a 300 caracteres —, então mandar vazio só renderia
    // uma recusa confusa na cara do atendente.
    if (String(motivo || '').trim().length < 5) {
      throw new ErroSaldo('Escreva o motivo com pelo menos 5 caracteres — ele fica no registro da operação.', { status: 400, codigo: 'dados_invalidos' });
    }
    const { marca, corpo } = conferirPedido({ pin, motivo, atendente, chaveIdempotencia });
    const { dados, repetida } = await postar(
      enderecoIrmao(endereco, CAMINHO_DA_CONTA[nome]), marca, corpo, RECADO_DA_CONTA[nome] || {});
    return {
      acao: nome,
      clienteId: dados.clienteId ?? null,
      // A situação vem recalculada DEPOIS da mudança: desbanir uma conta que
      // também estava desativada devolve banida: false e permitida: false.
      ...situacaoDoCliente(dados),
      chavesRevogadas: Number.isFinite(dados.chavesRevogadas) ? dados.chavesRevogadas : 0,
      chavesRestauradas: Number.isFinite(dados.chavesRestauradas) ? dados.chavesRestauradas : 0,
      dispositivosRemovidos: Number.isFinite(dados.dispositivosRemovidos) ? dados.dispositivosRemovidos : 0,
      // A conta já estava no estado pedido: nada foi gravado, nem os acessos cortados.
      semMudanca: Boolean(dados.semMudanca),
      repetida,
    };
  }

  return {
    configurado,
    consultarPorPin,
    listarCompras,
    listarTransacoes,
    creditar: (dados) => acaoDeSaldo('creditar', dados),
    debitar: (dados) => acaoDeSaldo('debitar', dados),
    reembolsar: (dados) => acaoDeSaldo('reembolsar', dados),
    desativar: (dados) => acaoDeConta('desativar', dados),
    reativar: (dados) => acaoDeConta('reativar', dados),
    banir: (dados) => acaoDeConta('banir', dados),
    desbanir: (dados) => acaoDeConta('desbanir', dados),
  };
}

module.exports = { criarSaldo, normalizarPin, resumirCliente, resumirCompra, resumirTransacao, situacaoDoCliente, emReais, ErroSaldo, URL_PADRAO };
