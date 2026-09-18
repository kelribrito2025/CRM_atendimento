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
3. Reinicie o sistema, entre como administrador e abra **Configurações › Canais** (pelo botão de engrenagem, ou pelo avatar › **Conectar canal**).
4. Clique em **Adicionar WhatsApp** e conecte de um dos dois jeitos:
   - **Ler QR code**: no celular, WhatsApp › Aparelhos conectados › Conectar um aparelho › aponte para o QR code.
   - **Digitar número**: informe o número com DDD, gere o código e digite no celular em Aparelhos conectados › Conectar um aparelho › Conectar com número de telefone.

Quando conectar, o menu da conta (avatar) mostra "WhatsApp conectado" com o número. As mensagens dos clientes aparecem na lista de conversas, e as respostas enviadas pelo chat vão para o WhatsApp do cliente.

**Importante: o `BASE_URL` precisa ser um endereço público na internet.** O servidor do uazapi entrega as mensagens chamando `BASE_URL/webhook/uazapi/...`. Em `http://localhost` isso não funciona: dá para conectar e enviar, mas as mensagens recebidas não chegam. Para testar em casa, use um túnel (por exemplo, Cloudflare Tunnel ou ngrok) e coloque o endereço do túnel em `BASE_URL`; no Manus, use o endereço público da prévia.

Em **Configurações › Canais**, dentro de **Gerenciar**, o botão **Ver eventos** mostra os últimos avisos que o uazapi enviou ao CRM, o que ajuda a diagnosticar problemas. Mensagens de grupos são ignoradas. Fotos, áudios e documentos aparecem por enquanto como texto (por exemplo, "[Imagem]").

## Onde os dados ficam guardados

O CRM funciona com dois tipos de banco de dados, e escolhe sozinho:

| Situação | Banco usado |
|---|---|
| No seu computador (padrão) | Arquivo `data/crm.sqlite`, sem instalar nada |
| Na publicação, com `DATABASE_URL` definida | MySQL/TiDB da hospedagem |

**Por que isso importa:** em hospedagens como a do Manus (Cloud Run), o disco é apagado a cada publicação, e com ele o arquivo do banco. Definindo a variável `DATABASE_URL` com o endereço do banco gerenciado, as conversas, os usuários e os canais continuam existindo depois de cada publicação.

```
DATABASE_URL=mysql://usuario:senha@servidor:3306/nome_do_banco
```

O sistema cria as tabelas sozinho na primeira vez, nos dois casos. Para rodar os testes contra um MySQL de verdade: `BANCO_TESTE=mysql://... npm run test:mysql`.

## Acentuação automática

Na caixa de escrever, o CRM acentua sozinho as palavras mais comuns do atendimento assim que o atendente termina de escrevê-las: "nao" vira "não", "informacao" vira "informação", "cartao" vira "cartão", "usuario" vira "usuário".

O botão **Á**, ao lado das respostas rápidas, liga e desliga a correção, e cada pessoa mantém a sua escolha no próprio navegador. O corretor do navegador também está ligado, sublinhando o que estiver errado.

Palavras que mudam de sentido com o acento ficam de fora de propósito: "esta/está", "e/é", "a/à", "de/dê". Para acertar essas seria preciso entender a frase inteira, e um palpite errado mudaria o que a pessoa quis dizer.

O vocabulário auditável fica em `client/assets/js/palavras-acentuadas.mjs`. Para adicionar uma correção segura, inclua uma linha no formato `palavra_sem_acento: 'palavra_com_acento',`. O arquivo contém mais de 900 correções frequentes, incluindo palavras com cedilha; depois de qualquer alteração, rode `pnpm test`.

## Respostas rápidas

Mensagens prontas para o atendente não repetir texto o dia inteiro. Cada uma tem um atalho (por exemplo `/estorno`), um título e a mensagem.

Dois jeitos de usar:

1. Clicar no botão do raio, ao lado do campo de escrever. O painel sobe de dentro do chat, na largura toda da conversa, e para logo acima do campo de escrever.
2. Digitar `/` no campo de mensagem. O painel abre já filtrado pelo que vier depois da barra; Enter escolhe a primeira da lista.

Clicando na resposta, o texto entra no campo de mensagem e o painel fecha. O atendente ainda pode editar antes de enviar.

Ao criar, escolha quem enxerga: **todas as equipes**, **uma equipe** ou **só eu**. Cada pessoa só vê o que lhe cabe, e só quem criou (ou um administrador) pode alterar e excluir. O CRM conta quantas vezes cada atalho foi usado e mostra as mais usadas primeiro.

## Enviar arquivos para o cliente

O botão do clipe, ao lado do campo de escrever, envia foto, vídeo, áudio ou documento (até 20 MB). O arquivo é guardado no S3 e o WhatsApp ou o Telegram do cliente recebe um endereço temporário (15 minutos) para buscá-lo — o endereço do bucket nunca aparece na tela nem para o cliente.

Precisa do S3 configurado (veja a seção abaixo). Sem ele, o botão avisa em vez de falhar calado.

## Chat do site (estilo Intercom)

O cliente conversa pelo painel dele, no site da empresa, e a conversa cai na mesma caixa de entrada do CRM — com o selo **Chat do site** ao lado do nome.

Para ligar, defina no `.env`:

```
WIDGET_SEGREDO=<um segredo longo, gerado por você>
WIDGET_EQUIPE_ID=          # opcional: id da equipe que recebe essas conversas
```

Gere o segredo com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do lado do site são duas linhas no HTML:

```html
<script src="https://SEU-CRM/widget.js" defer></script>
<script>
  window.addEventListener('load', () => {
    ChatAtendimento.identificar({ id: '12345', nome: 'Carla Menezes', email: 'carla@empresa.com.br', assinatura: '...' });
  });
</script>
```

A `assinatura` é um HMAC-SHA256 do id do usuário feito **no servidor do site**, com o mesmo `WIDGET_SEGREDO`. É o que impede alguém de trocar o id no navegador e ler a conversa de outro cliente. Sem o `WIDGET_SEGREDO` no servidor, o chat fica desligado: nenhuma conversa abre. No logout, o site chama `ChatAtendimento.sair()`.

O passo a passo completo para entregar a quem cuida do site está em **[docs/chat-do-site.md](docs/chat-do-site.md)**.

Nesta primeira versão o chat do site troca texto; fotos e documentos continuam pelo WhatsApp e Telegram.

## Arquivos das conversas no Amazon S3

Fotos, áudios, vídeos e documentos recebidos podem ser guardados no S3, em vez de serem buscados no canal a cada visualização.

```
S3_ACCESS_KEY_ID=sua-chave
S3_SECRET_ACCESS_KEY=seu-segredo
```

Por padrão o CRM usa o bucket `mindi-storage-bucket`, região `us-east-1`, e grava **somente** dentro da pasta `chat-app-numeros/`. Para mudar, use `S3_BUCKET`, `S3_REGION` e `S3_PREFIXO`.

Como funciona:

- O arquivo vai para o S3 assim que chega; no banco fica só a chave do objeto, o tamanho e o tipo.
- O bucket continua privado. A tela nunca vê o nome do bucket nem a chave: ela pede o arquivo pela rota `/api/midia/<id>`, que exige login.
- Para casos em que o arquivo precisa ser aberto direto na AWS, o servidor sabe gerar um link assinado que vale 5 minutos.
- As credenciais ficam só no servidor, lidas de `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`.
- Nada é escrito fora da pasta combinada: qualquer tentativa é recusada antes de sair do CRM.
- Se o S3 estiver fora do ar, o CRM busca o arquivo no canal, como antes.

## Consulta de saldo pelo PIN

No card **PIN do cliente** (painel da direita), o atendente digita o PIN nos quadradinhos e clica em **Consultar saldo**. Aparecem o saldo, o nome, quantas recargas o cliente tem e avisos de conta bloqueada ou desativada. Quando a consulta dá certo, o PIN fica guardado naquele cliente e o card marca **Conferido**, com a hora e quem conferiu.

Para ligar, coloque a chave do agente no `.env` e reinicie:

```
SALDO_TOKEN=sua-chave-do-agente
```

A chave dá acesso a muito mais do que a consulta: crédito, reembolso, e desativar ou banir a conta do cliente. Por isso ela **fica só no servidor**: a tela manda apenas o PIN para o CRM, o CRM consulta e devolve somente o que aparece na tela. Sem a chave, os botões não aparecem.

Cada ação depende de uma permissão própria na chave, ligada no painel do site. Desligue o que a sua operação não usa: a permissão que não existe na chave não pode ser usada por engano.

**Banir e desbanir são só de administrador**, travados no próprio CRM. Não por serem irreversíveis — o site devolve as chaves de API que a ação cortou —, mas por não serem decisão de quem está no meio de um atendimento.

A situação da conta (ativa, desativada, banida, encerrada pelo titular) vem **decidida pelo site**, pela mesma função que o login dele usa para barrar. O CRM não deduz nada pelo status: existem contas marcadas `active` que estão bloqueadas de fato, e deduzir fazia a tela dizer "Sem bloqueio" para elas.

Cada atendente pode fazer até 60 consultas a cada 5 minutos, para evitar consulta em massa (todas as chamadas ficam registradas do outro lado). PIN não encontrado aparece como aviso na tela, não como erro do sistema.

## Telegram (bot oficial)

O Telegram é o canal mais simples de ligar: só precisa do **token de um bot**, e não precisa de endereço público (o CRM busca as mensagens sozinho).

1. No Telegram, abra o **@BotFather** e envie `/newbot`. Escolha um nome (ex.: Bigteck Atendimento) e um usuário terminado em "bot".
2. Copie o token que ele mostra (formato `123456789:AAF…`).
3. No CRM, entre como administrador, abra **Configurações › Canais** e cole o token em **Novo bot do Telegram** › **Adicionar Telegram**.
4. Divulgue o @usuário do bot para os clientes. Tudo o que eles mandarem ao bot aparece na lista de conversas, e as respostas do chat vão para o Telegram deles.

O CRM recebe as mensagens por consulta contínua à API do Telegram. Se o mesmo bot for usado por dois sistemas ao mesmo tempo (por exemplo, o CRM local e o publicado), o Telegram recusa um deles e a página de Canais mostra o erro. Mensagens de grupos são ignoradas.

## Ícones (Iconly)

Os ícones da interface vêm do **Iconly**. Coloque os arquivos exportados na pasta `client/public/icones/`:

- `nome.svg` para a versão estática (usada em toda a tela);
- `nome.json` (Lottie) para a versão animada, usada no menu lateral e no botão Enviar. A animação toca quando o mouse passa por cima.

A lista completa de nomes esperados está em `client/public/icones/LEIA-ME.md`. Enquanto um arquivo não existir, o sistema usa o ícone padrão desenhado no código, então nada quebra durante a troca. Não é preciso alterar código: basta colocar os arquivos na pasta e recarregar a página.

## Contas de login e perfis de atendimento

A função **Adicionar atendente** está temporariamente bloqueada na barra lateral e em **Configurações › Equipe**. Os perfis já existentes continuam disponíveis em **Escolha seu atendente** após cada novo login. Mensagens, conversas e auditoria usam o nome escolhido; as permissões, credenciais de integração e limites antiabuso continuam sendo os da conta autenticada. A auditoria registra perfil e conta separadamente. Também é possível trocar o atendente pelo menu da conta.

Os comandos abaixo continuam reservados a contas individuais que precisam de e-mail e senha próprios:

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
- Envio de anexos pelo atendente (foto, vídeo, áudio e documento até 20 MB), entregues no WhatsApp e no Telegram do cliente.
- Notas internas que podem ser editadas e apagadas por quem escreveu (ou por um administrador), no chat ou na ficha do cliente.
- Botão de encerrar direto no card, em "Minhas conversas", e o gesto de segurar o card (o card enche de verde da esquerda para a direita) para encerrar sem abrir a conversa.
- Caixa "Encerradas" com o que foi encerrado nos últimos sete dias.
- Inbox por canal: caixas separadas de Chat do site, Telegram e WhatsApp, ao lado das equipes.
- Histórico carregado aos poucos: a conversa abre com as últimas 40 mensagens e busca as anteriores conforme a rolagem sobe.
- Chat do site (estilo Intercom) para o cliente conversar pelo painel dele, com a conversa caindo na mesma caixa de entrada.
- Tela de configurações com a gestão da equipe: perfis de atendimento, papel, bloqueio de acesso e equipes.
- Busca de conversas por nome, celular ou PIN do cliente.
- Dados de exemplo opcionais (`DADOS_EXEMPLO=true`) para testar a tela.
- Testes automáticos (`npm test`).

## Configurações

O botão da engrenagem, no menu lateral, abre a tela de configurações. Hoje ela tem:

- **Equipe** (só administrador): quem trabalha no CRM, com papel, equipes e presença. Dá para adicionar perfis internos, editar nomes, bloquear perfis e escolher em quais equipes cada pessoa está. Perfis internos usam a conta compartilhada e são escolhidos logo após o login; não recebem senha própria.
- **Canais**: abre a janela de conexão do WhatsApp e do Telegram.
- **Respostas rápidas**: todos os atalhos salvos, com criar, editar e excluir. Quem criou (ou um administrador) pode alterar; os dos outros aparecem só para consulta.
- **Aparência**: tema **claro**, **escuro** ou **seguir o sistema**, e a barra de navegação **na lateral** ou **no topo**. Vale por navegador, para cada pessoa — não muda nada para a equipe.

Ninguém consegue se trancar do lado de fora: você não pode tirar o seu próprio acesso de administrador nem bloquear a si mesma, e o CRM sempre mantém pelo menos um administrador ativo.

## Abrir a conta do cliente no site

Na ficha do cliente, o botão **Abrir conta** (com o ícone de olho) entra na conta da pessoa no site, já logada. Aparece só para quem chegou pelo chat do site, que é de onde vem o id do cliente.

Num clique só: o servidor do CRM pede ao site um link de uso único, mandando junto **quem** está abrindo (vindo da sessão, nunca do navegador) e de **qual conversa**. O site registra isso, e o CRM deixa uma nota interna na conversa dizendo quem abriu a conta.

No `.env`:

```
ABRIR_CONTA_TOKEN=<chave do agente, só para isto>
# ABRIR_CONTA_URL=https://app.numero-virtual.com/api/agents/impersonar
```

Use uma chave separada da chave de saldo: assim dá para revogar o "abrir conta" sem derrubar a consulta de saldo. Sem a chave, o botão fica apagado.

## O que ainda é só visual ("em breve")

Botões que mostram um aviso e ainda não fazem nada: **Entrar com Google**, **Abrir conta**, **Nova equipe**, **Adicionar à equipe**, **Filtros** e os outros módulos do menu lateral.

No Telegram, a foto de perfil do cliente aparece no avatar (o CRM confere uma vez por dia se mudou). No WhatsApp, a foto aparece quando o servidor do uazapi manda o endereço dela no aviso da mensagem; a API oficial deles não tem um jeito de pedir a foto de um contato. Fotos, áudios, vídeos e documentos aparecem dentro da conversa (o CRM baixa o arquivo com o token do bot, que nunca vai para o navegador). No WhatsApp, mídias ainda aparecem só como texto, por exemplo "[Imagem]".

## Variáveis de ambiente (opcional)

Copie `.env.example` para `.env` e ajuste:

| Variável        | Para que serve                                            |
|-----------------|-----------------------------------------------------------|
| `PORT`          | Porta do servidor (padrão 3100)                           |
| `ADMIN_EMAIL`   | E-mail do administrador criado no primeiro acesso         |
| `ADMIN_SENHA`   | Senha inicial do administrador                            |
| `ADMIN_NOME`    | Nome do administrador                                     |
| `DATABASE_URL`  | Banco MySQL/TiDB da publicação (sem ela, usa o arquivo local) |
| `DADOS_EXEMPLO` | `true` para criar conversas de exemplo (padrão: vazio)     |
| `DOIS_FATORES`  | `true` para pedir um código por e-mail a cada login       |
| `BASE_URL`      | Endereço público do sistema, usado nos links de convite, nova senha e no webhook do WhatsApp |
| `SALDO_TOKEN`   | Chave do agente para consultar o saldo pelo PIN (fica só no servidor) |
| `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` | Credenciais do S3 onde ficam os arquivos das conversas |
| `UAZAPI_URL`    | Endereço do servidor uazapi (WhatsApp)                    |
| `UAZAPI_ADMIN_TOKEN` | Token de administrador do uazapi                     |
| `COOKIE_SEGURO` | `true` quando o sistema estiver publicado com HTTPS       |
| `TRUST_PROXY`   | `true` quando o sistema roda atrás de um proxy (Railway), para o bloqueio de tentativas ver o IP real |
| `MODO_SANDBOX`  | `true` só no ambiente de teste: dados normais, mas nada é enviado ao WhatsApp, ao Telegram nem ao site, e nenhum bot recebe mensagens |

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
src/banco.js              conversa com o banco: arquivo SQLite ou MySQL/TiDB
src/db.js                 tabelas do sistema e dados de exemplo
src/telegram.js           cliente da Bot API do Telegram e consulta contínua
src/saldo.js              consulta de saldo do cliente pelo PIN
src/s3.js                 guarda os arquivos das conversas no Amazon S3
src/widget.js             chat do site: sessões do visitante e mensagens
src/senha.js              hash e verificação de senha
src/acesso.js             convites, recuperação de senha e verificação em duas etapas
src/email.js              envio de e-mails (modo de teste: mostra na janela do servidor)
src/sessoes.js            sessões por cookie
src/sandbox.js            modo de teste: bloqueia tudo que sairia para fora (MODO_SANDBOX)
src/limitador.js          bloqueio de tentativas de login
client/login.html         tela de entrar
client/convite.html       criar conta por convite
client/verificar.html     código de verificação (duas etapas)
client/recuperar.html     recuperar acesso
client/nova-senha.html    definir nova senha
client/atendimento.html   tela de atendimento
client/widget.html        chat que roda dentro do site do cliente
client/public/widget.js   arquivo de uma linha que o site do cliente inclui
client/assets/            CSS, JavaScript e ícones
client/public/__manus__/  coletor de logs usado pelo Manus
client/public/icones/     ícones do Iconly (SVG estático e Lottie animado)
client/public/vendor/     biblioteca que reproduz as animações Lottie
client/assets/js/icones.js carrega os ícones do Iconly com reserva no código
scripts/criar-usuario.js  gerenciar usuários pelo terminal
scripts/criar-convite.js  gerar links de convite
scripts/copiar-banco.js   copiar um banco MySQL/TiDB para outro (ambiente dev, migração)
scripts/gerar-fundo-login.js  gera o padrão vetorial (SVG) que decora o lado esquerdo do login
test/                     testes automáticos
docs/chat-do-site.md      guia do chat do site para entregar ao dev
docs/ambiente-dev-railway.md  ambiente de desenvolvimento no Railway e cópia do banco
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
