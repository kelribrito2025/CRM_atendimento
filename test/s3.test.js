'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { criarS3, nomeSeguro } = require('../src/s3');
const { semear } = require('../src/db');
const { abrirBancoDeTeste } = require('./apoio');
const { criarApp } = require('../src/app');
const { criarEnviador } = require('../src/email');
const canais = require('../src/canais');

const ADMIN = { email: 'admin@teste.com', senha: 'segredo123' };
const CHAVE = 'AKIAIOSFODNN7EXAMPLE';
const SEGREDO = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';

// S3 de mentira: guarda os objetos na memória e confere a assinatura básica.
function s3Falso(opcoes = {}) {
  const objetos = new Map();
  const pedidos = [];
  const cliente = criarS3({
    bucket: 'mindi-storage-bucket', regiao: 'us-east-1', prefixo: 'chat-app-numeros',
    accessKeyId: CHAVE, secretAccessKey: SEGREDO,
    fetchImpl: async (url, cfg) => {
      pedidos.push({ url, metodo: cfg.method, headers: cfg.headers });
      const caminho = decodeURIComponent(new URL(url).pathname.slice(1));
      if (cfg.method === 'PUT') { objetos.set(caminho, Buffer.from(cfg.body)); return { ok: true, status: 200 }; }
      if (cfg.method === 'DELETE') { objetos.delete(caminho); return { ok: true, status: 204 }; }
      const guardado = objetos.get(caminho);
      if (!guardado) return { ok: false, status: 404 };
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => guardado };
    },
    ...opcoes,
  });
  return { cliente, objetos, pedidos };
}

test('s3: a chave do objeto fica sempre dentro da pasta combinada', () => {
  const { cliente } = s3Falso();
  const chave = cliente.montarChave({ nome: 'Comprovante do Cliente.JPG', tipo: 'image/jpeg', pasta: 'canal-1' });
  assert.match(chave, /^chat-app-numeros\/canal-1\/\d{4}\/\d{2}\/[0-9a-f-]{36}-Comprovante-do-Cliente\.jpg$/);
  assert.equal(cliente.prefixo, 'chat-app-numeros/');
  assert.throws(() => cliente.conferirChave('outra-pasta/arquivo.jpg'), /fora da pasta/);
  assert.throws(() => cliente.conferirChave('chat-app-numeros/../segredo.txt'), /fora da pasta/);
  assert.equal(nomeSeguro('boleto ação.pdf'), 'boleto-acao.pdf');
});

test('s3: envio assina o pedido e nunca manda a chave secreta no corpo', async () => {
  const { cliente, objetos, pedidos } = s3Falso();
  const bytes = Buffer.from('conteudo do arquivo');
  const { chave, tamanho } = await cliente.enviar(bytes, { nome: 'foto.jpg', tipo: 'image/jpeg', pasta: 'canal-2' });

  assert.equal(tamanho, bytes.length);
  assert.equal(objetos.get(chave).toString(), 'conteudo do arquivo');
  const pedido = pedidos[0];
  assert.equal(pedido.metodo, 'PUT');
  assert.match(pedido.url, /^https:\/\/mindi-storage-bucket\.s3\.amazonaws\.com\/chat-app-numeros\//);
  assert.match(pedido.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[a-f0-9]{64}$/);
  assert.equal(pedido.headers['x-amz-content-sha256'], crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(pedido.headers.Authorization.includes(SEGREDO), false, 'a chave secreta nunca vai no pedido');

  const baixado = await cliente.baixar(chave);
  assert.equal(baixado.bytes.toString(), 'conteudo do arquivo');
});

test('s3: link assinado é temporário e confere com o cliente oficial da AWS', () => {
  // Data fixa para o resultado ser sempre o mesmo.
  const { cliente } = s3Falso({ agora: () => new Date('2026-09-13T12:24:09.000Z') });
  const url = cliente.urlAssinada('chat-app-numeros/2026/09/arquivo.jpg', 300);
  assert.match(url, /^https:\/\/mindi-storage-bucket\.s3\.amazonaws\.com\/chat-app-numeros\/2026\/09\/arquivo\.jpg\?/);
  assert.match(url, /X-Amz-Expires=300/);
  assert.match(url, /X-Amz-Signature=[a-f0-9]{64}/);
  assert.equal(url.includes(SEGREDO), false, 'a chave secreta nunca aparece no link');
  // Confere com a assinatura calculada pelo botocore (cliente oficial da AWS) para este mesmo pedido.
  assert.match(url, /X-Amz-Date=20260913T122409Z/);
  assert.match(url, /X-Amz-Signature=6c688040623ecee5b49f57ad5f91e43e72617104ed09535d61a874e907db030f/);
  assert.throws(() => cliente.urlAssinada('outra-pasta/x.jpg'), /fora da pasta/);
});

test('s3: arquivo do Telegram vai para o S3 e a tela recebe pela rota autenticada', async () => {
  const db = await abrirBancoDeTeste();
  await semear(db, { adminEmail: ADMIN.email, adminSenha: ADMIN.senha, adminNome: 'Admin Teste' });
  const { cliente: arquivos, objetos } = s3Falso();
  const telegram = {
    async baixarArquivo(token, fileId) {
      if (fileId !== 'foto-grande') throw new Error('arquivo desconhecido');
      return { bytes: Buffer.from('imagem-do-cliente'), tipo: 'image/jpeg', caminho: 'photos/x.jpg' };
    },
  };
  const app = criarApp(db, { enviador: criarEnviador({ modo: 'silencioso' }), telegram, arquivos });
  const servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

    const agora = Date.now();
    const id = Number((await db.prepare(`INSERT INTO canais (tipo, nome, instancia_id, instancia_token, webhook_segredo, status, criado_em, atualizado_em)
      VALUES ('telegram', 'Bot', '1', 'tok', 'seg', 'connected', ?, ?)`).run(agora, agora)).lastInsertRowid);
    const canal = await db.prepare('SELECT * FROM canais WHERE id = ?').get(id);

    const r = await canais.processarUpdateTelegram(db, canal, {
      update_id: 1,
      message: {
        message_id: 1, date: Math.floor(agora / 1000), from: { id: 555, first_name: 'Carla' }, chat: { id: 555, type: 'private' },
        photo: [{ file_id: 'pequena' }, { file_id: 'foto-grande' }], caption: 'segue o comprovante',
      },
    });
    assert.equal(r.resultado, 'mensagem');
    const chave = await canais.guardarArquivoNoS3(db, { telegram, arquivos }, canal, r.mensagemId, r.midia);
    assert.match(chave, /^chat-app-numeros\/canal-1\/\d{4}\/\d{2}\//, 'o arquivo fica dentro da pasta combinada');
    assert.equal(objetos.get(chave).toString(), 'imagem-do-cliente');

    // o banco guarda só a chave e o tamanho
    const linha = await db.prepare('SELECT midia_chave, midia_tamanho, midia_mime FROM mensagens WHERE id = ?').get(r.mensagemId);
    assert.equal(linha.midia_chave, chave);
    assert.equal(Number(linha.midia_tamanho), 'imagem-do-cliente'.length);

    // a tela recebe o arquivo pela rota com login, sem ver o bucket
    const comLogin = await fetch(`${base}/api/midia/${r.mensagemId}`, { headers: { Cookie: cookie } });
    assert.equal(comLogin.status, 200);
    assert.equal(await comLogin.text(), 'imagem-do-cliente');
    assert.equal((await fetch(`${base}/api/midia/${r.mensagemId}`)).status, 401);

    const conversa = await fetch(`${base}/api/conversas`, { headers: { Cookie: cookie } }).then((x) => x.json());
    const texto = JSON.stringify(conversa);
    assert.equal(texto.includes('mindi-storage-bucket'), false, 'o nome do bucket não vai para a tela');
    assert.equal(texto.includes('chat-app-numeros'), false, 'a chave do objeto não vai para a tela');
  } finally {
    await new Promise((r) => servidor.close(r));
    await db.fechar();
  }
});
