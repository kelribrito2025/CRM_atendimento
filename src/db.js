'use strict';

const { abrirBanco: abrirConexao } = require('./banco');
const { gerarHashSenha } = require('./senha');

// O mesmo schema serve para SQLite e MySQL/TiDB: o que muda é só a chave primária
// e a marcação de "não diferencia maiúsculas" (no MySQL isso já é o padrão).
function montarSchema(dialeto) {
  const CHAVE = dialeto === 'mysql' ? 'BIGINT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const SEM_CAIXA = dialeto === 'mysql' ? '' : ' COLLATE NOCASE';
  return `
CREATE TABLE IF NOT EXISTS usuarios (
  id ${CHAVE},
  nome TEXT NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE${SEM_CAIXA},
  senha_hash TEXT NOT NULL,
  papel VARCHAR(20) NOT NULL DEFAULT 'atendente',
  presenca VARCHAR(20) NOT NULL DEFAULT 'online',
  ativo BIGINT NOT NULL DEFAULT 1,
  pode_logar BIGINT NOT NULL DEFAULT 1,
  criado_em VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS equipes (
  id ${CHAVE},
  nome VARCHAR(191) NOT NULL UNIQUE,
  cor VARCHAR(20) NOT NULL DEFAULT '#12B85C',
  ordem BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ajustes (
  chave VARCHAR(191) PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash VARCHAR(191) PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  atendente_id BIGINT,
  expira_em BIGINT NOT NULL,
  criado_em BIGINT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (atendente_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Cada aba aberta do atendimento mantém uma presença própria. Isso evita que
-- uma sessão lembrada por 30 dias faça alguém parecer online sem estar no CRM.
CREATE TABLE IF NOT EXISTS presencas_atendimento (
  token_hash VARCHAR(191) NOT NULL,
  aba_id VARCHAR(100) NOT NULL,
  atendente_id BIGINT NOT NULL,
  ultima_atividade_em BIGINT NOT NULL,
  PRIMARY KEY (token_hash, aba_id),
  FOREIGN KEY (token_hash) REFERENCES sessoes(token_hash) ON DELETE CASCADE,
  FOREIGN KEY (atendente_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS equipe_membros (
  equipe_id BIGINT NOT NULL,
  usuario_id BIGINT NOT NULL,
  PRIMARY KEY (equipe_id, usuario_id),
  FOREIGN KEY (equipe_id) REFERENCES equipes(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contatos (
  id ${CHAVE},
  nome TEXT NOT NULL,
  empresa TEXT,
  cnpj VARCHAR(32),
  telefone VARCHAR(32),
  email VARCHAR(191),
  dados_conta TEXT,
  pin VARCHAR(32),
  pin_validado_em BIGINT,
  pin_validado_por BIGINT,
  wa_id VARCHAR(64),
  wa_foto_url TEXT,
  tg_id VARCHAR(64),
  tg_usuario VARCHAR(191),
  site_id VARCHAR(191),
  tg_foto_id VARCHAR(255),
  tg_foto_em BIGINT,
  FOREIGN KEY (pin_validado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS canais (
  id ${CHAVE},
  tipo VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  nome TEXT NOT NULL,
  cor VARCHAR(7) NOT NULL DEFAULT '#12B85C',
  instancia_id VARCHAR(191),
  instancia_token TEXT,
  webhook_segredo VARCHAR(191) NOT NULL UNIQUE,
  numero VARCHAR(64),
  perfil_nome TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  equipe_padrao_id BIGINT,
  ultimo_erro TEXT,
  criado_em BIGINT NOT NULL,
  atualizado_em BIGINT NOT NULL,
  FOREIGN KEY (equipe_padrao_id) REFERENCES equipes(id)
);

CREATE TABLE IF NOT EXISTS conversas (
  id ${CHAVE},
  protocolo VARCHAR(32) NOT NULL UNIQUE,
  contato_id BIGINT NOT NULL,
  equipe_id BIGINT,
  atendente_id BIGINT,
  canal VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  status VARCHAR(20) NOT NULL DEFAULT 'aberta',
  alerta TEXT,
  nao_lidas BIGINT NOT NULL DEFAULT 0,
  criada_em BIGINT NOT NULL,
  atualizada_em BIGINT NOT NULL,
  canal_id BIGINT,
  wa_chatid VARCHAR(191),
  FOREIGN KEY (contato_id) REFERENCES contatos(id),
  FOREIGN KEY (equipe_id) REFERENCES equipes(id),
  FOREIGN KEY (atendente_id) REFERENCES usuarios(id),
  FOREIGN KEY (canal_id) REFERENCES canais(id)
);

CREATE TABLE IF NOT EXISTS mensagens (
  id ${CHAVE},
  conversa_id BIGINT NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  autor_id BIGINT,
  texto TEXT NOT NULL,
  entrega VARCHAR(20),
  criada_em BIGINT NOT NULL,
  externo_id VARCHAR(191),
  midia_tipo VARCHAR(20),
  midia_id VARCHAR(255),
  midia_nome TEXT,
  midia_mime VARCHAR(127),
  midia_chave VARCHAR(500),
  midia_tamanho BIGINT,
  editada_em BIGINT,
  FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS auditoria_eventos (
  id ${CHAVE},
  acao VARCHAR(64) NOT NULL,
  usuario_id BIGINT,
  usuario_nome TEXT NOT NULL,
  usuario_email VARCHAR(191),
  conta_id BIGINT,
  conta_email VARCHAR(191),
  conversa_id BIGINT,
  protocolo VARCHAR(32),
  canal VARCHAR(20),
  contato_id BIGINT,
  contato_nome TEXT,
  criado_em BIGINT NOT NULL,
  origem_mensagem_id BIGINT UNIQUE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (conta_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL,
  FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS convites (
  token_hash VARCHAR(191) PRIMARY KEY,
  email VARCHAR(191) NOT NULL${SEM_CAIXA},
  papel VARCHAR(20) NOT NULL DEFAULT 'atendente',
  equipes TEXT,
  criado_por BIGINT,
  criado_em BIGINT NOT NULL,
  expira_em BIGINT NOT NULL,
  usado_em BIGINT,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS redefinicoes (
  token_hash VARCHAR(191) PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  criado_em BIGINT NOT NULL,
  expira_em BIGINT NOT NULL,
  usado_em BIGINT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canal_eventos (
  id ${CHAVE},
  canal_id BIGINT,
  tipo VARCHAR(64),
  corpo TEXT,
  recebido_em BIGINT NOT NULL,
  FOREIGN KEY (canal_id) REFERENCES canais(id) ON DELETE CASCADE
);

-- conversa_id fica vazio até o cliente escrever a primeira mensagem: abrir a
-- dashboard não é conversa, e antes disso enchia a caixa de entrada de linhas
-- "Sem mensagens".
CREATE TABLE IF NOT EXISTS widget_sessoes (
  token_hash VARCHAR(191) PRIMARY KEY,
  contato_id BIGINT NOT NULL,
  conversa_id BIGINT,
  criado_em BIGINT NOT NULL,
  expira_em BIGINT NOT NULL,
  FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE,
  FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS respostas_rapidas (
  id ${CHAVE},
  atalho VARCHAR(60) NOT NULL,
  titulo VARCHAR(191) NOT NULL,
  texto TEXT NOT NULL,
  escopo VARCHAR(20) NOT NULL DEFAULT 'todas',
  equipe_id BIGINT,
  usuario_id BIGINT,
  criado_por BIGINT,
  usos BIGINT NOT NULL DEFAULT 0,
  criado_em BIGINT NOT NULL,
  atualizado_em BIGINT NOT NULL,
  FOREIGN KEY (equipe_id) REFERENCES equipes(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS verificacoes (
  token_hash VARCHAR(191) PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  codigo_hash TEXT NOT NULL,
  lembrar BIGINT NOT NULL DEFAULT 0,
  tentativas BIGINT NOT NULL DEFAULT 0,
  reenviado_em BIGINT NOT NULL,
  criado_em BIGINT NOT NULL,
  expira_em BIGINT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
`;
}

const INDICES = [
  ['idx_sessoes_expira', 'sessoes', 'expira_em'],
  ['idx_presencas_atendimento', 'presencas_atendimento', 'atendente_id, ultima_atividade_em'],
  ['idx_mensagens_conversa', 'mensagens', 'conversa_id, criada_em'],
  ['idx_mensagens_externo', 'mensagens', 'externo_id'],
  ['idx_contatos_wa', 'contatos', 'wa_id'],
  ['idx_contatos_tg', 'contatos', 'tg_id'],
  ['idx_conversas_canal', 'conversas', 'canal_id, status'],
  ['idx_respostas_atalho', 'respostas_rapidas', 'atalho'],
  ['idx_contatos_site', 'contatos', 'site_id'],
  ['idx_auditoria_criado', 'auditoria_eventos', 'criado_em'],
  ['idx_auditoria_usuario', 'auditoria_eventos', 'usuario_id, criado_em'],
];

// Acrescenta colunas criadas em versões mais novas sem perder os dados existentes.
async function garantirColuna(db, tabela, coluna, definicao) {
  const existentes = await db.colunas(tabela);
  if (existentes.includes(coluna)) return false;
  await db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  return true;
}

// Apaga equipes pelo nome; as conversas e canais ligados a elas ficam "sem equipe".
async function removerEquipes(db, nomes) {
  const marcadores = nomes.map(() => '?').join(', ');
  const ids = (await db.prepare(`SELECT id FROM equipes WHERE nome IN (${marcadores})`).all(...nomes)).map((e) => Number(e.id));
  if (!ids.length) return 0;
  const lista = ids.join(', ');
  await db.exec(`UPDATE conversas SET equipe_id = NULL WHERE equipe_id IN (${lista})`);
  await db.exec(`UPDATE canais SET equipe_padrao_id = NULL WHERE equipe_padrao_id IN (${lista})`);
  await db.exec(`DELETE FROM equipes WHERE id IN (${lista})`);
  return ids.length;
}

// Renomeia uma equipe já existente (bancos criados antes da mudança de nome).
async function renomearEquipe(db, de, para) {
  const jaExiste = await db.prepare('SELECT id FROM equipes WHERE nome = ?').get(para);
  if (!jaExiste) await db.prepare('UPDATE equipes SET nome = ? WHERE nome = ?').run(para, de);
}

// Cria a equipe se ela ainda não existir (usado nas atualizações do sistema).
async function garantirEquipe(db, nome, cor) {
  if (await db.prepare('SELECT id FROM equipes WHERE nome = ?').get(nome)) return;
  const ultima = await db.prepare('SELECT MAX(ordem) AS fim FROM equipes').get();
  await db.prepare('INSERT INTO equipes (nome, cor, ordem) VALUES (?, ?, ?)').run(nome, cor, Number(ultima?.fim ?? -1) + 1);
}

// Bancos criados antes: a sessão do chat exigia conversa, e por isso a conversa
// nascia junto com o login do cliente. Aqui a coluna passa a aceitar vazio e as
// conversas que nunca receberam mensagem são apagadas — não perdem nada, porque
// nunca tiveram conteúdo. O contato do cliente continua guardado.
async function limparConversasDeChatVazias(db) {
  if (await lerAjuste(db, 'widget_conversa_sob_demanda') === '1') return;

  if (db.dialeto === 'mysql') {
    await db.exec('ALTER TABLE widget_sessoes MODIFY conversa_id BIGINT NULL');
  } else {
    // SQLite não altera coluna: refaz a tabela levando as sessões junto.
    await db.exec('ALTER TABLE widget_sessoes RENAME TO widget_sessoes_antiga');
    await db.exec(`CREATE TABLE widget_sessoes (
      token_hash VARCHAR(191) PRIMARY KEY,
      contato_id BIGINT NOT NULL,
      conversa_id BIGINT,
      criado_em BIGINT NOT NULL,
      expira_em BIGINT NOT NULL,
      FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE,
      FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE
    )`);
    await db.exec(`INSERT INTO widget_sessoes (token_hash, contato_id, conversa_id, criado_em, expira_em)
      SELECT token_hash, contato_id, conversa_id, criado_em, expira_em FROM widget_sessoes_antiga`);
    await db.exec('DROP TABLE widget_sessoes_antiga');
  }

  // Solta as sessões das conversas vazias antes de apagá-las: assim o cliente
  // que está com o chat aberto não é desconectado.
  const vazias = `SELECT c.id FROM conversas c
    WHERE c.canal = 'widget' AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa_id = c.id)`;
  const ids = (await db.prepare(vazias).all()).map((c) => Number(c.id));
  if (ids.length) {
    const lista = ids.join(', ');
    await db.exec(`UPDATE widget_sessoes SET conversa_id = NULL WHERE conversa_id IN (${lista})`);
    await db.exec(`DELETE FROM conversas WHERE id IN (${lista})`);
  }
  await gravarAjuste(db, 'widget_conversa_sob_demanda', '1');
}

// Versões anteriores guardavam a abertura de conta como nota interna. Esses
// registros são eventos de segurança: passam para a auditoria, sem permanecer
// misturados às notas escritas pela equipe. `origem_mensagem_id` torna a
// migração segura mesmo se duas instâncias iniciarem ao mesmo tempo.
async function migrarNotasDeAberturaParaAuditoria(db) {
  const texto = 'Abriu a conta do cliente no site.';
  await db.transacao(async () => {
    await db.prepare(`INSERT OR IGNORE INTO auditoria_eventos
      (acao, usuario_id, usuario_nome, usuario_email, conversa_id, protocolo, canal,
       contato_id, contato_nome, criado_em, origem_mensagem_id)
      SELECT 'abrir_conta', m.autor_id, COALESCE(u.nome, 'Atendente removido'), u.email,
             c.id, c.protocolo, c.canal, ct.id, ct.nome, m.criada_em, m.id
      FROM mensagens m
      JOIN conversas c ON c.id = m.conversa_id
      JOIN contatos ct ON ct.id = c.contato_id
      LEFT JOIN usuarios u ON u.id = m.autor_id
      WHERE m.tipo = 'nota' AND m.texto = ?`).run(texto);
    await db.prepare("DELETE FROM mensagens WHERE tipo = 'nota' AND texto = ?").run(texto);
  });
}

async function migrar(db) {
  await garantirColuna(db, 'usuarios', 'pode_logar', 'BIGINT NOT NULL DEFAULT 1');
  const adicionouAtendenteNaSessao = await garantirColuna(db, 'sessoes', 'atendente_id', 'BIGINT');
  // Sessões abertas antes da existência dos perfis continuam usando a própria
  // conta. Novos logins passam pela escolha quando houver perfis adicionais.
  if (adicionouAtendenteNaSessao) {
    await db.prepare('UPDATE sessoes SET atendente_id = usuario_id WHERE atendente_id IS NULL').run();
  }
  await garantirColuna(db, 'canais', 'cor', "VARCHAR(7) NOT NULL DEFAULT '#12B85C'");
  await garantirColuna(db, 'conversas', 'canal_id', 'BIGINT');
  await garantirColuna(db, 'conversas', 'wa_chatid', 'VARCHAR(191)');
  await garantirColuna(db, 'mensagens', 'externo_id', 'VARCHAR(191)');
  await garantirColuna(db, 'mensagens', 'midia_tipo', 'VARCHAR(20)');
  await garantirColuna(db, 'mensagens', 'midia_id', 'VARCHAR(255)');
  await garantirColuna(db, 'mensagens', 'midia_nome', 'TEXT');
  await garantirColuna(db, 'mensagens', 'midia_mime', 'VARCHAR(127)');
  await garantirColuna(db, 'mensagens', 'midia_chave', 'VARCHAR(500)');
  await garantirColuna(db, 'mensagens', 'midia_tamanho', 'BIGINT');
  await garantirColuna(db, 'contatos', 'wa_id', 'VARCHAR(64)');
  await garantirColuna(db, 'contatos', 'tg_id', 'VARCHAR(64)');
  await garantirColuna(db, 'contatos', 'tg_usuario', 'VARCHAR(191)');
  await garantirColuna(db, 'contatos', 'site_id', 'VARCHAR(191)');
  await garantirColuna(db, 'contatos', 'email', 'VARCHAR(191)');
  await garantirColuna(db, 'mensagens', 'editada_em', 'BIGINT');
  await garantirColuna(db, 'contatos', 'wa_foto_url', 'TEXT');
  await garantirColuna(db, 'contatos', 'tg_foto_id', 'VARCHAR(255)');
  await garantirColuna(db, 'contatos', 'tg_foto_em', 'BIGINT');
  // Detalhe do evento na auditoria: o que a ação mexeu (valor, motivo).
  await garantirColuna(db, 'auditoria_eventos', 'detalhe', 'TEXT');
  await garantirColuna(db, 'auditoria_eventos', 'conta_id', 'BIGINT');
  await garantirColuna(db, 'auditoria_eventos', 'conta_email', 'VARCHAR(191)');
  for (const [nome, tabela, colunas] of INDICES) await db.criarIndice(nome, tabela, colunas);
  await migrarNotasDeAberturaParaAuditoria(db);
  await limparConversasDeChatVazias(db);
  await renomearEquipe(db, 'Cobrança', 'Admin');
  // Equipes padrão antigas que deixaram de existir (removidas uma única vez).
  if (await lerAjuste(db, 'equipes_padrao') !== '3') {
    await removerEquipes(db, ['Suporte técnico', 'Onboarding']);
    // Banco que já rodava antes: ganha a equipe nova. Banco novo é montado
    // por criarEquipesPadrao, logo depois, com as três equipes na ordem certa.
    if (await contar(db, 'equipes') > 0) await garantirEquipe(db, 'Prioridade', '#E5544A');
    await gravarAjuste(db, 'equipes_padrao', '3');
  }
}

// `destino`: caminho de um arquivo SQLite ou uma URL mysql:// (publicação).
async function abrirBanco(destino = ':memory:') {
  const db = await abrirConexao(destino);
  await db.exec(montarSchema(db.dialeto));
  await migrar(db);
  return db;
}

async function contar(db, tabela) {
  return Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get()).n);
}

async function inserirUsuario(db, { nome, email, senha, papel = 'atendente', presenca = 'online' }) {
  const info = await db
    .prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, presenca, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(String(nome).trim(), String(email).trim().toLowerCase(), gerarHashSenha(senha), papel, presenca, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

// Equipes criadas na primeira execução (podem ser renomeadas depois).
const EQUIPES_PADRAO = [
  ['Reembolso', '#12B85C'],
  ['Admin', '#1D6FA5'],
  ['Prioridade', '#E5544A'],
];

const USUARIOS_EXEMPLO = ['marina@bigteck.com.br', 'rafael@bigteck.com.br'];

async function lerAjuste(db, chave) {
  return (await db.prepare('SELECT valor FROM ajustes WHERE chave = ?').get(chave))?.valor ?? null;
}

async function gravarAjuste(db, chave, valor) {
  const sql = db.dialeto === 'mysql'
    ? 'INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)'
    : 'INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor';
  await db.prepare(sql).run(chave, String(valor));
}

// Cria o administrador inicial, as equipes padrão e (opcionalmente) dados de exemplo.
// Sem `comDadosExemplo`, os dados de exemplo criados anteriormente são removidos uma única vez.
async function semear(db, opcoes = {}) {
  const {
    adminEmail = 'admin@bigteck.com.br',
    adminSenha = 'admin123',
    adminNome = 'Gestor Bigteck',
    senhaEquipe = adminSenha,
    comDadosExemplo = false,
  } = opcoes;

  const resultado = { adminCriado: false, dadosExemploCriados: false, dadosExemploRemovidos: null };

  if (await contar(db, 'usuarios') === 0) {
    await inserirUsuario(db, { nome: adminNome, email: adminEmail, senha: adminSenha, papel: 'admin' });
    resultado.adminCriado = true;
  }

  await criarEquipesPadrao(db);

  if (comDadosExemplo) {
    if (await contar(db, 'conversas') === 0) {
      await semearDadosExemplo(db, senhaEquipe);
      await gravarAjuste(db, 'exemplos', 'criados');
      resultado.dadosExemploCriados = true;
    }
  } else if (await lerAjuste(db, 'exemplos') !== 'removidos') {
    resultado.dadosExemploRemovidos = await removerDadosExemplo(db);
    await gravarAjuste(db, 'exemplos', 'removidos');
  }

  return resultado;
}

async function criarEquipesPadrao(db) {
  if (await contar(db, 'equipes') > 0) return;
  const admin = await db.prepare("SELECT id FROM usuarios WHERE papel = 'admin' ORDER BY id LIMIT 1").get();
  const insEquipe = db.prepare('INSERT INTO equipes (nome, cor, ordem) VALUES (?, ?, ?)');
  const insMembro = db.prepare('INSERT OR IGNORE INTO equipe_membros (equipe_id, usuario_id) VALUES (?, ?)');
  for (const [i, [nome, cor]] of EQUIPES_PADRAO.entries()) {
    const id = Number((await insEquipe.run(nome, cor, i)).lastInsertRowid);
    if (admin) await insMembro.run(id, admin.id);
  }
}

// Apaga as conversas, contatos e usuários de teste criados por semearDadosExemplo.
// Conversas reais vêm sempre de um canal (canal_id) e contatos reais têm wa_id; só o resto é removido.
async function removerDadosExemplo(db) {
  const totais = { conversas: 0, contatos: 0, usuarios: 0 };
  await db.transacao(async () => {
    totais.conversas = (await db.prepare('DELETE FROM conversas WHERE canal_id IS NULL').run()).changes;
    totais.contatos = (await db.prepare(
      'DELETE FROM contatos WHERE wa_id IS NULL AND tg_id IS NULL AND id NOT IN (SELECT contato_id FROM (SELECT contato_id FROM conversas) AS c)',
    ).run()).changes;
    const marcadores = USUARIOS_EXEMPLO.map(() => '?').join(', ');
    const ids = (await db.prepare(`SELECT id FROM usuarios WHERE email IN (${marcadores})`).all(...USUARIOS_EXEMPLO)).map((u) => Number(u.id));
    if (ids.length) {
      const lista = ids.join(', ');
      await db.exec(`UPDATE contatos SET pin_validado_por = NULL WHERE pin_validado_por IN (${lista})`);
      await db.exec(`UPDATE conversas SET atendente_id = NULL WHERE atendente_id IN (${lista})`);
      await db.exec(`UPDATE mensagens SET autor_id = NULL WHERE autor_id IN (${lista})`);
      await db.exec(`UPDATE convites SET criado_por = NULL WHERE criado_por IN (${lista})`);
      await db.exec(`DELETE FROM usuarios WHERE id IN (${lista})`);
      totais.usuarios = ids.length;
    }
  });
  return totais;
}

/* ------------------------------------------------------------------ */
/* Dados de exemplo (espelham o visual da tela de atendimento)          */
/* ------------------------------------------------------------------ */

const EQUIPES_EXEMPLO = [
  ['Reembolso', '#12B85C', ['marina', 'rafael']],
  ['Admin', '#1D6FA5', ['admin', 'rafael']],
  ['Suporte técnico', '#B3261E', ['admin', 'marina']],
  ['Onboarding', '#4C6355', ['admin']],
];

// Minutos negativos = no passado, contados a partir de agora.
const CONVERSAS_EXEMPLO = [
  // ---------------- Reembolso (7 abertas + 1 resolvida) ----------------
  {
    equipe: 'Reembolso', canal: 'whatsapp', atendente: 'marina', protocolo: '4821',
    contato: {
      nome: 'Carla Menezes', empresa: 'Bigteck LTDA', cnpj: '12.884.301/0001-45', telefone: '+55 31 99812-4471',
      pin: '486213', pinValidadoPor: 'marina', pinValidadoHaMin: 11,
      dados: [
        ['Saldo em caixa', 'R$ 184.320,55', 'verde'],
        ['Plano', 'Essencial mensal'],
        ['Último pagamento', '12/09 · R$ 89,90'],
        ['Cobrança anterior', '10/09 · R$ 89,90'],
        ['Papel de Carla', 'Administradora'],
      ],
    },
    alerta: { titulo: 'Duas capturas do mesmo valor', texto: 'em 48h no cartão final 4218. Elegível a estorno automático.' },
    mensagens: [
      ['cliente', -18, 'Bom dia! Paguei duas vezes a mensalidade de setembro, saiu R$ 89,90 no dia 10 e de novo hoje.'],
      ['atendente', -14, 'Bom dia, Carla! Para abrir os dados da conta, me confirma o PIN do seu painel em Configurações › Segurança?', 'entregue'],
      ['cliente', -11, 'É 4 8 6 2 1 3'],
      ['nota', -8, 'PIN validado. Duas capturas do mesmo valor no Stripe; estorno solicitado, prazo de 5 dias úteis.'],
      ['nota', -8, 'Já teve estorno em julho pelo mesmo motivo — vale checar a régua de cobrança.'],
      ['atendente', 0, 'Confirmado, Carla. O estorno já está solicitado — cai no cartão final 4218 em até 5 dias úteis.', 'lida'],
    ],
  },
  {
    equipe: 'Reembolso', canal: 'telegram', atendente: null, naoLidas: 2,
    contato: { nome: 'Eduardo Lins', empresa: 'Lins Arquitetura', telefone: '@eduardolins' },
    mensagens: [
      ['cliente', -50, 'Oi, fui cobrado em duplicidade no plano anual.'],
      ['cliente', -42, 'Consigo o estorno neste mês?'],
    ],
  },
  {
    equipe: 'Reembolso', canal: 'whatsapp', atendente: 'marina',
    contato: { nome: 'Studio Alfa ME', telefone: '+55 11 98877-1020' },
    mensagens: [
      ['cliente', -1560, 'Pessoal, o estorno de agosto ainda não apareceu na fatura.'],
      ['atendente', -1556, 'Oi! Verifiquei aqui: estorno enviado ✓ Aparece em até 3 dias úteis.', 'lida'],
    ],
  },
  {
    equipe: 'Reembolso', canal: 'telegram', atendente: 'rafael', status: 'resolvida',
    contato: { nome: 'Casa Pinheiro', telefone: '@casapinheiro' },
    mensagens: [
      ['cliente', -1620, 'Bom dia, preciso do comprovante do estorno.'],
      ['atendente', -1616, 'Segue o comprovante em anexo. Qualquer coisa é só chamar!', 'lida'],
      ['cliente', -1580, 'Recebi o comprovante, obrigado!'],
    ],
  },
  {
    equipe: 'Reembolso', canal: 'whatsapp', atendente: null, naoLidas: 1,
    contato: { nome: 'Loja Bem Viver', empresa: 'Bem Viver Comércio LTDA', telefone: '+55 21 97701-3388' },
    mensagens: [['cliente', -70, 'Fiz o cancelamento e ainda não recebi o estorno proporcional.']],
  },
  {
    equipe: 'Reembolso', canal: 'whatsapp', atendente: 'rafael',
    contato: { nome: 'Tech Vale LTDA', cnpj: '31.550.212/0001-70', telefone: '+55 19 99120-4455' },
    mensagens: [
      ['cliente', -130, 'O valor estornado veio menor que o cobrado.'],
      ['atendente', -125, 'Olá! O valor é proporcional aos dias usados. Vou te enviar o detalhamento.', 'entregue'],
    ],
  },
  {
    equipe: 'Reembolso', canal: 'telegram', atendente: 'admin',
    contato: { nome: 'Mercearia Dois Irmãos', cnpj: '22.410.775/0001-09', telefone: '@mercearia2irmaos' },
    mensagens: [
      ['cliente', -200, 'Quero pedir reembolso da taxa de adesão.'],
      ['atendente', -197, 'Claro! Me passa o CNPJ para localizar a conta?', 'lida'],
      ['cliente', -190, '22.410.775/0001-09'],
      ['atendente', -186, 'Localizei. Já abri o pedido de reembolso, prazo de 5 dias úteis.', 'lida'],
    ],
  },
  {
    equipe: 'Reembolso', canal: 'whatsapp', atendente: 'marina',
    contato: { nome: 'Paulo Henrique', empresa: 'PH Serviços', telefone: '+55 41 98455-2211' },
    mensagens: [
      ['cliente', -300, 'Cobraram o plano Pro, mas eu tinha o Essencial.'],
      ['atendente', -296, 'Oi, Paulo! Ajustei o plano e a diferença será estornada.', 'lida'],
    ],
  },

  // ---------------- Admin (4 abertas) ----------------
  {
    equipe: 'Admin', canal: 'whatsapp', atendente: 'admin',
    contato: { nome: 'Fernanda Rocha', empresa: 'Rocha Contabilidade', telefone: '+55 11 99333-7788' },
    mensagens: [
      ['cliente', -95, 'Meu boleto venceu ontem, consigo uma segunda via?'],
      ['atendente', -90, 'Consigo sim! Gerei a segunda via com vencimento para amanhã.', 'lida'],
    ],
  },
  {
    equipe: 'Admin', canal: 'telegram', atendente: 'rafael',
    contato: { nome: 'Distribuidora Norte', cnpj: '08.221.930/0001-12', telefone: '@distnorte' },
    mensagens: [
      ['cliente', -240, 'Podemos parcelar a fatura de agosto?'],
      ['atendente', -236, 'Podemos, em até 3x sem juros. Quer que eu gere o parcelamento?', 'lida'],
      ['cliente', -230, 'Quero sim, obrigado.'],
      ['atendente', -228, 'Pronto! Parcelamento gerado, o primeiro boleto chega por e-mail.', 'lida'],
    ],
  },
  {
    equipe: 'Admin', canal: 'whatsapp', atendente: 'admin',
    contato: { nome: 'Marcos Vieira', empresa: 'Vieira Pneus', telefone: '+55 31 98811-2200' },
    mensagens: [
      ['cliente', -400, 'A cobrança de setembro veio com valor diferente.'],
      ['atendente', -395, 'Oi, Marcos. Houve reajuste anual de 5%, conforme o contrato. Te envio o detalhamento.', 'lida'],
    ],
  },
  {
    equipe: 'Admin', canal: 'whatsapp', atendente: 'rafael',
    contato: { nome: 'Bella Flor Decorações', telefone: '+55 27 99655-1122' },
    mensagens: [
      ['cliente', -520, 'Quero mudar a data de vencimento para o dia 15.'],
      ['atendente', -517, 'Alterado! A partir da próxima fatura o vencimento será dia 15.', 'lida'],
    ],
  },

  // ---------------- Suporte técnico (5 abertas) ----------------
  {
    equipe: 'Suporte técnico', canal: 'whatsapp', atendente: 'admin',
    contato: { nome: 'Ana Beatriz', empresa: 'AB Consultoria', telefone: '+55 11 97222-9090' },
    mensagens: [
      ['cliente', -35, 'Não consigo exportar o relatório em PDF, dá erro.'],
      ['atendente', -31, 'Oi, Ana! Já identificamos o problema e a correção sai hoje. Te aviso assim que estiver no ar.', 'entregue'],
    ],
  },
  {
    equipe: 'Suporte técnico', canal: 'telegram', atendente: 'marina',
    contato: { nome: 'Ótica Central', telefone: '@oticacentral' },
    mensagens: [
      ['cliente', -150, 'O app está pedindo login toda hora.'],
      ['atendente', -146, 'Vamos resolver! Pode atualizar o app para a versão 3.2? Isso corrige o problema.', 'lida'],
    ],
  },
  {
    equipe: 'Suporte técnico', canal: 'whatsapp', atendente: null, naoLidas: 1,
    contato: { nome: 'Ricardo Souza', empresa: 'RS Transportes', telefone: '+55 47 99870-3311' },
    mensagens: [['cliente', -25, 'Boa tarde, a integração com o banco parou de sincronizar desde ontem.']],
  },
  {
    equipe: 'Suporte técnico', canal: 'whatsapp', atendente: 'marina',
    contato: { nome: 'Clínica Vida', cnpj: '17.902.445/0001-33', telefone: '+55 61 99100-4040' },
    mensagens: [
      ['cliente', -600, 'Como cadastro um novo usuário na minha conta?'],
      ['atendente', -596, 'Vá em Configurações › Usuários › Convidar. Precisa de ajuda com isso?', 'lida'],
    ],
  },
  {
    equipe: 'Suporte técnico', canal: 'telegram', atendente: 'marina',
    contato: { nome: 'Gustavo Lima', empresa: 'Lima Cafés', telefone: '@gustavolima' },
    mensagens: [
      ['cliente', -720, 'Perdi o acesso ao e-mail cadastrado, como troco?'],
      ['atendente', -715, 'Vou te enviar um link de confirmação pelo WhatsApp cadastrado para trocar o e-mail.', 'lida'],
    ],
  },

  // ---------------- Onboarding (2 abertas) ----------------
  {
    equipe: 'Onboarding', canal: 'whatsapp', atendente: 'admin',
    contato: { nome: 'Nova Era Pet Shop', telefone: '+55 85 99777-6655' },
    mensagens: [
      ['cliente', -180, 'Acabei de contratar, por onde começo?'],
      ['atendente', -176, 'Bem-vindos! Agendei uma implantação para amanhã às 10h. Te envio o link.', 'lida'],
    ],
  },
  {
    equipe: 'Onboarding', canal: 'telegram', atendente: 'rafael',
    contato: { nome: 'Juliana Freitas', empresa: 'Freitas Eventos', telefone: '@jufreitas' },
    mensagens: [
      ['cliente', -1000, 'Consigo importar minha planilha de clientes?'],
      ['atendente', -996, 'Consegue sim! Em Clientes › Importar, aceita .xlsx e .csv.', 'lida'],
    ],
  },
];

async function semearDadosExemplo(db, senhaEquipe) {
  const admin = await db.prepare('SELECT id FROM usuarios ORDER BY id LIMIT 1').get();
  const buscarPorEmail = (email) => db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);

  const usuarios = {
    admin: admin.id,
    marina: (await buscarPorEmail('marina@bigteck.com.br'))?.id
      ?? await inserirUsuario(db, { nome: 'Marina Alves', email: 'marina@bigteck.com.br', senha: senhaEquipe, presenca: 'online' }),
    rafael: (await buscarPorEmail('rafael@bigteck.com.br'))?.id
      ?? await inserirUsuario(db, { nome: 'Rafael Costa', email: 'rafael@bigteck.com.br', senha: senhaEquipe, presenca: 'ausente' }),
  };

  const equipes = {};
  const insEquipe = db.prepare('INSERT INTO equipes (nome, cor, ordem) VALUES (?, ?, ?)');
  const insMembro = db.prepare('INSERT OR IGNORE INTO equipe_membros (equipe_id, usuario_id) VALUES (?, ?)');
  for (const [i, [nome, cor, membros]] of EQUIPES_EXEMPLO.entries()) {
    const existente = await db.prepare('SELECT id FROM equipes WHERE nome = ?').get(nome);
    const id = existente ? existente.id : Number((await insEquipe.run(nome, cor, i)).lastInsertRowid);
    equipes[nome] = id;
    for (const m of membros) await insMembro.run(id, usuarios[m]);
  }

  const agora = Date.now();
  const em = (min) => agora + min * 60_000;

  const insContato = db.prepare(`
    INSERT INTO contatos (nome, empresa, cnpj, telefone, dados_conta, pin, pin_validado_em, pin_validado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insConversa = db.prepare(`
    INSERT INTO conversas (protocolo, contato_id, equipe_id, atendente_id, canal, status, alerta, nao_lidas, criada_em, atualizada_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insMsg = db.prepare(`
    INSERT INTO mensagens (conversa_id, tipo, autor_id, texto, entrega, criada_em)
    VALUES (?, ?, ?, ?, ?, ?)`);

  let proximoProtocolo = 4790;

  await db.transacao(async () => {
    for (const c of CONVERSAS_EXEMPLO) {
      const ct = c.contato;
      const contatoId = Number((await insContato.run(
        ct.nome, ct.empresa ?? null, ct.cnpj ?? null, ct.telefone ?? null,
        ct.dados ? JSON.stringify(ct.dados) : null,
        ct.pin ?? null,
        ct.pin && ct.pinValidadoPor ? em(-(ct.pinValidadoHaMin ?? 0)) : null,
        ct.pin && ct.pinValidadoPor ? usuarios[ct.pinValidadoPor] : null,
      )).lastInsertRowid);

      const tempos = c.mensagens.map((m) => em(m[1]));
      const criadaEm = Math.min(...tempos);
      const atualizadaEm = Math.max(...tempos);
      const protocolo = c.protocolo ?? String(proximoProtocolo++);

      const conversaId = Number((await insConversa.run(
        protocolo, contatoId, equipes[c.equipe] ?? null,
        c.atendente ? usuarios[c.atendente] : null,
        c.canal, c.status ?? 'aberta',
        c.alerta ? JSON.stringify(c.alerta) : null,
        c.naoLidas ?? 0, criadaEm, atualizadaEm,
      )).lastInsertRowid);

      for (const [tipo, min, texto, entrega] of c.mensagens) {
        const autorId = tipo === 'cliente' ? null : usuarios[c.atendente ?? 'marina'];
        await insMsg.run(conversaId, tipo, autorId, texto, tipo === 'atendente' ? (entrega ?? 'entregue') : null, em(min));
      }
    }
  });
}

module.exports = { abrirBanco, semear, migrar, inserirUsuario, semearDadosExemplo, removerDadosExemplo };
