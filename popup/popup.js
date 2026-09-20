// AutoDebrid — popup
// Configura a chave de API, expõe as opções e lista os links/mirrors
// detectados na página ativa, permitindo testá-los um a um.

const $ = (sel) => document.querySelector(sel);

// Textos traduzidos ficam em _locales/<idioma>/messages.json.
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

// Aplica as traduções aos elementos estáticos do HTML (data-i18n, data-i18n-title, data-i18n-placeholder).
function localizeDocument() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
}

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: t('errNoResponse') });
    });
  });
}

function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: t('errNoResponse') });
    });
  });
}

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + units[i];
}

// ---------- telas ----------

function showSetup() {
  $('#setup').classList.remove('hidden');
  $('#main').classList.add('hidden');
  $('#account-badge').classList.add('hidden');
}

function showMain() {
  $('#setup').classList.add('hidden');
  $('#main').classList.remove('hidden');
}

// ---------- chave de API ----------

async function saveToken() {
  const token = $('#token-input').value.trim();
  const statusEl = $('#setup-status');
  if (!token) {
    setStatus(statusEl, t('setupEmpty'), 'error');
    return;
  }
  setStatus(statusEl, t('validating'));
  const res = await send({ type: 'validateToken', token });
  if (!res.ok) {
    setStatus(statusEl, res.error, 'error');
    return;
  }
  await chrome.storage.sync.set({ apiToken: token });
  setStatus(statusEl, t('tokenValid', [res.user.username]), 'success');
  showAccount(res.user);
  showMain();
  loadPageLinks();
}

function showAccount(user) {
  const badge = $('#account-badge');
  const premium = user.type === 'premium';
  const days = user.premium ? Math.floor(user.premium / 86400) : 0;
  badge.textContent = premium
    ? t('accountPremium', [user.username, String(days)])
    : t('accountFree', [user.username]);
  badge.classList.remove('hidden');
}

// ---------- opções ----------

const OPTS = [
  ['#opt-intercept', 'intercept', true],
  ['#opt-badges', 'badges', true],
  ['#opt-newtab', 'newTab', true],
];

async function bindOptions() {
  const stored = await chrome.storage.sync.get(OPTS.map(([, key]) => key));
  for (const [sel, key, def] of OPTS) {
    const box = $(sel);
    box.checked = typeof stored[key] === 'boolean' ? stored[key] : def;
    box.addEventListener('change', () => chrome.storage.sync.set({ [key]: box.checked }));
  }
}

// ---------- resultado ----------

let lastDownload = '';

function showResult(result) {
  lastDownload = result.download;
  $('#result-name').textContent = result.filename || result.download;
  const meta = [result.host, formatBytes(result.filesize)].filter(Boolean).join(' · ');
  $('#result-meta').textContent = meta;
  $('#result-open').href = result.download;
  $('#result').classList.remove('hidden');
  navigator.clipboard.writeText(result.download).catch(() => {});
}

// ---------- links da página (mirrors) ----------

let pageLinks = [];

async function loadPageLinks() {
  const statusEl = $('#links-status');
  const list = $('#links-list');
  const tryAll = $('#try-all');
  list.innerHTML = '';
  tryAll.classList.add('hidden');
  setStatus(statusEl, t('searching'));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) {
    setStatus(statusEl, t('noActiveTab'));
    return;
  }

  const res = await sendToTab(tab.id, { type: 'collectLinks' });
  if (!res.ok) {
    setStatus(statusEl, t('cannotReadPage'));
    return;
  }

  pageLinks = res.links || [];
  if (pageLinks.length === 0) {
    setStatus(statusEl, t('noLinks'));
    return;
  }

  setStatus(statusEl, t('linksFound', [String(pageLinks.length)]));
  if (pageLinks.length > 1) tryAll.classList.remove('hidden');

  for (const link of pageLinks) {
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className = 'link-info';
    const host = document.createElement('div');
    host.className = 'link-host';
    host.textContent = link.host;
    const text = document.createElement('div');
    text.className = 'link-text';
    text.textContent = link.text;
    text.title = link.href;
    info.append(host, text);

    const btn = document.createElement('button');
    btn.className = 'debrid-btn';
    btn.textContent = '⚡';
    btn.title = t('debridThis');
    btn.addEventListener('click', () => debridSingle(link, btn));

    li.append(info, btn);
    $('#links-list').appendChild(li);
  }
}

async function debridSingle(link, btn) {
  const statusEl = $('#links-status');
  btn.disabled = true;
  btn.textContent = '⏳';
  const res = await send({ type: 'unrestrict', link: link.href });
  btn.disabled = false;
  if (res.ok) {
    btn.textContent = '✅';
    setStatus(statusEl, t('debridOk'), 'success');
    showResult(res.result);
  } else {
    btn.textContent = '❌';
    setStatus(statusEl, link.host + ': ' + res.error, 'error');
    setTimeout(() => { btn.textContent = '⚡'; }, 4000);
  }
}

async function tryAllMirrors() {
  const statusEl = $('#links-status');
  const tryAll = $('#try-all');
  tryAll.disabled = true;
  tryAll.textContent = t('tryAllWorking');
  setStatus(statusEl, t('tryingMirrors', [String(pageLinks.length)]));

  const res = await send({ type: 'unrestrictFirst', links: pageLinks.map((l) => l.href) });

  tryAll.disabled = false;
  tryAll.textContent = t('tryAll');

  if (res.ok) {
    const skipped = (res.attempts || []).length;
    setStatus(statusEl,
      skipped > 0
        ? t('mirrorWorked', [String(skipped + 1), String(res.result.host), String(skipped)])
        : t('firstMirrorWorked', [String(res.result.host)]),
      'success');
    showResult(res.result);
  } else {
    const detail = (res.attempts || [])
      .map((a) => '• ' + a.link.slice(0, 60) + ' → ' + a.error)
      .join('\n');
    setStatus(statusEl, res.error + (detail ? '\n' + detail : ''), 'error');
  }
}

// ---------- inicialização ----------

async function init() {
  localizeDocument();
  await bindOptions();

  $('#save-token').addEventListener('click', saveToken);
  $('#token-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveToken(); });
  $('#change-token').addEventListener('click', () => {
    $('#token-input').value = '';
    setStatus($('#setup-status'), '');
    showSetup();
  });
  $('#refresh-links').addEventListener('click', loadPageLinks);
  $('#try-all').addEventListener('click', tryAllMirrors);
  $('#result-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(lastDownload)
      .then(() => { $('#result-copy').textContent = t('copied'); })
      .catch(() => { $('#result-copy').textContent = t('copyFailed'); });
    setTimeout(() => { $('#result-copy').textContent = t('copyLink'); }, 2000);
  });

  const { apiToken } = await chrome.storage.sync.get('apiToken');
  if (!apiToken) {
    showSetup();
    return;
  }

  showMain();
  loadPageLinks();

  // Valida em segundo plano para mostrar o status da conta.
  const res = await send({ type: 'validateToken', token: apiToken });
  if (res.ok) {
    showAccount(res.user);
  } else {
    setStatus($('#setup-status'), t('tokenInvalid', [res.error]), 'error');
    showSetup();
  }
}

init();
