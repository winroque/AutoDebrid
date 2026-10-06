# ⚡ AutoDebrid — Real-Debrid e TorBox para Chrome e Edge

Extensão (Manifest V3) que converte links de hosters — 1fichier, Rapidgator, Mega, Turbobit, Katfile etc. — em links diretos de download usando sua conta do **Real-Debrid** ou do **TorBox**. Funciona no Chrome, no Edge de desktop e no **Edge para Android**.

## Funcionalidades

- **Dois serviços de debrid**: Real-Debrid e TorBox. Escolha no popup; cada um guarda a própria chave, e dá para alternar sem redigitar.
- **Hosters habilitáveis**: o popup lista todos os hosters que o serviço suporta, com filtro e botões de habilitar/desabilitar. Hosters desligados ficam intocados (sem badge, sem interceptar clique). Sites de streaming e redes sociais que os serviços listam (YouTube, Vimeo, Twitch etc.) **começam desligados**, para não atrapalhar a navegação normal.
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

1. Escolha o serviço no popup e pegue a chave de API:
   - **Real-Debrid**: [real-debrid.com/apitoken](https://real-debrid.com/apitoken) (conta premium recomendada).
   - **TorBox**: [torbox.app/settings](https://torbox.app/settings), seção *API Key*.
2. Cole a chave. Ela é validada na hora e fica salva no `chrome.storage.sync` (sincroniza entre seus dispositivos com o mesmo perfil).

### Como o TorBox funciona aqui

O TorBox não devolve um link direto na hora: ele primeiro baixa o arquivo para os servidores dele e depois libera um link de CDN. A extensão cria o download, acompanha o progresso (um aviso na página mostra a porcentagem) e abre o link quando fica pronto, com limite de 3 minutos por link. Arquivos já em cache no TorBox ficam prontos em segundos. O TorBox limita a 25 criações de download por hora, então "Testar mirrors" com muitos links pode esbarrar nesse limite.

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
| Hosters suportados | streaming/social desligados | Lista com filtro; desligue hosters que você não quer que a extensão toque |

Observação: quando você já está **dentro** do site de um hoster (ex.: navegando no próprio 1fichier.com), a extensão não intercepta os cliques para não quebrar a navegação — use o badge ⚡ ou o popup nesses casos.

## Estrutura do projeto

```
manifest.json     — Manifest V3
background.js     — service worker: provedores (Real-Debrid, TorBox), cache de hosters, hosters desligados, mirrors
content.js        — detecção de links, badges, interceptação de cliques, coleta p/ popup
content.css       — estilos do badge e do toast
popup/            — interface: chave de API, opções, lista de mirrors, resultado
_locales/         — textos traduzidos (en = padrão, pt_BR, pt_PT) usados via chrome.i18n
icons/            — ícones gerados
```

## Privacidade e segurança

- A chave de API só sai do seu navegador para `api.real-debrid.com` ou `api.torbox.app` (HTTPS), e todas as chamadas são feitas pelo service worker — as páginas visitadas nunca têm acesso ao token.
- Nenhum dado é enviado a terceiros.

## Limitações conhecidas

- Links protegidos por encurtadores/protetores que o Real-Debrid não suporta precisam ser destravados antes.
- Links com senha ainda não têm campo de senha na interface (a API suporta; contribuições bem-vindas).
- O menu de contexto não existe no Edge Android (limitação da plataforma) — use o badge ⚡ ou o popup.
- A integração com o TorBox foi implementada a partir do SDK oficial e da documentação da API, e testada contra uma simulação da API; se algo divergir do serviço real, abra uma issue com a mensagem de erro.
