# Ambiente de desenvolvimento no Railway

Produção já roda no Railway a partir do branch `main`. Este guia cria um segundo
ambiente, **dev**, no mesmo projeto do Railway, com banco próprio e endereço
próprio, para testar mudanças antes de irem para produção.

Fluxo de trabalho depois de pronto:

```
branch de trabalho (claude/...) → dev (Railway dev) → main (Railway produção)
```

---

## 1. Branch `dev` no GitHub

O ambiente dev do Railway publica a partir de um branch. Crie o `dev` a partir do
`main` atual:

```bash
git fetch origin main
git checkout -b dev origin/main
git push -u origin dev
```

---

## 2. Criar o ambiente no Railway

No painel do Railway, dentro do projeto do CRM:

1. **Settings › Environments › New Environment**.
2. Nome: `dev`. Escolha **Duplicate** a partir de `production` (copia os serviços
   e as variáveis; o banco e o domínio ficam para ajustar abaixo).
3. Troque o ambiente no seletor do topo para `dev` antes de continuar.

### Fonte (branch)

No serviço do CRM: **Settings › Source › Branch** → `dev`. Deixe o deploy
automático ligado. Confira que o ambiente `production` continua em `main`.

### Domínio

**Settings › Networking › Generate Domain**. O Railway gera algo como
`crm-dev-xxxx.up.railway.app`. Esse endereço vai na variável `BASE_URL`.

---

## 3. Banco de dados separado (obrigatório)

Dev **nunca** pode apontar para o banco de produção: além dos dados, a tabela
`canais` guarda os tokens dos bots do Telegram. Ao subir, o CRM religa todos os
bots marcados como conectados; com dois CRMs no mesmo banco, produção e dev
disputam o `getUpdates` do mesmo bot, o Telegram recusa um deles com erro 409, o
canal aparece com erro em produção e as mensagens chegam com atraso.

A solução é um banco só de dev, **copiado de produção** para testar com dados
reais. Hoje produção usa o TiDB que vem com o Manus. Para o dev:

1. No [TiDB Cloud](https://tidbcloud.com), crie um cluster **Serverless** (tem faixa
   gratuita) ou use o cluster que já existe, e crie o banco `crm_dev`.
2. Anote a URL de conexão no formato `mysql://usuario:senha@host:4000/crm_dev`
   (o TiDB Cloud mostra host, porta, usuário e senha em **Connect**; a senha vai na
   URL com caracteres especiais codificados, por exemplo `@` vira `%40`).
3. No seu computador, com o projeto instalado (`npm install`), copie produção para o
   dev:

   ```bash
   npm run copiar-banco -- --de "<DATABASE_URL de produção>" --para "<URL do crm_dev>"
   ```

   O script lê a origem (nunca a altera), recria as tabelas no destino, copia as
   linhas e **deixa os bots do Telegram desconectados na cópia**. Para renovar o dev
   com dados frescos depois, repita com `--substituir`.

Alternativa sem copiar dados: `DATABASE_URL` apontando para um banco vazio. No
primeiro acesso o CRM cria as tabelas e o administrador (`ADMIN_EMAIL` /
`ADMIN_SENHA`). Se for usar o MySQL do próprio Railway, acrescente `?ssl=false` à
URL, porque o CRM liga TLS para qualquer host que não seja local.

---

## 4. Variáveis do ambiente `dev`

Ajuste no serviço do CRM (**Variables**). O que não estiver aqui pode ficar igual
a produção.

| Variável | Valor em dev | Por quê |
|---|---|---|
| `DATABASE_URL` | URL do `crm_dev` (seção 3) | nunca o de produção |
| `MODO_SANDBOX` | `true` | **o mais importante**: com os dados reais copiados, garante que nada feito no dev saia para fora (veja abaixo) |
| `BASE_URL` | `https://<domínio gerado>` | links de convite e nova senha apontam para o dev |
| `COOKIE_SEGURO` | `true` | o Railway entrega HTTPS |
| `TRUST_PROXY` | `true` | o CRM fica atrás do proxy do Railway; sem isso o bloqueio de tentativas de login vê o IP do proxy |

As demais (uazapi, saldo, S3, chat do site, abrir conta) podem ficar iguais a
produção: o sandbox cuida de não usar as que teriam efeito de verdade.

### O que o `MODO_SANDBOX=true` faz

O dev usa uma cópia de produção, então a tabela `canais` tem os tokens dos bots e
das instâncias reais. Sem o sandbox, responder uma conversa no dev mandaria a
mensagem ao cliente de verdade, e excluir um canal de WhatsApp apagaria a
instância no servidor uazapi que produção usa. Com o sandbox ligado:

A regra é **por canal**. O script de cópia grava no banco de dev a lista dos
canais que vieram de produção (`ajustes.sandbox_tokens_producao`); se a lista não
existir, o primeiro boot em sandbox trata tudo o que já existe como produção.

| Ação no dev | Canal copiado de produção | Canal criado no próprio dev |
|---|---|---|
| Responder WhatsApp ou Telegram | fica gravada como enviada, mas **não vai para o cliente** | vai de verdade |
| Receber mensagens do Telegram | o bot **não é ligado** no dev (produção continua recebendo) | o bot recebe normalmente |
| Excluir, desconectar, configurar webhook | some só do banco de dev; a instância real não é tocada | de verdade |
| Conectar (QR / bot) | bloqueado com aviso | de verdade |
| Abrir conta do cliente no site | bloqueado | bloqueado |
| Consultar saldo por PIN, ver anexos, chat do site | funcionam normalmente | funcionam normalmente |

Para testar Telegram de ponta a ponta no dev: crie um bot novo no @BotFather e
conecte-o em **Configurações › Canais** do dev. Para WhatsApp, crie uma instância
nova no dev com um número de testes. Nunca reconecte no dev um canal de produção.

Gere segredos novos com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`PORT` não precisa ser definida: o Railway injeta a dele e o CRM a lê.

---

## 5. Canais em dev

Com `MODO_SANDBOX=true`, os canais copiados de produção aparecem no dev, mas
ficam inertes. Canais criados no próprio dev (bot novo no @BotFather, instância
de WhatsApp com número de testes) recebem e enviam de verdade.

---

## 6. Conferir

1. Abra `https://<domínio de dev>/saude`: deve responder `{"ok":true}` e
   `https://<domínio de dev>/ambiente` deve responder `{"sandbox":true}`.
2. Entre no dev com seu login de sempre (usuários e senhas foram copiados).
3. Nos logs do serviço, a linha de boas-vindas mostra `MODO SANDBOX` e o banco em
   uso deve ser o `crm_dev`.

---

## 7. Dia a dia

1. Trabalhe num branch (por exemplo `claude/...`).
2. Faça merge no `dev` → o Railway publica em dev sozinho.
3. Teste no domínio de dev.
4. Aprovado, faça merge de `dev` em `main` → o Railway publica em produção.

---

## 8. Depois: tirar produção do banco do Manus

Produção hoje usa o TiDB que o Manus fornece (mais caro). O mesmo script migra para
um TiDB próprio, com uma pausa curta:

1. Crie o banco `crm` no TiDB Cloud próprio e anote a URL.
2. **Pare o serviço de produção no Railway** (Settings › Remove/Sleep, ou reduza as
   réplicas a zero). Assim nenhuma mensagem nova entra durante a cópia. Mensagens de
   WhatsApp e do chat do site ficam na fila de quem envia por alguns minutos; o
   Telegram guarda as mensagens não lidas e entrega quando o bot voltar.
3. Copie, mantendo os bots ligados (o CRM antigo está parado, então não há disputa):

   ```bash
   npm run copiar-banco -- --de "<URL do TiDB do Manus>" --para "<URL do TiDB próprio>/crm" --manter-telegram
   ```

4. No Railway, ambiente `production`, troque `DATABASE_URL` para a URL nova e suba o
   serviço de novo.
5. Confira `/saude`, faça login (as sessões foram copiadas, ninguém precisa entrar de
   novo) e veja em **Configurações › Canais** que os canais estão conectados.
6. Só depois cancele o banco do Manus. Os arquivos das conversas ficam no S3 e não
   dependem do banco.
