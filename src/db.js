'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { gerarHashSenha } = require('./senha');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'atendente',
  presenca TEXT NOT NULL DEFAULT 'online',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL,
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);

CREATE TABLE IF NOT EXISTS equipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  cor TEXT NOT NULL DEFAULT '#12B85C',
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS equipe_membros (
  equipe_id INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (equipe_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS contatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  empresa TEXT,
  cnpj TEXT,
  telefone TEXT,
  dados_conta TEXT,
  pin TEXT,
  pin_validado_em INTEGER,
  pin_validado_por INTEGER REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo TEXT NOT NULL UNIQUE,
  contato_id INTEGER NOT NULL REFERENCES contatos(id),
  equipe_id INTEGER REFERENCES equipes(id),
  atendente_id INTEGER REFERENCES usuarios(id),
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'aberta',
  alerta TEXT,
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  criada_em INTEGER NOT NULL,
  atualizada_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  autor_id INTEGER REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  entrega TEXT,
  criada_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id, criada_em);

CREATE TABLE IF NOT EXISTS convites (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  papel TEXT NOT NULL DEFAULT 'atendente',
  equipes TEXT,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  usado_em INTEGER
);

CREATE TABLE IF NOT EXISTS redefinicoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  usado_em INTEGER
);

CREATE TABLE IF NOT EXISTS verificacoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  lembrar INTEGER NOT NULL DEFAULT 0,
  tentativas INTEGER NOT NULL DEFAULT 0,
  reenviado_em INTEGER NOT NULL,
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);
`;

function abrirBanco(caminho = ':memory:') {
  const emMemoria = caminho === ':memory:';
  if (!emMemoria) fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON;');
  if (!emMemoria) db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

function contar(db, tabela) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;
}

function inserirUsuario(db, { nome, email, senha, papel = 'atendente', presenca = 'online' }) {
  const info = db
    .prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, presenca) VALUES (?, ?, ?, ?, ?)')
    .run(String(nome).trim(), String(email).trim().toLowerCase(), gerarHashSenha(senha), papel, presenca);
  return Number(info.lastInsertRowid);
}

// Cria o administrador inicial e (opcionalmente) dados de exemplo.
function semear(db, opcoes = {}) {
  const {
    adminEmail = 'admin@bigteck.com.br',
    adminSenha = 'admin123',
    adminNome = 'Gestor Bigteck',
    senhaEquipe = adminSenha,
    comDadosExemplo = true,
  } = opcoes;

  const resultado = { adminCriado: false, dadosExemploCriados: false };

  if (contar(db, 'usuarios') === 0) {
    inserirUsuario(db, { nome: adminNome, email: adminEmail, senha: adminSenha, papel: 'admin' });
    resultado.adminCriado = true;
  }

  if (comDadosExemplo && contar(db, 'conversas') === 0) {
    semearDadosExemplo(db, senhaEquipe);
    resultado.dadosExemploCriados = true;
  }

  return resultado;
}

/* ------------------------------------------------------------------ */
/* Dados de exemplo (espelham o visual da tela de atendimento)          */
/* ------------------------------------------------------------------ */

const EQUIPES_EXEMPLO = [
  ['Reembolso', '#12B85C', ['marina', 'rafael']],
  ['Cobrança', '#1D6FA5', ['admin', 'rafael']],
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

  // ---------------- Cobrança (4 abertas) ----------------
  {
    equipe: 'Cobrança', canal: 'whatsapp', atendente: 'admin',
    contato: { nome: 'Fernanda Rocha', empresa: 'Rocha Contabilidade', telefone: '+55 11 99333-7788' },
    mensagens: [
      ['cliente', -95, 'Meu boleto venceu ontem, consigo uma segunda via?'],
      ['atendente', -90, 'Consigo sim! Gerei a segunda via com vencimento para amanhã.', 'lida'],
    ],
  },
  {
    equipe: 'Cobrança', canal: 'telegram', atendente: 'rafael',
    contato: { nome: 'Distribuidora Norte', cnpj: '08.221.930/0001-12', telefone: '@distnorte' },
    mensagens: [
      ['cliente', -240, 'Podemos parcelar a fatura de agosto?'],
      ['atendente', -236, 'Podemos, em até 3x sem juros. Quer que eu gere o parcelamento?', 'lida'],
      ['cliente', -230, 'Quero sim, obrigado.'],
      ['atendente', -228, 'Pronto! Parcelamento gerado, o primeiro boleto chega por e-mail.', 'lida'],
    ],
  },
  {
    equipe: 'Cobrança', canal: 'whatsapp', atendente: 'admin',
    contato: { nome: 'Marcos Vieira', empresa: 'Vieira Pneus', telefone: '+55 31 98811-2200' },
    mensagens: [
      ['cliente', -400, 'A cobrança de setembro veio com valor diferente.'],
      ['atendente', -395, 'Oi, Marcos. Houve reajuste anual de 5%, conforme o contrato. Te envio o detalhamento.', 'lida'],
    ],
  },
  {
    equipe: 'Cobrança', canal: 'whatsapp', atendente: 'rafael',
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

function semearDadosExemplo(db, senhaEquipe) {
  const admin = db.prepare('SELECT id FROM usuarios ORDER BY id LIMIT 1').get();
  const buscarPorEmail = (email) => db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);

  const usuarios = {
    admin: admin.id,
    marina: buscarPorEmail('marina@bigteck.com.br')?.id
      ?? inserirUsuario(db, { nome: 'Marina Alves', email: 'marina@bigteck.com.br', senha: senhaEquipe, presenca: 'online' }),
    rafael: buscarPorEmail('rafael@bigteck.com.br')?.id
      ?? inserirUsuario(db, { nome: 'Rafael Costa', email: 'rafael@bigteck.com.br', senha: senhaEquipe, presenca: 'ausente' }),
  };

  const equipes = {};
  const insEquipe = db.prepare('INSERT INTO equipes (nome, cor, ordem) VALUES (?, ?, ?)');
  const insMembro = db.prepare('INSERT OR IGNORE INTO equipe_membros (equipe_id, usuario_id) VALUES (?, ?)');
  EQUIPES_EXEMPLO.forEach(([nome, cor, membros], i) => {
    const existente = db.prepare('SELECT id FROM equipes WHERE nome = ?').get(nome);
    const id = existente ? existente.id : Number(insEquipe.run(nome, cor, i).lastInsertRowid);
    equipes[nome] = id;
    for (const m of membros) insMembro.run(id, usuarios[m]);
  });

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

  db.exec('BEGIN');
  try {
    for (const c of CONVERSAS_EXEMPLO) {
      const ct = c.contato;
      const contatoId = Number(insContato.run(
        ct.nome, ct.empresa ?? null, ct.cnpj ?? null, ct.telefone ?? null,
        ct.dados ? JSON.stringify(ct.dados) : null,
        ct.pin ?? null,
        ct.pin && ct.pinValidadoPor ? em(-(ct.pinValidadoHaMin ?? 0)) : null,
        ct.pin && ct.pinValidadoPor ? usuarios[ct.pinValidadoPor] : null,
      ).lastInsertRowid);

      const tempos = c.mensagens.map((m) => em(m[1]));
      const criadaEm = Math.min(...tempos);
      const atualizadaEm = Math.max(...tempos);
      const protocolo = c.protocolo ?? String(proximoProtocolo++);

      const conversaId = Number(insConversa.run(
        protocolo, contatoId, equipes[c.equipe] ?? null,
        c.atendente ? usuarios[c.atendente] : null,
        c.canal, c.status ?? 'aberta',
        c.alerta ? JSON.stringify(c.alerta) : null,
        c.naoLidas ?? 0, criadaEm, atualizadaEm,
      ).lastInsertRowid);

      for (const [tipo, min, texto, entrega] of c.mensagens) {
        const autorId = tipo === 'cliente' ? null : usuarios[c.atendente ?? 'marina'];
        insMsg.run(conversaId, tipo, autorId, texto, tipo === 'atendente' ? (entrega ?? 'entregue') : null, em(min));
      }
    }
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

module.exports = { abrirBanco, semear, inserirUsuario, semearDadosExemplo };
