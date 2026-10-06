// AutoDebrid — service worker
// Centraliza todas as chamadas às APIs de debrid (Real-Debrid, TorBox) para que
// as chaves nunca precisem ser expostas às páginas visitadas.

const HOSTERS_TTL_MS = 12 * 60 * 60 * 1000; // 12h de cache da lista de hosters

// Textos traduzidos ficam em _locales/<idioma>/messages.json.
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

// Domínios que os serviços listam como "hosters" mas que são sites de
// streaming/social: interceptar cliques neles atrapalha a navegação normal.
// Ficam desabilitados até o usuário ligar no popup.
const DEFAULT_DISABLED = [
  'youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com',
  'vimeo.com', 'dailymotion.com', 'dai.ly', 'soundcloud.com', 'twitch.tv',
  'facebook.com', 'fb.watch', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com',
  'reddit.com', 'redd.it', 'pinterest.com', 'vk.com',
];

// ---- Configuração ----

const PROVIDER_KEYS = { realdebrid: 'apiToken', torbox: 'torboxToken' };

async function getConfig() {
  const items = await chrome.storage.sync.get(['provider', 'apiToken', 'torboxToken', 'disabledHosts', 'hosterDefaultsApplied']);
  const provider = PROVIDERS[items.provider] ? items.provider : 'realdebrid';
  return {
    provider,
    token: (items[PROVIDER_KEYS[provider]] || '').trim(),
    disabledHosts: Array.isArray(items.disabledHosts) ? items.disabledHosts : [],
    // Por serviço: se os padrões (streaming/social desligados) já foram aplicados.
    defaultsApplied: items.hosterDefaultsApplied && typeof items.hosterDefaultsApplied === 'object' ? items.hosterDefaultsApplied : {},
  };
}

function fatalError(message, extra = {}) {
  const err = new Error(message);
  Object.assign(err, extra);
  return err;
}

// ---- Real-Debrid ----

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';
const RD_FATAL_CODES = new Set([8, 9, 14, 34]); // token/conta: afeta todos os mirrors

function rdFriendlyError(data, status) {
  if (data && typeof data.error_code === 'number') {
    const msg = chrome.i18n.getMessage('rdErr' + data.error_code);
    if (msg) return msg;
  }
  if (data && data.error) return t('errRdPrefix', [String(data.error)]);
  return t('errHttp', [String(status)]);
}

async function rdFetch(token, path, { method = 'GET', body = null } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
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
    const code = data && data.error_code;
    throw fatalError(rdFriendlyError(data, res.status), { code, fatal: RD_FATAL_CODES.has(code) });
  }
  return data;
}

const realdebrid = {
  id: 'realdebrid',
  name: 'Real-Debrid',
  keyUrl: 'https://real-debrid.com/apitoken',

  async validate(token) {
    const u = await rdFetch(token, '/user');
    const premium = u.type === 'premium';
    return {
      username: u.username,
      premium,
      plan: premium ? 'premium' : 'free',
      daysLeft: premium && u.premium ? Math.floor(u.premium / 86400) : null,
    };
  },

  // A lista pública de domínios não exige token.
  async hosters(token) {
    const domains = await rdFetch(token, '/hosts/domains');
    if (!Array.isArray(domains)) return [];
    return domains.map((d) => ({ label: d, domains: [d], type: 'hoster' }));
  },

  async unrestrict(token, link, password) {
    const body = { link };
    if (password) body.password = password;
    const data = await rdFetch(token, '/unrestrict/link', { method: 'POST', body });
    return {
      download: data.download,
      filename: data.filename,
      filesize: data.filesize,
      host: data.host,
      streamable: data.streamable,
    };
  },
};

// ---- TorBox ----
// O TorBox baixa o arquivo para os servidores dele primeiro ("web download") e
// só então libera um link de CDN; por isso o fluxo é criar → aguardar → pedir link.

const TB_BASE = 'https://api.torbox.app/v1/api';
const TB_FATAL = new Set(['BAD_TOKEN', 'NO_AUTH', 'AUTH_ERROR', 'MONTHLY_LIMIT', 'COOLDOWN_LIMIT', 'ACTIVE_LIMIT']);
const TB_POLL_MS = 2500;
const TB_TIMEOUT_MS = 3 * 60 * 1000;
const TB_PLANS = { 0: 'free', 1: 'essential', 2: 'pro', 3: 'standard' };

async function tbFetch(token, path, { method = 'GET', form = null } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers };
  if (form) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) if (v != null && v !== '') fd.append(k, v);
    opts.body = fd;
  }
  const res = await fetch(TB_BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
  if (!res.ok || !data || data.success === false) {
    const code = data && data.error;
    const detail = (data && data.detail) || (code ? String(code) : t('errHttp', [String(res.status)]));
    throw fatalError(t('errTbPrefix', [detail]), { code, fatal: res.status === 403 || TB_FATAL.has(code) });
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const torbox = {
  id: 'torbox',
  name: 'TorBox',
  keyUrl: 'https://torbox.app/settings',

  async validate(token) {
    const { data: u } = await tbFetch(token, '/user/me?settings=false');
    const plan = TB_PLANS[u.plan] || 'free';
    let daysLeft = null;
    if (u.premium_expires_at) {
      const ms = Date.parse(u.premium_expires_at) - Date.now();
      if (!Number.isNaN(ms)) daysLeft = Math.max(0, Math.floor(ms / 86400000));
    }
    return { username: u.email || String(u.id || ''), premium: plan !== 'free', plan, daysLeft };
  },

  async hosters(token) {
    const { data } = await tbFetch(token, '/webdl/hosters');
    if (!Array.isArray(data)) return [];
    return data
      .map((h) => {
        const domains = (h.domains || h.domais || h.domaisn || [])
          .map((d) => String(d).toLowerCase().replace(/^www\./, ''))
          .filter(Boolean);
        return {
          label: h.name || domains[0] || '',
          domains,
          type: h.type === 'stream' ? 'stream' : 'hoster',
          up: h.status !== false,
          note: h.note || '',
        };
      })
      .filter((h) => h.domains.length);
  },

  async unrestrict(token, link, password, onProgress) {
    const created = await tbFetch(token, '/webdl/createwebdownload', { method: 'POST', form: { link, password } });
    const id = created.data && created.data.webdownload_id;
    if (id == null) throw fatalError(t('errTbPrefix', [created.detail || 'no id']));

    const deadline = Date.now() + TB_TIMEOUT_MS;
    let item = null;
    while (Date.now() < deadline) {
      const { data } = await tbFetch(token, `/webdl/mylist?id=${encodeURIComponent(id)}&bypass_cache=true`);
      item = Array.isArray(data) ? data[0] : data;
      if (!item) throw fatalError(t('errTbPrefix', ['ITEM_NOT_FOUND']));
      const state = String(item.download_state || '').toLowerCase();
      if (item.error || /fail|error/.test(state)) {
        throw fatalError(t('errTbPrefix', [item.error || state || 'failed']));
      }
      if (item.download_present && Array.isArray(item.files) && item.files.length) break;
      if (onProgress) onProgress(Math.round((item.progress || 0) * 100), state);
      await sleep(TB_POLL_MS);
    }
    if (!item || !item.download_present || !item.files || !item.files.length) {
      throw fatalError(t('errTbTimeout'));
    }

    const files = item.files;
    const biggest = files.reduce((a, b) => ((b.size || 0) > (a.size || 0) ? b : a), files[0]);
    const q = new URLSearchParams({ token, web_id: String(item.id != null ? item.id : id) });
    if (files.length > 1) q.set('zip_link', 'true');
    else q.set('file_id', String(biggest.id));
    const dl = await tbFetch(token, '/webdl/requestdl?' + q.toString());
    const download = typeof dl.data === 'string' ? dl.data : (dl.data && dl.data.url);
    if (!download) throw fatalError(t('errTbPrefix', ['no link']));

    let host = '';
    try { host = new URL(link).hostname.replace(/^www\./, ''); } catch { /* ignora */ }
    return {
      download,
      filename: files.length > 1 ? (item.name || '') + '.zip' : (biggest.short_name || biggest.name || item.name),
      filesize: files.length > 1 ? item.size : biggest.size,
      host,
      streamable: 0,
    };
  },
};

const PROVIDERS = { realdebrid, torbox };

// ---- Hosters (com cache por provedor) ----

async function loadHosters(provider, token, force = false) {
  const cacheKey = 'hostersCache_' + provider.id;
  const { [cacheKey]: cache } = await chrome.storage.local.get(cacheKey);
  const cacheOk = cache && Array.isArray(cache.hosters);
  if (!force && cacheOk && Date.now() - cache.fetchedAt < HOSTERS_TTL_MS) return cache.hosters;
  try {
    const hosters = await provider.hosters(token);
    if (hosters.length) {
      await chrome.storage.local.set({ [cacheKey]: { hosters, fetchedAt: Date.now() } });
      return hosters;
    }
  } catch (e) {
    // Sem rede/API fora: usa o cache velho se existir.
    if (cacheOk) return cache.hosters;
    throw e;
  }
  return cacheOk ? cache.hosters : [];
}

// Retorna a lista completa de hosters com o estado (habilitado/desabilitado)
// e a lista achatada de domínios efetivamente ativos.
async function getHosterState(force = false) {
  const cfg = await getConfig();
  const provider = PROVIDERS[cfg.provider];
  const hosters = await loadHosters(provider, cfg.token, force);

  const disabled = new Set(cfg.disabledHosts);
  if (!cfg.defaultsApplied[provider.id] && hosters.length) {
    // Primeira vez com este serviço: streaming/social começam desligados.
    // Só desliga o que o serviço realmente lista, para não poluir a lista salva.
    const known = new Set();
    for (const h of hosters) for (const d of h.domains) known.add(d);
    for (const d of DEFAULT_DISABLED) if (known.has(d)) disabled.add(d);
    for (const h of hosters) if (h.type === 'stream') for (const d of h.domains) disabled.add(d);
    await chrome.storage.sync.set({
      disabledHosts: [...disabled],
      hosterDefaultsApplied: { ...cfg.defaultsApplied, [provider.id]: true },
    });
  }

  const list = hosters.map((h) => ({
    ...h,
    enabled: !h.domains.every((d) => disabled.has(d)),
  }));
  const domains = [];
  for (const h of list) for (const d of h.domains) if (!disabled.has(d)) domains.push(d);

  return {
    provider: provider.id,
    providerName: provider.name,
    hasToken: !!cfg.token,
    hosters: list,
    domains,
  };
}

async function setHosterEnabled(domains, enabled) {
  const state = await getHosterState();
  const disabled = new Set();
  for (const h of state.hosters) if (!h.enabled) for (const d of h.domains) disabled.add(d);
  for (const d of domains) { if (enabled) disabled.delete(d); else disabled.add(d); }
  await chrome.storage.sync.set({ disabledHosts: [...disabled] });
}

// ---- Unrestrict ----

async function unrestrict(link, password = '', onProgress = null) {
  const cfg = await getConfig();
  const provider = PROVIDERS[cfg.provider];
  if (!cfg.token) throw fatalError(t('errNoToken', [provider.name]), { fatal: true });
  const result = await provider.unrestrict(cfg.token, link, password, onProgress);
  return { ...result, original: link, provider: provider.id };
}

// Tenta uma lista de mirrors em ordem e retorna o primeiro que funcionar.
async function unrestrictFirst(links, onProgress = null) {
  const attempts = [];
  for (const link of links) {
    try {
      const result = await unrestrict(link, '', onProgress);
      return { result, attempts };
    } catch (e) {
      attempts.push({ link, error: e.message });
      // Erros de conta/token afetam todos os mirrors: não adianta continuar.
      if (e.fatal) throw fatalError(e.message);
    }
  }
  const err = new Error(t('errNoMirror'));
  err.attempts = attempts;
  throw err;
}

// ---- Roteador de mensagens ----

function progressToTab(sender) {
  if (!sender || !sender.tab || sender.tab.id == null) return null;
  const tabId = sender.tab.id;
  let last = -1;
  return (percent) => {
    if (percent === last) return;
    last = percent;
    chrome.tabs.sendMessage(tabId, { type: 'showToast', text: t('toastTbProgress', [String(percent)]), kind: 'info' })
      .catch(() => {});
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    async getDomains() {
      const s = await getHosterState();
      return { domains: s.domains, hasToken: s.hasToken, provider: s.provider };
    },
    async getHosters() {
      return await getHosterState(!!msg.force);
    },
    async setHosterEnabled() {
      await setHosterEnabled(msg.domains || [], !!msg.enabled);
      return await getHosterState();
    },
    async setAllHosters() {
      const s = await getHosterState();
      const all = [];
      for (const h of s.hosters) all.push(...h.domains);
      await setHosterEnabled(all, !!msg.enabled);
      return await getHosterState();
    },
    async unrestrict() {
      return { result: await unrestrict(msg.link, msg.password, progressToTab(sender)) };
    },
    async unrestrictFirst() {
      return await unrestrictFirst(msg.links, progressToTab(sender));
    },
    async validateToken() {
      const provider = PROVIDERS[msg.provider] || PROVIDERS.realdebrid;
      const user = await provider.validate((msg.token || '').trim());
      return { user: { ...user, provider: provider.id, providerName: provider.name } };
    },
    async getProviders() {
      const cfg = await getConfig();
      const items = await chrome.storage.sync.get(Object.values(PROVIDER_KEYS));
      return {
        current: cfg.provider,
        providers: Object.values(PROVIDERS).map((p) => ({
          id: p.id, name: p.name, keyUrl: p.keyUrl,
          hasToken: !!(items[PROVIDER_KEYS[p.id]] || '').trim(),
        })),
      };
    },
    async setProvider() {
      if (!PROVIDERS[msg.provider]) throw new Error('unknown provider');
      await chrome.storage.sync.set({ provider: msg.provider });
      return await getHosterState();
    },
    async saveToken() {
      const provider = PROVIDERS[msg.provider];
      if (!provider) throw new Error('unknown provider');
      await chrome.storage.sync.set({ [PROVIDER_KEYS[provider.id]]: (msg.token || '').trim(), provider: provider.id });
      return {};
    },
    async refreshDomains() {
      const s = await getHosterState(true);
      return { domains: s.domains };
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
    const progress = tab && tab.id != null ? progressToTab({ tab }) : null;
    try {
      const { download } = await unrestrict(info.linkUrl, '', progress);
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
