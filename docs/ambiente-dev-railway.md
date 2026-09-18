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
`canais` guarda os tokens dos bots do Telegram e das instâncias do uazapi. Se dev
subir com uma cópia do banco de produção, ele passa a **buscar as mensagens do
Telegram junto com produção** (os dois disputam o `getUpdates` do mesmo bot e as
mensagens se dividem entre eles). Por isso dev começa com banco **vazio**.

Duas opções:

**Opção A — MySQL do próprio Railway (mais simples)**

1. No ambiente `dev`: **+ New › Database › MySQL**.
2. No serviço do CRM, variável `DATABASE_URL` com o valor:

   ```
   ${{MySQL.MYSQL_URL}}?ssl=false
   ```

   O `?ssl=false` é necessário: o CRM liga TLS para qualquer host que não seja
   local, e o MySQL interno do Railway (`mysql.railway.internal`) não usa TLS.

**Opção B — segundo banco no mesmo TiDB de produção**

Crie um banco `crm_dev` no cluster e use a mesma URL trocando só o nome do banco no
final (`.../crm_dev`). Mesmo cluster, dados separados.

No primeiro acesso o CRM cria as tabelas e o usuário administrador sozinho
(`ADMIN_EMAIL` / `ADMIN_SENHA`).

---

## 4. Variáveis do ambiente `dev`

Ajuste no serviço do CRM (**Variables**). O que não estiver aqui pode ficar igual
a produção.

| Variável | Valor em dev | Por quê |
|---|---|---|
| `DATABASE_URL` | banco de dev (seção 3) | nunca o de produção |
| `BASE_URL` | `https://<domínio gerado>` | links de convite, nova senha e webhook do WhatsApp |
| `COOKIE_SEGURO` | `true` | o Railway entrega HTTPS |
| `TRUST_PROXY` | `true` | o CRM fica atrás do proxy do Railway; sem isso o bloqueio de tentativas de login vê o IP do proxy |
| `ADMIN_SENHA` | uma senha própria de dev | o admin é criado no primeiro acesso |
| `DADOS_EXEMPLO` | `true` (opcional) | conversas de exemplo para testar sem cliente real |
| `UAZAPI_URL` / `UAZAPI_ADMIN_TOKEN` | em branco, ou um servidor uazapi só de testes | evita que dev crie ou reconfigure instâncias de WhatsApp de produção |
| `SALDO_TOKEN` | em branco | dev não deve consultar saldo de clientes reais |
| `ABRIR_CONTA_TOKEN` | em branco | dev não deve abrir contas reais |
| `S3_PREFIXO` | `chat-app-numeros-dev` | arquivos de teste não se misturam com os de produção (as chaves S3 podem ser as mesmas) |
| `WIDGET_SEGREDO` | um segredo novo | o chat do site de produção não deve aceitar dev, nem o contrário |
| `WIDGET_EQUIPE_ID` | em branco | os ids de equipe do banco de dev são outros |

Gere segredos novos com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`PORT` não precisa ser definida: o Railway injeta a dele e o CRM a lê.

---

## 5. Canais em dev

- **Telegram:** crie um bot separado no @BotFather só para dev. Nunca conecte em dev
  um bot que está conectado em produção.
- **WhatsApp (uazapi):** só com uma instância de testes. Um número em uso pela
  equipe não deve ser conectado em dev.
- **Chat do site:** aponte um site de homologação para o domínio de dev com o
  `WIDGET_SEGREDO` de dev.

---

## 6. Conferir

1. Abra `https://<domínio de dev>/saude`: deve responder `{"ok":true}`.
2. Entre com o admin de dev e confira em **Configurações › Canais** que não há
   nenhum canal de produção listado.
3. Nos logs do serviço, a linha de boas-vindas mostra o banco em uso: deve ser o de
   dev.

---

## 7. Dia a dia

1. Trabalhe num branch (por exemplo `claude/...`).
2. Faça merge no `dev` → o Railway publica em dev sozinho.
3. Teste no domínio de dev.
4. Aprovado, faça merge de `dev` em `main` → o Railway publica em produção.
