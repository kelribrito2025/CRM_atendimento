'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const arquivo = pathToFileURL(path.join(__dirname, '../client/assets/js/cor-avatar.mjs')).href;

test('avatar por canal: WhatsApp usa a cor escolhida com texto legível', async () => {
  const { estiloAvatarDoCanal } = await import(arquivo);
  assert.equal(
    estiloAvatarDoCanal({ canal: 'whatsapp', canalCor: '#7c3aed' }),
    'background:#7C3AED;color:#FFFFFF',
  );
  assert.equal(
    estiloAvatarDoCanal({ canal: 'whatsapp', canalCor: '#F5DC38' }),
    'background:#F5DC38;color:#0B1F14',
  );
});

test('avatar por canal: não altera Telegram, widget nem cores inválidas', async () => {
  const { estiloAvatarDoCanal } = await import(arquivo);
  assert.equal(estiloAvatarDoCanal({ canal: 'telegram', canalCor: '#7C3AED' }), '');
  assert.equal(estiloAvatarDoCanal({ canal: 'widget', canalCor: '#7C3AED' }), '');
  assert.equal(estiloAvatarDoCanal({ canal: 'whatsapp', canalCor: 'purple' }), '');
});
