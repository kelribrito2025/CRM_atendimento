'use strict';

// Admin é uma equipe interna oculta, não uma inbox operacional da barra lateral.
// As demais equipes são destinos explícitos: novas mensagens não retiram a
// conversa delas, mesmo se o atendimento naquela inbox já tiver sido encerrado.
function temInboxDaEquipe(conversa) {
  return Boolean(conversa?.equipe?.id)
    && String(conversa.equipe.nome || '').trim().toLocaleLowerCase('pt-BR') !== 'admin';
}

// Fragmento fixo (nenhum dado do cliente é interpolado). Calculado no UPDATE,
// usando a atribuição atual do banco, não uma cópia anterior do webhook.
const REABRIR_INBOX_DO_CLIENTE = `
  equipe_status = CASE WHEN equipe_id IN (SELECT id FROM equipes WHERE LOWER(TRIM(nome)) <> 'admin')
    THEN 'aberta' ELSE equipe_status END,
  status = CASE WHEN equipe_id IN (SELECT id FROM equipes WHERE LOWER(TRIM(nome)) <> 'admin')
    THEN status ELSE 'aberta' END`;

module.exports = { temInboxDaEquipe, REABRIR_INBOX_DO_CLIENTE };
