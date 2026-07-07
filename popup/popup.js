// AutoDebrid — popup
// Configura a chave de API, expõe as opções e lista os links/mirrors
// detectados na página ativa, permitindo testá-los um a um.

const $ = (sel) => document.querySelector(sel);

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: 'Sem resposta' });
    });
  });
}

function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: 'Sem resposta' });
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
    setStatus(statusEl, 'Cole a chave de API primeiro.', 'error');
    return;
  }
  setStatus(statusEl, 'Validando…');
  const res = await send({ type: 'validateToken', token });
  if (!res.ok) {
    setStatus(statusEl, res.error, 'error');
    return;
  }
  await chrome.storage.sync.set({ apiToken: token });
  setStatus(statusEl, 'Chave válida! Conta: ' + res.user.username, 'success');
  showAccount(res.user);
  showMain();
  loadPageLinks();
}

function showAccount(user) {
  const badge = $('#account-badge');
  const premium = user.type === 'premium';
  const days = user.premium ? Math.floor(user.premium / 86400) : 0;
  badge.textContent = user.username + (premium ? ` · premium (${days}d)` : ' · conta gratuita');
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
let activeTabId = null;

async function loadPageLinks() {
  const statusEl = $('#links-status');
  const list = $('#links-list');
  const tryAll = $('#try-all');
  list.innerHTML = '';
  tryAll.classList.add('hidden');
  setStatus(statusEl, 'Procurando links…');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) {
    setStatus(statusEl, 'Nenhuma aba ativa encontrada.');
    return;
  }
  activeTabId = tab.id;

  const res = await sendToTab(tab.id, { type: 'collectLinks' });
  if (!res.ok) {
    setStatus(statusEl, 'Não foi possível ler esta página (recarregue-a e tente de novo).');
    return;
  }

  pageLinks = res.links || [];
  if (pageLinks.length === 0) {
    setStatus(statusEl, 'Nenhum link de hoster suportado nesta página.');
    return;
  }

  setStatus(statusEl, pageLinks.length + ' link(s) de hoster encontrados:');
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
    btn.title = 'Debridar este link';
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
    setStatus(statusEl, 'Link debridado com sucesso (copiado para a área de transferência).', 'success');
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
  tryAll.textContent = '⏳ Testando mirrors…';
  setStatus(statusEl, 'Testando ' + pageLinks.length + ' mirror(s) em ordem…');

  const res = await send({ type: 'unrestrictFirst', links: pageLinks.map((l) => l.href) });

  tryAll.disabled = false;
  tryAll.textContent = '🔁 Testar mirrors (usa o primeiro que funcionar)';

  if (res.ok) {
    const skipped = (res.attempts || []).length;
    setStatus(statusEl,
      skipped > 0
        ? `Mirror ${skipped + 1} funcionou (${res.result.host}); ${skipped} falharam antes.`
        : `Primeiro mirror funcionou (${res.result.host}).`,
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
      .then(() => { $('#result-copy').textContent = 'Copiado!'; })
      .catch(() => { $('#result-copy').textContent = 'Falhou :('; });
    setTimeout(() => { $('#result-copy').textContent = 'Copiar link'; }, 2000);
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
    setStatus($('#setup-status'), 'Sua chave parece inválida: ' + res.error, 'error');
    showSetup();
  }
}

init();
