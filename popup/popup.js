// AutoDebrid — popup
// Configura o serviço de debrid e a chave de API, expõe as opções, permite
// habilitar/desabilitar hosters e lista os links/mirrors da página ativa.

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

// ---------- serviços de debrid ----------

let providers = [];        // [{id, name, keyUrl, hasToken}]
let currentProvider = 'realdebrid';

const providerById = (id) => providers.find((p) => p.id === id) || providers[0];

async function loadProviders() {
  const res = await send({ type: 'getProviders' });
  if (!res.ok) return;
  providers = res.providers;
  currentProvider = res.current;

  const select = $('#provider-select');
  select.innerHTML = '';
  for (const p of providers) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + (p.hasToken ? '' : ' (' + t('noKeyYet') + ')');
    select.appendChild(opt);
  }
  select.value = currentProvider;

  const choice = $('#provider-choice');
  choice.innerHTML = '';
  for (const p of providers) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'provider';
    radio.value = p.id;
    radio.addEventListener('change', () => updateSetupProvider(p.id));
    label.append(radio, ' ' + p.name);
    choice.appendChild(label);
  }
}

function updateSetupProvider(id) {
  const p = providerById(id);
  if (!p) return;
  const radio = document.querySelector(`#provider-choice input[value="${p.id}"]`);
  if (radio) radio.checked = true;
  $('#setup-intro').textContent = t('setupIntro', [p.name]);
  const link = $('#key-link');
  link.href = p.keyUrl;
  link.textContent = p.keyUrl.replace(/^https?:\/\//, '');
}

// ---------- telas ----------

function showSetup(providerId = currentProvider, cancelable = false) {
  updateSetupProvider(providerId);
  $('#setup-cancel').classList.toggle('hidden', !cancelable);
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
  const checked = document.querySelector('#provider-choice input:checked');
  const providerId = checked ? checked.value : currentProvider;
  if (!token) {
    setStatus(statusEl, t('setupEmpty'), 'error');
    return;
  }
  setStatus(statusEl, t('validating'));
  const res = await send({ type: 'validateToken', token, provider: providerId });
  if (!res.ok) {
    setStatus(statusEl, res.error, 'error');
    return;
  }
  await send({ type: 'saveToken', token, provider: providerId });
  setStatus(statusEl, t('tokenValid', [res.user.username]), 'success');
  $('#token-input').value = '';
  await loadProviders();
  showAccount(res.user);
  showMain();
  loadHosters();
  loadPageLinks();
}

function showAccount(user) {
  const badge = $('#account-badge');
  const planName = chrome.i18n.getMessage('plan_' + user.plan) || user.plan;
  const account = user.premium
    ? (user.daysLeft != null
      ? t('accountPremium', [user.username, planName, String(user.daysLeft)])
      : t('accountPlan', [user.username, planName]))
    : t('accountFree', [user.username]);
  badge.textContent = user.providerName + ' · ' + account;
  badge.title = badge.textContent;
  badge.classList.remove('hidden');
}

async function validateCurrent() {
  const p = providerById(currentProvider);
  const { [p.id === 'torbox' ? 'torboxToken' : 'apiToken']: token } = await chrome.storage.sync.get(['apiToken', 'torboxToken']);
  const res = await send({ type: 'validateToken', token, provider: p.id });
  if (res.ok) {
    showAccount(res.user);
  } else {
    setStatus($('#setup-status'), t('tokenInvalid', [res.error]), 'error');
    showSetup(p.id, false);
  }
}

async function switchProvider(id) {
  const p = providerById(id);
  if (!p) return;
  if (!p.hasToken) {
    // Sem chave para este serviço: pede a chave, mantendo o serviço atual até salvar.
    $('#provider-select').value = currentProvider;
    setStatus($('#setup-status'), '');
    showSetup(p.id, true);
    return;
  }
  await send({ type: 'setProvider', provider: p.id });
  currentProvider = p.id;
  $('#result').classList.add('hidden');
  loadHosters();
  loadPageLinks();
  validateCurrent();
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

// ---------- hosters ----------

let hosterState = null;    // resposta de getHosters

function renderHosters() {
  const list = $('#hosters-list');
  const statusEl = $('#hosters-status');
  list.innerHTML = '';
  if (!hosterState) return;

  const total = hosterState.hosters.length;
  const enabled = hosterState.hosters.filter((h) => h.enabled).length;
  $('#hosters-count').textContent = total ? t('hostersCount', [String(enabled), String(total)]) : '';

  if (!total) {
    setStatus(statusEl, t('hostersEmpty'), 'error');
    return;
  }
  setStatus(statusEl, '');

  const filter = $('#hosters-filter').value.trim().toLowerCase();
  const sorted = [...hosterState.hosters].sort((a, b) => a.label.localeCompare(b.label));
  for (const h of sorted) {
    if (filter && !h.label.toLowerCase().includes(filter) && !h.domains.some((d) => d.includes(filter))) continue;
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = h.enabled;
    box.addEventListener('change', async () => {
      box.disabled = true;
      const res = await send({ type: 'setHosterEnabled', domains: h.domains, enabled: box.checked });
      if (res.ok) { hosterState = res; renderHosters(); }
      else box.disabled = false;
    });
    const name = document.createElement('span');
    name.className = 'hoster-name';
    name.textContent = h.label;
    name.title = h.domains.join(', ') + (h.note ? '\n' + h.note : '');
    label.append(box, name);
    if (h.type === 'stream') {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = t('tagStream');
      label.appendChild(tag);
    }
    if (h.up === false) {
      const tag = document.createElement('span');
      tag.className = 'tag down';
      tag.textContent = t('tagDown');
      label.appendChild(tag);
    }
    li.appendChild(label);
    list.appendChild(li);
  }
}

async function loadHosters(force = false) {
  setStatus($('#hosters-status'), t('hostersLoading'));
  $('#hosters-count').textContent = '';
  const res = await send({ type: 'getHosters', force });
  if (!res.ok) {
    hosterState = null;
    $('#hosters-list').innerHTML = '';
    setStatus($('#hosters-status'), res.error, 'error');
    return;
  }
  hosterState = res;
  renderHosters();
}

async function setAllHosters(enabled) {
  const res = await send({ type: 'setAllHosters', enabled });
  if (res.ok) { hosterState = res; renderHosters(); }
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
  setStatus(statusEl, currentProvider === 'torbox' ? t('tbWorking') : t('validating'));
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
  await loadProviders();

  $('#save-token').addEventListener('click', saveToken);
  $('#token-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveToken(); });
  $('#setup-cancel').addEventListener('click', () => { $('#token-input').value = ''; showMain(); validateCurrent(); });
  $('#change-token').addEventListener('click', () => {
    $('#token-input').value = '';
    setStatus($('#setup-status'), '');
    showSetup(currentProvider, true);
  });
  $('#provider-select').addEventListener('change', (e) => switchProvider(e.target.value));
  $('#hosters-filter').addEventListener('input', renderHosters);
  $('#hosters-all').addEventListener('click', () => setAllHosters(true));
  $('#hosters-none').addEventListener('click', () => setAllHosters(false));
  $('#hosters-refresh').addEventListener('click', () => loadHosters(true));
  $('#refresh-links').addEventListener('click', loadPageLinks);
  $('#try-all').addEventListener('click', tryAllMirrors);
  $('#result-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(lastDownload)
      .then(() => { $('#result-copy').textContent = t('copied'); })
      .catch(() => { $('#result-copy').textContent = t('copyFailed'); });
    setTimeout(() => { $('#result-copy').textContent = t('copyLink'); }, 2000);
  });

  const p = providerById(currentProvider);
  if (!p || !p.hasToken) {
    showSetup(currentProvider, false);
    return;
  }

  showMain();
  loadHosters();
  loadPageLinks();
  // Valida em segundo plano para mostrar o status da conta.
  validateCurrent();
}

init();
