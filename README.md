# ⚡ AutoDebrid — Real-Debrid para Chrome e Edge

Extensão (Manifest V3) que converte links de hosters — 1fichier, Rapidgator, Mega, Turbobit, Katfile etc. — em links diretos de download usando sua conta do **Real-Debrid**. Funciona no Chrome, no Edge de desktop e no **Edge para Android**.

## Funcionalidades

- **Debrid automático ao clicar**: ao clicar em um link de um hoster suportado, a extensão intercepta o clique, "debrida" o link pela API do Real-Debrid e abre direto o download.
- **Badge ⚡ ao lado dos links**: todos os links de hosters suportados na página ganham um botão ⚡ — útil quando você quer debridar sem clicar no link original.
- **Suporte a mirrors**: em sites de download com link principal + vários mirrors, abra o popup da extensão para ver **todos** os links de hosters detectados na página, agrupados por hoster. O botão **"🔁 Testar mirrors"** tenta cada um em ordem e usa o primeiro que funcionar — ideal quando o link principal está fora do ar.
- **Menu de contexto** (desktop): clique com o botão direito em qualquer link → "Debridar link com Real-Debrid".
- **Cópia automática**: o link debridado é copiado para a área de transferência.
- A lista de hosters suportados é baixada da própria API do Real-Debrid e atualizada automaticamente (cache de 12h).
- Se o debrid falhar, um aviso aparece e o clique seguinte abre o link original normalmente.
- **Interface em português e inglês**: segue o idioma do navegador (pt-BR e pt-PT usam português; qualquer outro idioma usa inglês).

## Instalação

### Chrome / Edge (desktop)

1. Baixe/clon​e este repositório.
2. Abra `chrome://extensions` (ou `edge://extensions`).
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** (*Load unpacked*) e selecione a pasta do projeto.

### Edge para Android (celular)

O Edge para Android suporta extensões. Para instalar uma extensão de desenvolvedor (fora da loja):

1. Instale o **Edge Canary** pela Play Store (o canal Canary é o que permite sideload).
2. Vá em **Configurações → Sobre o Microsoft Edge** e toque **5 vezes** no número da versão para liberar as **Opções do desenvolvedor**.
3. Volte em Configurações → **Opções do desenvolvedor** → **Extension install by crx / by id**.
4. Gere o arquivo `.crx` da extensão (no Edge/Chrome desktop: `edge://extensions` → Modo do desenvolvedor → **Compactar extensão** apontando para esta pasta) e envie o `.crx` para o celular, ou hospede-o em uma URL e informe-a na opção de instalação.

> No Edge Android o "popup" da extensão abre como uma folha na parte de baixo da tela — a interface foi feita para funcionar bem nesse formato, com botões grandes para toque.

## Configuração

1. Pegue sua chave de API em **[real-debrid.com/apitoken](https://real-debrid.com/apitoken)** (é preciso estar logado; conta premium recomendada).
2. Clique no ícone da extensão e cole a chave. Ela é validada na hora e fica salva no `chrome.storage.sync` (sincroniza entre seus dispositivos com o mesmo perfil).

## Como usar em sites com link principal + mirrors

1. Abra a página de download normalmente.
2. Toque/clique no ícone da extensão.
3. O popup lista todos os links de hosters suportados encontrados na página.
4. Use **🔁 Testar mirrors** para que a extensão tente cada link em ordem até o Real-Debrid devolver um link válido — ou toque no ⚡ de um mirror específico.
5. O link direto aparece no popup com botões **Abrir/Baixar** e **Copiar link** (ele também já foi copiado automaticamente).

## Opções

| Opção | Padrão | Descrição |
|---|---|---|
| Debridar automaticamente ao clicar | ✅ | Intercepta cliques em links de hosters suportados |
| Mostrar botão ⚡ ao lado dos links | ✅ | Insere o badge nos links detectados |
| Abrir link debridado em nova aba | ✅ | Desmarque para abrir na mesma aba |

Observação: quando você já está **dentro** do site de um hoster (ex.: navegando no próprio 1fichier.com), a extensão não intercepta os cliques para não quebrar a navegação — use o badge ⚡ ou o popup nesses casos.

## Estrutura do projeto

```
manifest.json     — Manifest V3
background.js     — service worker: chamadas à API do Real-Debrid, cache de hosters, mirrors
content.js        — detecção de links, badges, interceptação de cliques, coleta p/ popup
content.css       — estilos do badge e do toast
popup/            — interface: chave de API, opções, lista de mirrors, resultado
_locales/         — textos traduzidos (en = padrão, pt_BR, pt_PT) usados via chrome.i18n
icons/            — ícones gerados
```

## Privacidade e segurança

- A chave de API só sai do seu navegador para `api.real-debrid.com` (HTTPS), e todas as chamadas são feitas pelo service worker — as páginas visitadas nunca têm acesso ao token.
- Nenhum dado é enviado a terceiros.

## Limitações conhecidas

- Links protegidos por encurtadores/protetores que o Real-Debrid não suporta precisam ser destravados antes.
- Links com senha ainda não têm campo de senha na interface (a API suporta; contribuições bem-vindas).
- O menu de contexto não existe no Edge Android (limitação da plataforma) — use o badge ⚡ ou o popup.
