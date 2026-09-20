// AutoDebrid — service worker
// Centraliza todas as chamadas à API do Real-Debrid para que o token
// nunca precise ser exposto às páginas visitadas.

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';
const DOMAINS_TTL_MS = 12 * 60 * 60 * 1000; // 12h de cache da lista de hosters

// Textos traduzidos ficam em _locales/<idioma>/messages.json.
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

// Mensagens amigáveis para os códigos de erro mais comuns da API (chaves rdErr<código>).
function friendlyError(data, status) {
  if (data && typeof data.error_code === 'number') {
    const msg = chrome.i18n.getMessage('rdErr' + data.error_code);
    if (msg) return msg;
  }
  if (data && data.error) return t('errRdPrefix', [String(data.error)]);
  return t('errHttp', [String(status)]);
}

async function getToken() {
  const { apiToken } = await chrome.storage.sync.get('apiToken');
  return (apiToken || '').trim();
}

async function rdFetch(path, { method = 'GET', body = null, token = null } = {}) {
  const auth = token !== null ? token : await getToken();
  const headers = {};
  if (auth) headers['Authorization'] = 'Bearer ' + auth;
  const opts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(RD_BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* respostas vazias (204) */ }
  if (!res.ok) {
    const err = new Error(friendlyError(data, res.status));
    err.code = data && data.error_code;
    throw err;
  }
  return data;
}

// ---- Lista de domínios suportados (com cache) ----

async function getSupportedDomains(force = false) {
  const { domainsCache } = await chrome.storage.local.get('domainsCache');
  if (!force && domainsCache && Array.isArray(domainsCache.domains) &&
      Date.now() - domainsCache.fetchedAt < DOMAINS_TTL_MS) {
    return domainsCache.domains;
  }
  try {
    const domains = await rdFetch('/hosts/domains');
    if (Array.isArray(domains) && domains.length) {
      await chrome.storage.local.set({ domainsCache: { domains, fetchedAt: Date.now() } });
      return domains;
    }
  } catch (e) {
    // Sem rede/API fora: usa o cache velho se existir.
    if (domainsCache && Array.isArray(domainsCache.domains)) return domainsCache.domains;
    throw e;
  }
  return domainsCache ? domainsCache.domains : [];
}

// ---- Unrestrict ----

async function unrestrict(link, password = '') {
  const token = await getToken();
  if (!token) throw new Error(t('errNoToken'));
  const body = { link };
  if (password) body.password = password;
  const data = await rdFetch('/unrestrict/link', { method: 'POST', body });
  return {
    download: data.download,
    filename: data.filename,
    filesize: data.filesize,
    host: data.host,
    streamable: data.streamable,
    original: link,
  };
}

// Tenta uma lista de mirrors em ordem e retorna o primeiro que funcionar.
async function unrestrictFirst(links) {
  const attempts = [];
  for (const link of links) {
    try {
      const result = await unrestrict(link);
      return { result, attempts };
    } catch (e) {
      attempts.push({ link, error: e.message });
      // Erros de conta/token afetam todos os mirrors: não adianta continuar.
      if (e.code === 8 || e.code === 9 || e.code === 14 || e.code === 34) {
        throw new Error(e.message);
      }
    }
  }
  const err = new Error(t('errNoMirror'));
  err.attempts = attempts;
  throw err;
}

// ---- Roteador de mensagens ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    async getDomains() {
      return { domains: await getSupportedDomains() };
    },
    async unrestrict() {
      return { result: await unrestrict(msg.link, msg.password) };
    },
    async unrestrictFirst() {
      return await unrestrictFirst(msg.links);
    },
    async validateToken() {
      const user = await rdFetch('/user', { token: msg.token });
      return { user };
    },
    async refreshDomains() {
      return { domains: await getSupportedDomains(true) };
    },
  };

  const handler = handlers[msg.type];
  if (!handler) return false;

  handler()
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((e) => sendResponse({ ok: false, error: e.message, attempts: e.attempts }));
  return true; // resposta assíncrona
});

// ---- Menu de contexto (desktop; ignorado silenciosamente no mobile) ----

const MENU_ID = 'autodebrid-unrestrict';

chrome.runtime.onInstalled.addListener(() => {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.create({
    id: MENU_ID,
    title: t('menuUnrestrict'),
    contexts: ['link'],
  });
});

if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
    try {
      const { download } = await unrestrict(info.linkUrl);
      chrome.tabs.create({ url: download, index: tab ? tab.index + 1 : undefined });
    } catch (e) {
      // Sem UI própria aqui: informa o erro pelo content script da aba, se possível.
      if (tab && tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: 'showToast', text: '⚡ AutoDebrid: ' + e.message, kind: 'error' })
          .catch(() => {});
      }
    }
  });
}
