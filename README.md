# CRM de Atendimento · Bigteck

Sistema de atendimento ao cliente (estilo WhatsApp/Telegram) com **tela de login com senha** e a **tela de atendimento** com conversas, equipes, notas internas e dados do cliente.

## Como rodar no seu computador

### Jeito fácil (sem digitar comandos)

1. Instale o **Node.js** (versão LTS) em <https://nodejs.org>. É um instalador comum: avançar, avançar, concluir.
2. Na pasta do projeto, dê **dois cliques** em:
   - **Windows:** `iniciar.bat`
   - **Mac:** `iniciar.command` (na primeira vez, clique com o botão direito › Abrir)
3. Uma janela preta vai abrir, instalar o necessário (só na primeira vez) e o navegador abre sozinho em <http://localhost:3100>.
4. Para parar o sistema, feche essa janela preta.

### Pelo terminal

Abra o terminal na pasta do projeto e rode:

```bash
npm install
npm start
```

Depois abra <http://localhost:3100> no navegador.

### No Manus (ou em qualquer lugar que use o Vite)

O projeto também roda com o Vite, que é o que o Manus usa para mostrar a prévia:

```bash
pnpm install   # ou npm install
pnpm dev       # ou npm run dev
```

Abre na porta 3000 (ou na próxima livre). O servidor do CRM (login, conversas, banco de dados) roda **dentro** do Vite, então o login de verdade funciona no Manus também. A configuração fica em `vite.config.mjs`, já com os domínios e plugins que o Manus precisa.

Para gerar a versão compilada (opcional): `npm run build` cria a pasta `dist/`, e o `npm start` passa a usar essa versão automaticamente.

**Primeiro acesso**

| Campo  | Valor                  |
|--------|------------------------|
| E-mail | `admin@bigteck.com.br` |
| Senha  | `admin123`             |

Troque essa senha logo depois (veja abaixo). O CRM começa vazio, com as equipes Reembolso e Admin. Para uma demonstração com conversas de exemplo, defina `DADOS_EXEMPLO=true` no `.env` (os usuários de exemplo `marina@bigteck.com.br` e `rafael@bigteck.com.br` usam a mesma senha inicial; ao voltar para `false`, os exemplos são apagados).

## Telas de acesso

Todas ocupam a página inteira (lado escuro à esquerda, formulário à direita) e funcionam de verdade:

| Tela | Endereço | O que faz |
|---|---|---|
| Entrar | `/login` | E-mail e senha. "Entrar com Google Workspace" ainda não está disponível. |
| Criar conta por convite | `/convite?token=…` | A pessoa recebe um link do administrador, escolhe nome e senha e já entra. |
| Código de verificação | `/verificar` | Segunda etapa do login, ligada por `DOIS_FATORES=true` no `.env`. Código de 6 dígitos, vale 5 minutos. |
| Recuperar acesso | `/recuperar` | Envia um link de nova senha que vale 30 minutos e só funciona uma vez. |
| Definir nova senha | `/nova-senha?token=…` | Ao salvar, todas as sessões antigas dessa pessoa são encerradas. |

Senhas escolhidas pelo usuário precisam ter **pelo menos 10 caracteres, uma letra maiúscula e um número**.

### E-mails em modo de teste

Ainda não há serviço de e-mail configurado. Por enquanto, o código de verificação e o link de nova senha aparecem **na janela preta do servidor**, e as telas avisam isso. Quando houver um serviço de e-mail, basta adaptar o arquivo `src/email.js`.

### Convidar alguém para a equipe

```bash
npm run convite -- --email joao@empresa.com.br
npm run convite -- --email joao@empresa.com.br --papel admin
npm run convite -- --email joao@empresa.com.br --equipes "Reembolso,Admin" --dias 7
npm run convite -- --listar
```

O comando mostra um link. Envie o link para a pessoa: ela abre, escolhe nome e senha e já entra no sistema com o papel e as equipes definidos no convite.

## Conectar o WhatsApp (uazapi)

O CRM recebe e responde mensagens de WhatsApp pela API não oficial **uazapi**.

1. No painel do uazapi, pegue o **endereço do servidor** e o **token de administrador**.
2. Coloque os dois no arquivo `.env` (nunca no GitHub):
   ```
   UAZAPI_URL=https://seu-servidor.uazapi.com
   UAZAPI_ADMIN_TOKEN=cole-aqui-o-token
   BASE_URL=https://endereco-publico-do-crm
   ```
3. Reinicie o sistema, entre como administrador e clique no seu avatar (canto inferior esquerdo) e em **Conectar canal**.
4. Clique em **Adicionar WhatsApp** e conecte de um dos dois jeitos:
   - **Ler QR code**: no celular, WhatsApp › Aparelhos conectados › Conectar um aparelho › aponte para o QR code.
   - **Digitar número**: informe o número com DDD, gere o código e digite no celular em Aparelhos conectados › Conectar um aparelho › Conectar com número de telefone.

Quando conectar, o menu da conta (avatar) mostra "WhatsApp conectado" com o número. As mensagens dos clientes aparecem na lista de conversas, e as respostas enviadas pelo chat vão para o WhatsApp do cliente.

**Importante: o `BASE_URL` precisa ser um endereço público na internet.** O servidor do uazapi entrega as mensagens chamando `BASE_URL/webhook/uazapi/...`. Em `http://localhost` isso não funciona: dá para conectar e enviar, mas as mensagens recebidas não chegam. Para testar em casa, use um túnel (por exemplo, Cloudflare Tunnel ou ngrok) e coloque o endereço do túnel em `BASE_URL`; no Manus, use o endereço público da prévia.

Na janela de canais, o botão **Eventos** mostra os últimos avisos que o uazapi enviou ao CRM, o que ajuda a diagnosticar problemas. Mensagens de grupos são ignoradas. Fotos, áudios e documentos aparecem por enquanto como texto (por exemplo, "[Imagem]").

## Telegram (bot oficial)

O Telegram é o canal mais simples de ligar: só precisa do **token de um bot**, e não precisa de endereço público (o CRM busca as mensagens sozinho).

1. No Telegram, abra o **@BotFather** e envie `/newbot`. Escolha um nome (ex.: Bigteck Atendimento) e um usuário terminado em "bot".
2. Copie o token que ele mostra (formato `123456789:AAF…`).
3. No CRM, entre como administrador, clique no avatar › **Conectar canal** › cole o token em **Adicionar Telegram**.
4. Divulgue o @usuário do bot para os clientes. Tudo o que eles mandarem ao bot aparece na lista de conversas, e as respostas do chat vão para o Telegram deles.

O CRM recebe as mensagens por consulta contínua à API do Telegram. Se o mesmo bot for usado por dois sistemas ao mesmo tempo (por exemplo, o CRM local e o publicado), o Telegram recusa um deles e a janela de canais mostra o erro. Mensagens de grupos são ignoradas.

## Ícones (Iconly)

Os ícones da interface vêm do **Iconly**. Coloque os arquivos exportados na pasta `client/public/icones/`:

- `nome.svg` para a versão estática (usada em toda a tela);
- `nome.json` (Lottie) para a versão animada, usada no menu lateral e no botão Enviar. A animação toca quando o mouse passa por cima.

A lista completa de nomes esperados está em `client/public/icones/LEIA-ME.md`. Enquanto um arquivo não existir, o sistema usa o ícone padrão desenhado no código, então nada quebra durante a troca. Não é preciso alterar código: basta colocar os arquivos na pasta e recarregar a página.

## Criar usuários e trocar senhas

```bash
# criar um atendente
npm run usuario -- --email joao@empresa.com.br --senha 123456 --nome "João Silva"

# redefinir a senha de alguém (derruba as sessões abertas dessa pessoa)
npm run usuario -- --email admin@bigteck.com.br --senha NovaSenhaForte

# tornar administrador / bloquear acesso / listar
npm run usuario -- --email joao@empresa.com.br --papel admin
npm run usuario -- --email joao@empresa.com.br --desativar
npm run usuario -- --listar
```

## O que já funciona

- Login com e-mail e senha (senhas guardadas com hash, nunca em texto puro).
- Bloqueio temporário após 8 tentativas erradas seguidas.
- Sessão por cookie seguro (12 h, ou 30 dias com "Manter conectado").
- Convite por link, recuperação de senha e verificação em duas etapas (opcional).
- WhatsApp conectado via uazapi: QR code ou código pelo número, recebimento e envio de mensagens.
- Tela de atendimento com o visual aprovado:
  - caixas **Todas / Minhas / Sem resposta** e filtro por **equipe**;
  - lista de conversas com busca por nome, empresa, CNPJ ou protocolo;
  - chat com histórico, envio de resposta, nota interna e troca de equipe/atendente;
  - marcar conversa como resolvida ou reabrir;
  - painel do cliente com PIN, dados da conta, alertas e notas.
- Dados de exemplo opcionais (`DADOS_EXEMPLO=true`) para testar a tela.
- Testes automáticos (`npm test`).

## O que ainda é só visual ("em breve")

Botões que mostram um aviso e ainda não fazem nada: **Entrar com Google Workspace**, **Anexo**, **Respostas rápidas**, **Estornar**, **Ver faturas**, **Abrir conta**, **Nova equipe**, **Adicionar à equipe**, **Filtros** e os outros módulos do menu lateral.

No WhatsApp e no Telegram, mídias (fotos, áudios, documentos) ainda não são exibidas, só indicadas como texto (por exemplo, "[Imagem]").

## Configurações (opcional)

Copie `.env.example` para `.env` e ajuste:

| Variável        | Para que serve                                            |
|-----------------|-----------------------------------------------------------|
| `PORT`          | Porta do servidor (padrão 3100)                           |
| `ADMIN_EMAIL`   | E-mail do administrador criado no primeiro acesso         |
| `ADMIN_SENHA`   | Senha inicial do administrador                            |
| `ADMIN_NOME`    | Nome do administrador                                     |
| `DADOS_EXEMPLO` | `true` para criar conversas de exemplo (padrão: vazio)     |
| `DOIS_FATORES`  | `true` para pedir um código por e-mail a cada login       |
| `BASE_URL`      | Endereço público do sistema, usado nos links de convite, nova senha e no webhook do WhatsApp |
| `UAZAPI_URL`    | Endereço do servidor uazapi (WhatsApp)                    |
| `UAZAPI_ADMIN_TOKEN` | Token de administrador do uazapi                     |
| `COOKIE_SEGURO` | `true` quando o sistema estiver publicado com HTTPS       |

O banco de dados fica em `data/crm.sqlite`. Para começar do zero, pare o servidor e apague essa pasta.

## Estrutura do projeto

```
server.js                 inicia o servidor (npm start)
vite.config.mjs           configuração do Vite/Manus (npm run dev)
src/sistema.js            monta o sistema (configuração, banco, e-mail, aplicação)
src/app.js                rotas de login, sessão e páginas
src/rotas-api.js          API de conversas, mensagens, equipes e canais
src/uazapi.js             cliente da API do uazapi (WhatsApp)
src/canais.js             traduz os eventos do WhatsApp em conversas e mensagens
src/db.js                 banco de dados (SQLite) e dados de exemplo
src/telegram.js           cliente da Bot API do Telegram e consulta contínua
src/senha.js              hash e verificação de senha
src/acesso.js             convites, recuperação de senha e verificação em duas etapas
src/email.js              envio de e-mails (modo de teste: mostra na janela do servidor)
src/sessoes.js            sessões por cookie
src/limitador.js          bloqueio de tentativas de login
client/login.html         tela de entrar
client/convite.html       criar conta por convite
client/verificar.html     código de verificação (duas etapas)
client/recuperar.html     recuperar acesso
client/nova-senha.html    definir nova senha
client/atendimento.html   tela de atendimento
client/assets/            CSS, JavaScript e ícones
client/public/__manus__/  coletor de logs usado pelo Manus
client/public/icones/     ícones do Iconly (SVG estático e Lottie animado)
client/public/vendor/     biblioteca que reproduz as animações Lottie
client/assets/js/icones.js carrega os ícones do Iconly com reserva no código
scripts/criar-usuario.js  gerenciar usuários pelo terminal
scripts/criar-convite.js  gerar links de convite
test/                     testes automáticos
```

## Comandos úteis

| Comando           | O que faz                                                 |
|-------------------|-----------------------------------------------------------|
| `npm start`       | Inicia o sistema (uso local, porta 3100)                  |
| `npm run dev`     | Inicia pelo Vite, como o Manus faz (porta 3000)           |
| `npm run build`   | Gera a versão compilada em `dist/`                        |
| `npm test`        | Roda os testes automáticos                                |
| `npm run usuario` | Cria usuários / troca senhas                              |
| `npm run convite` | Gera um link de convite                                   |
