'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarS3 } = require('../src/s3');

// Credenciais fictícias e assinatura publicadas pela AWS para este vetor:
// https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html
// Não usar o resultado do próprio assinador como oráculo de teste.
test('S3: URL GET corresponde exatamente ao exemplo público de Signature V4 da AWS', () => {
  const s3 = criarS3({
    bucket: 'examplebucket', regiao: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    agora: () => new Date('2013-05-24T00:00:00.000Z'),
    fetchImpl: () => { throw new Error('Este teste nunca acessa a rede.'); },
  });
  assert.equal(s3.urlAssinada('test.txt', 86400),
    'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});

test('S3: link de anexo mantém pasta, validade de 15 minutos e dispensa cabeçalhos privados', () => {
  const s3 = criarS3({ bucket: 'examplebucket', prefixo: 'chat-app-numeros', regiao: 'us-east-1',
    accessKeyId: 'EXEMPLO', secretAccessKey: 'segredo-ficticio', agora: () => new Date('2026-09-16T03:00:00Z') });
  const url = new URL(s3.urlAssinada('chat-app-numeros/2026/09/foto da equipe.png', 900));
  assert.equal(url.pathname, '/chat-app-numeros/2026/09/foto%20da%20equipe.png');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.equal(url.href.includes('segredo-ficticio'), false);
  assert.throws(() => s3.urlAssinada('outra-pasta/imagem.png', 900), /fora da pasta/);
});
