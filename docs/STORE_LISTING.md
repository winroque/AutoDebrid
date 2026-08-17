# Textos prontos para as fichas das lojas

Material para copiar e colar no Chrome Web Store Developer Dashboard e no Partner Center (Edge Add-ons).

---

## Nome / Name

- PT: **AutoDebrid — para Real-Debrid (não oficial)**
- EN: **AutoDebrid — for Real-Debrid (unofficial)**

> Manter "não oficial / unofficial" reduz risco de rejeição por marca registrada.

## Resumo curto / Short summary (máx. 132 caracteres no Chrome)

- PT: `Converta links de hosters em downloads diretos com sua conta premium do Real-Debrid. Suporta sites com vários mirrors.`
- EN: `Turn file-hoster links into direct downloads with your Real-Debrid premium account. Supports pages with multiple mirrors.`

## Descrição completa / Full description

### PT

```
O AutoDebrid conecta sua conta premium do Real-Debrid ao navegador para gerar
links diretos de download a partir de links de hosters suportados (1fichier,
Rapidgator, Turbobit e dezenas de outros).

RECURSOS
• Debrid automático: clique em um link suportado e o download direto abre na hora
• Badge ⚡ ao lado de cada link suportado detectado na página
• Suporte a mirrors: o popup lista todos os links de hosters da página e testa
  um por um até encontrar um que funcione
• Menu de contexto no desktop: botão direito → "Debridar link"
• Link convertido copiado automaticamente para a área de transferência
• Lista de hosters suportados sempre atualizada (baixada da API do Real-Debrid)

PRIVACIDADE
Sem telemetria, sem anúncios, sem servidores próprios. Sua chave de API fica no
armazenamento do navegador e só é enviada para api.real-debrid.com via HTTPS.

REQUISITOS
Conta do Real-Debrid (premium recomendada) e sua chave de API, disponível em
real-debrid.com/apitoken.

Esta extensão não é afiliada ao Real-Debrid. Use apenas para baixar conteúdo
que você tem o direito de acessar.
```

### EN

```
AutoDebrid connects your Real-Debrid premium account to the browser to generate
direct download links from supported file-hoster links (1fichier, Rapidgator,
Turbobit and dozens more).

FEATURES
• Automatic debrid: click a supported link and the direct download opens instantly
• ⚡ badge next to every supported link detected on the page
• Mirror support: the popup lists all hoster links on the page and tries them
  one by one until one works
• Desktop context menu: right click → "Unrestrict link"
• Converted link automatically copied to the clipboard
• Supported-hoster list always up to date (fetched from the Real-Debrid API)

PRIVACY
No telemetry, no ads, no third-party servers. Your API key stays in browser
storage and is only sent to api.real-debrid.com over HTTPS.

REQUIREMENTS
A Real-Debrid account (premium recommended) and your API key, available at
real-debrid.com/apitoken.

This extension is not affiliated with Real-Debrid. Only download content you
have the right to access.
```

## Categoria / Category

- Chrome: **Productivity** (ou Workflow & Planning)
- Edge: **Productivity**

## Propósito único / Single purpose (aba de privacidade do Chrome)

```
Convert file-hoster download links on web pages into direct download links
using the user's own Real-Debrid account.
```

## Justificativas de permissões / Permission justifications

| Permissão | Justificativa (EN, pronta para colar) |
|---|---|
| `storage` | Stores the user's Real-Debrid API key and the extension's settings locally in browser storage. Nothing is stored on external servers. |
| `clipboardWrite` | Copies the generated direct-download link to the clipboard so the user can paste it into a download manager. Only used after an explicit user action. |
| `contextMenus` | Adds a "Unrestrict link" item to the right-click menu of links, as an alternative way to trigger the extension's single purpose. |
| `https://api.real-debrid.com/*` | The extension's core function: calling the official Real-Debrid API to convert a link and to fetch the list of supported hosters. |
| `<all_urls>` (host + content script) | The extension must scan link URLs on any page the user visits to detect links pointing to supported file hosters, because download links appear on arbitrary websites (forums, blogs, link-protector pages). Only link URLs are read, locally; no page content ever leaves the browser. A link is sent to the Real-Debrid API only when the user explicitly asks to convert it. |

## Uso de código remoto / Remote code

`No, I am not using remote code` — todo o código executável está no pacote. (A extensão apenas consome uma API REST que retorna JSON.)

## Declaração de dados / Data usage (Chrome "data collected")

- Marcar apenas: **Authentication information** (a chave de API do usuário, armazenada localmente e enviada só ao Real-Debrid).
- Certificar: não vende dados, não usa para fins alheios ao propósito único, não usa para crédito/empréstimo.

## URL da política de privacidade / Privacy policy URL

Depois de ativar o GitHub Pages do repositório (Settings → Pages → branch `main`, pasta `/docs`):

```
https://winroque.github.io/AutoDebrid/privacy-policy.html
```

## Notas para os revisores / Notes to certification testers

```
Testing requires a (free or premium) Real-Debrid account API key from
https://real-debrid.com/apitoken. Steps:
1. Click the extension icon, paste the API key, press "Salvar e validar".
2. Open any page containing a link to a supported hoster
   (e.g. a 1fichier.com or rapidgator.net file URL).
3. A ⚡ badge appears next to the link; clicking the link or the badge converts
   it via the Real-Debrid API and opens the direct download.
4. The popup lists all supported links found on the page ("mirrors") and can
   try them in order.
The extension performs no background activity without user action beyond
fetching the public list of supported hoster domains (cached 12h).
```

## Capturas de tela / Screenshots

- Chrome: 1280×800 (ou 640×400), PNG, 1 a 5 imagens.
- Edge: 1280×800 recomendado.
- Sugestões: popup com a lista de mirrors; página com badges ⚡; tela de configuração da chave; resultado com "Link pronto".
