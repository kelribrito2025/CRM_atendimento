# Chat do site — guia para a pessoa que cuida da dashboard

Este é o chat que o cliente usa dentro do painel dele (estilo Intercom). O que ele
escrever cai na mesma caixa de entrada do CRM de atendimento, junto com WhatsApp e
Telegram, e a resposta do atendente volta para o chat em poucos segundos.

Do lado do site, o trabalho é pequeno: **duas linhas no HTML e uma assinatura gerada
no servidor**. Nenhum dado de cliente é gravado no site, e nenhuma chave do CRM
aparece no navegador.

Onde `https://SEU-CRM` aparecer abaixo, troque pelo endereço do CRM de atendimento.

---

## 1. Colocar o chat na página (front-end)

Na página da dashboard — **só nas páginas em que a pessoa já está logada**:

```html
<script src="https://SEU-CRM/widget.js" defer></script>
<script>
  window.addEventListener('load', () => {
    ChatAtendimento.identificar({
      id: '12345',                    // id do usuário no SEU sistema (obrigatório, sempre o mesmo para a mesma pessoa)
      nome: 'Carla Menezes',
      email: 'carla@empresa.com.br',
      empresa: 'Loja Aurora',         // opcional
      pin: '5446',                    // opcional: o PIN do cliente, se vocês já têm
      assinatura: 'ab12…'             // gerada no servidor (item 2)
    });
  });
</script>
```

Isso já desenha o botão redondo no canto inferior direito e o quadro da conversa.

Dá para mudar a cor e o título do botão pelo próprio `<script>`:

```html
<script src="https://SEU-CRM/widget.js" data-cor="#12B85C" data-titulo="Fale com a gente" defer></script>
```

### Comandos disponíveis

| Comando | Para que serve |
| --- | --- |
| `ChatAtendimento.identificar({...})` | Diz quem está logado. Chame uma vez, depois do login. |
| `ChatAtendimento.abrir()` | Abre o chat (útil em um link "Preciso de ajuda"). |
| `ChatAtendimento.fechar()` | Fecha o quadro. |
| `ChatAtendimento.alternar()` | Abre se estiver fechado, fecha se estiver aberto. |
| `ChatAtendimento.sair()` | **Chame no logout.** Encerra a conversa naquele navegador. |

> Importante: chame `ChatAtendimento.sair()` quando a pessoa sair da conta. Sem isso,
> em um computador compartilhado a próxima pessoa veria a conversa anterior.

---

## 2. Gerar a assinatura (back-end — sem ela o chat não abre)

A assinatura impede que alguém abra o console do navegador, troque o `id` e leia a
conversa de outro cliente. É um HMAC-SHA256 do id do usuário, com um segredo que só os
dois servidores conhecem (no CRM ele fica na variável `WIDGET_SEGREDO`).

**A assinatura é calculada no servidor de vocês, a cada carregamento da página. O
segredo nunca vai para o navegador.**

Node.js:

```js
const crypto = require('node:crypto');
const assinatura = crypto.createHmac('sha256', process.env.CHAT_SEGREDO)
  .update(String(usuario.id))
  .digest('hex');
```

PHP:

```php
$assinatura = hash_hmac('sha256', (string) $usuario->id, getenv('CHAT_SEGREDO'));
```

Python:

```python
import hmac, hashlib, os
assinatura = hmac.new(os.environ['CHAT_SEGREDO'].encode(), str(usuario.id).encode(), hashlib.sha256).hexdigest()
```

O valor entra no `identificar()` junto com o `id`. Se a assinatura não combinar com o
id, o CRM responde `401` e o chat não abre.

O CRM também responde `401` quando o `WIDGET_SEGREDO` não está configurado no
servidor dele: sem o segredo, o chat fica desligado em vez de aceitar qualquer
pessoa. Não existe modo "sem assinatura".

---

## 3. O que o CRM expõe

Três endereços públicos, e só estes:

| Endereço | Para que serve |
| --- | --- |
| `GET /widget.js` | O arquivo que o site inclui. |
| `GET /widget` | A página que roda dentro do quadro (iframe). |
| `POST /widget/sessao` | Recebe `id`, `nome`, `email`, `empresa`, `pin`, `assinatura` e devolve a chave da conversa. |

As mensagens (`/widget/mensagens`), os anexos (`/widget/anexos`) e os arquivos
(`/widget/midia/:id`) só respondem com a chave da conversa no cabeçalho
`x-widget-token`, e cada chave enxerga **apenas** a conversa daquele cliente. As notas
internas da equipe nunca saem para o chat do cliente.

---

## 4. Anexos (foto, PDF, comprovante)

**Não há nada para implementar do lado de vocês.** O clipe já vem no chat.

O caminho do arquivo é este:

```
navegador do cliente  ->  servidor do CRM  ->  bucket S3 do CRM (privado)
```

O arquivo não passa pelo servidor de vocês, não é gravado no site e o endereço do
bucket nunca aparece no navegador: para mostrar a imagem, o chat pede o arquivo ao
CRM usando a chave daquela conversa. Uma chave só abre os arquivos da própria
conversa.

O que vale saber:

- **Limite de 20 MB** por arquivo. Acima disso o cliente recebe um aviso no chat.
- **Qualquer formato** (imagem, PDF, planilha, áudio). Imagem aparece na hora dentro
  do balão; o resto vira um link com o nome do arquivo.
- Se a dashboard de vocês usar **Content-Security-Policy**, o chat já precisa de
  `frame-src` e `connect-src` liberados para o endereço do CRM — é a mesma liberação
  que as mensagens de texto usam, o anexo não pede nada novo.
- No CRM o anexo chega como qualquer outra mensagem, e o atendente também pode
  responder com arquivo.

---

## 5. Como testar antes de publicar

1. Abra a dashboard logado e confira se o botão redondo aparece.
2. Escreva uma mensagem. Ela deve aparecer na hora, em verde, do lado direito.
3. Abra o CRM de atendimento: a conversa aparece na caixa de entrada com o selo
   **Chat do site**.
4. Responda pelo CRM. Em poucos segundos a resposta aparece no chat do cliente; se o
   quadro estiver fechado, o botão ganha um contador vermelho.
5. Recarregue a página da dashboard: a conversa continua de onde parou.
6. Faça logout e confira que a conversa não aparece mais (é o `sair()`).

---

## Perguntas que costumam aparecer

**Precisa criar tabela ou guardar algo no nosso banco?** Não. A conversa fica no CRM.

**O chat funciona no celular?** Sim. Em telas estreitas o quadro se ajusta à largura
da tela.

**E se o cliente abrir a dashboard em dois navegadores?** Cada navegador recebe a sua
chave e os dois veem a mesma conversa.

**O chat aparece para quem não está logado?** Só se vocês chamarem o `identificar()`
fora da área logada. O recomendado é carregar o script apenas nas páginas logadas.

**Onde ficam as imagens e os arquivos?** No S3 privado do CRM, junto com os anexos do
WhatsApp e do Telegram. O site de vocês não guarda nada e não precisa de credencial
nenhuma do bucket (veja o item 4).
