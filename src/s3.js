'use strict';

// Guarda os arquivos das conversas (fotos, áudios, documentos) no Amazon S3.
// O banco guarda só a chave do objeto; o arquivo em si nunca fica no servidor.
// O bucket continua privado: a tela pede o arquivo pela rota /api/midia/:id,
// que exige login, ou por um link assinado que vale poucos minutos.
//
// A assinatura segue o AWS Signature Version 4 (feita aqui com node:crypto,
// sem biblioteca externa).

const crypto = require('node:crypto');

const SERVICO = 's3';
const SEM_CORPO = crypto.createHash('sha256').update('').digest('hex');

function sha256(dados) {
  return crypto.createHash('sha256').update(dados).digest('hex');
}

function hmac(chave, dados) {
  return crypto.createHmac('sha256', chave).update(dados).digest();
}

// Cada pedaço do caminho é codificado, mas as barras continuam barras.
function codificarCaminho(caminho) {
  return String(caminho).split('/').map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

function datas(agora) {
  agora = agora || new Date();
  const completa = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { completa, curta: completa.slice(0, 8) };
}

function chaveDeAssinatura(segredo, curta, regiao) {
  const kData = hmac(`AWS4${segredo}`, curta);
  const kRegiao = hmac(kData, regiao);
  const kServico = hmac(kRegiao, SERVICO);
  return hmac(kServico, 'aws4_request');
}

// Nome de arquivo seguro para virar chave no S3.
function nomeSeguro(nome, padrao = 'arquivo') {
  const limpo = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return limpo || padrao;
}

const EXTENSAO_POR_TIPO = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a', 'application/pdf': 'pdf',
};

function criarS3({
  bucket = '', regiao = 'us-east-1', prefixo = '', accessKeyId = '', secretAccessKey = '',
  endpoint = '', fetchImpl = globalThis.fetch, timeoutMs = 30_000, agora = () => new Date(),
} = {}) {
  const balde = String(bucket || '').trim();
  const reg = String(regiao || 'us-east-1').trim();
  const chave = String(accessKeyId || '').trim();
  const segredo = String(secretAccessKey || '').trim();
  // Só mexe dentro do prefixo combinado, nunca na raiz do bucket.
  const base = String(prefixo || '').replace(/^\/+|\/+$/g, '');
  const raiz = base ? `${base}/` : '';
  const configurado = Boolean(balde && chave && segredo);
  const host = endpoint ? String(endpoint).replace(/^https?:\/\//, '').replace(/\/+$/, '')
    : (reg === 'us-east-1' ? `${balde}.s3.amazonaws.com` : `${balde}.s3.${reg}.amazonaws.com`);

  function conferirChave(chaveObjeto) {
    const c = String(chaveObjeto || '');
    if (!c.startsWith(raiz) || c.includes('..')) {
      throw new Error(`Chave fora da pasta ${raiz || '(raiz)'}: ${c}`);
    }
    return c;
  }

  // Monta uma chave nova dentro do prefixo: chat-app-numeros/2026/09/uuid-nome.jpg
  function montarChave({ nome, tipo, pasta = '' } = {}) {
    const agora = new Date();
    const extensaoDoNome = /\.([A-Za-z0-9]{1,8})$/.exec(String(nome || ''))?.[1];
    const extensao = (extensaoDoNome || EXTENSAO_POR_TIPO[String(tipo || '').split(';')[0]] || 'bin').toLowerCase();
    const arquivo = `${crypto.randomUUID()}-${nomeSeguro(String(nome || '').replace(/\.[A-Za-z0-9]{1,8}$/, ''))}.${extensao}`;
    const meio = [pasta, String(agora.getUTCFullYear()), String(agora.getUTCMonth() + 1).padStart(2, '0')].filter(Boolean).join('/');
    return `${raiz}${meio}/${arquivo}`;
  }

  // Assina e executa um pedido ao S3.
  async function chamar(metodo, chaveObjeto, { corpo = null, tipo = null } = {}) {
    if (!configurado) throw new Error('Armazenamento de arquivos não configurado (S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY).');
    const caminho = `/${codificarCaminho(conferirChave(chaveObjeto))}`;
    const { completa, curta } = datas(agora());
    const hashCorpo = corpo ? sha256(corpo) : SEM_CORPO;

    const cabecalhos = { host, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': completa };
    if (tipo) cabecalhos['content-type'] = tipo;
    if (corpo) cabecalhos['content-length'] = String(corpo.length);

    const nomes = Object.keys(cabecalhos).sort();
    const assinados = nomes.join(';');
    const pedidoCanonico = [
      metodo, caminho, '',
      ...nomes.map((n) => `${n}:${String(cabecalhos[n]).trim()}`), '',
      assinados, hashCorpo,
    ].join('\n');

    const escopo = `${curta}/${reg}/${SERVICO}/aws4_request`;
    const paraAssinar = ['AWS4-HMAC-SHA256', completa, escopo, sha256(pedidoCanonico)].join('\n');
    const assinatura = hmac(chaveDeAssinatura(segredo, curta, reg), paraAssinar).toString('hex');

    const resposta = await fetchImpl(`https://${host}${caminho}`, {
      method: metodo,
      headers: {
        ...cabecalhos,
        Authorization: `AWS4-HMAC-SHA256 Credential=${chave}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}`,
      },
      body: corpo || undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resposta;
  }

  return {
    configurado,
    bucket: balde,
    regiao: reg,
    prefixo: raiz,
    host,
    montarChave,
    conferirChave,

    // Envia o arquivo e devolve a chave onde ele ficou guardado.
    async enviar(bytes, { nome, tipo, pasta, chave: chaveEscolhida } = {}) {
      const chaveObjeto = chaveEscolhida ? conferirChave(chaveEscolhida) : montarChave({ nome, tipo, pasta });
      const r = await chamar('PUT', chaveObjeto, { corpo: bytes, tipo: tipo || 'application/octet-stream' });
      if (!r.ok) throw new Error(`Não foi possível guardar o arquivo (erro ${r.status} do S3).`);
      return { chave: chaveObjeto, tamanho: bytes.length, tipo: tipo || null };
    },

    // Busca o arquivo para a rota autenticada repassar à tela.
    async baixar(chaveObjeto) {
      const r = await chamar('GET', chaveObjeto);
      if (!r.ok) throw new Error(`Arquivo não encontrado no S3 (erro ${r.status}).`);
      return { bytes: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') || null };
    },

    async apagar(chaveObjeto) {
      const r = await chamar('DELETE', chaveObjeto);
      return r.ok || r.status === 404;
    },

    // Link temporário (o padrão são 5 minutos), para quando a tela precisar
    // baixar direto do S3 sem passar pelo servidor.
    urlAssinada(chaveObjeto, segundos = 300) {
      if (!configurado) throw new Error('Armazenamento de arquivos não configurado.');
      const caminho = `/${codificarCaminho(conferirChave(chaveObjeto))}`;
      const { completa, curta } = datas(agora());
      const escopo = `${curta}/${reg}/${SERVICO}/aws4_request`;
      const consulta = [
        ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
        ['X-Amz-Credential', `${chave}/${escopo}`],
        ['X-Amz-Date', completa],
        ['X-Amz-Expires', String(Math.min(Math.max(Number(segundos) || 300, 1), 604800))],
        ['X-Amz-SignedHeaders', 'host'],
      ].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');

      // Sem corpo no GET: usa o hash do conteúdo vazio, igual ao cliente oficial da AWS.
      const pedidoCanonico = ['GET', caminho, consulta, `host:${host}`, '', 'host', SEM_CORPO].join('\n');
      const paraAssinar = ['AWS4-HMAC-SHA256', completa, escopo, sha256(pedidoCanonico)].join('\n');
      const assinatura = hmac(chaveDeAssinatura(segredo, curta, reg), paraAssinar).toString('hex');
      return `https://${host}${caminho}?${consulta}&X-Amz-Signature=${assinatura}`;
    },
  };
}

module.exports = { criarS3, nomeSeguro, codificarCaminho, EXTENSAO_POR_TIPO };
