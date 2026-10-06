// AutoDebrid — content script
// Marca links de hosters suportados pelo Real-Debrid e, ao clicar,
// entrega o link já "debridado". Também responde ao popup com a lista
// de links/mirrors encontrados na página.

(() => {
  'use strict';

  const BADGE_CLASS = 'autodebrid-badge';
  const MARK_ATTR = 'data-autodebrid';

  let domainSet = null;        // Set com os domínios suportados pelo RD
  let hasToken = false;
  const settings = {
    intercept: true,           // interceptar cliques em links suportados
    badges: true,              // mostrar o botão ⚡ ao lado dos links
    newTab: true,              // abrir o link debridado em nova aba
  };

  const pageHost = location.hostname.replace(/^www\./, '');

  // ---------- utilidades ----------

  // Textos traduzidos ficam em _locales/<idioma>/messages.json.
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: t('errNoResponse') });
        });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  function linkHost(href) {
    try {
      const u = new URL(href, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  function matchedDomain(host) {
    if (!host || !domainSet) return null;
    // Confere o domínio exato e todos os sufixos (sub.dominio.com → dominio.com)
    const parts = host.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join('.');
      if (domainSet.has(candidate)) return candidate;
    }
    return null;
  }

  // Em páginas do próprio hoster (ex.: você já está no 1fichier.com), interceptar
  // cliques quebraria a navegação normal do site — nesses casos só mostramos o badge.
  function isSameHostAsPage(host) {
    return host === pageHost || host.endsWith('.' + pageHost) || pageHost.endsWith('.' + host);
  }

  // ---------- toast ----------

  let toastEl = null;
  let toastTimer = null;

  function showToast(text, kind = 'info') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'autodebrid-toast';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.dataset.kind = kind;
    toastEl.classList.add('autodebrid-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('autodebrid-toast-visible'), 6000);
  }

  // ---------- debridar ----------

  async function debridAndOpen(anchor, badge) {
    const href = anchor.href;
    if (badge) { badge.textContent = '⏳'; badge.title = t('badgeWorking'); }
    showToast(t('toastWorking'));

    const res = await send({ type: 'unrestrict', link: href });

    if (res.ok) {
      const { download, filename } = res.result;
      if (badge) { badge.textContent = '✅'; badge.title = t('badgeDone'); }
      showToast(t('toastSuccess', [filename || t('linkReady')]), 'success');
      try { navigator.clipboard.writeText(download).catch(() => {}); } catch { /* sem gesto ativo */ }
      if (settings.newTab) window.open(download, '_blank');
      else location.href = download;
    } else {
      if (badge) { badge.textContent = '❌'; badge.title = res.error; }
      // Permite que o próximo clique passe direto para o link original.
      anchor.setAttribute('data-autodebrid-bypass', '1');
      showToast(t('toastError', [res.error]), 'error');
      setTimeout(() => anchor.removeAttribute('data-autodebrid-bypass'), 15000);
    }
  }

  // ---------- marcação dos links ----------

  function markLink(anchor) {
    if (anchor.getAttribute(MARK_ATTR)) return;
    const host = linkHost(anchor.href);
    const domain = matchedDomain(host);
    if (!domain) {
      anchor.setAttribute(MARK_ATTR, 'no');
      return;
    }
    anchor.setAttribute(MARK_ATTR, isSameHostAsPage(host) ? 'samehost' : 'yes');

    if (settings.badges) {
      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.textContent = '⚡';
      badge.title = t('badgeTitle', [domain]);
      badge.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        debridAndOpen(anchor, badge);
      }, true);
      anchor.insertAdjacentElement('afterend', badge);
    }
  }

  function scan(root = document) {
    if (!domainSet || domainSet.size === 0) return;
    const anchors = root.querySelectorAll ? root.querySelectorAll('a[href]:not([' + MARK_ATTR + '])') : [];
    for (const a of anchors) markLink(a);
  }

  function clearBadges() {
    document.querySelectorAll('.' + BADGE_CLASS).forEach((b) => b.remove());
    document.querySelectorAll('[' + MARK_ATTR + ']').forEach((a) => a.removeAttribute(MARK_ATTR));
  }

  // ---------- interceptação de cliques ----------

  document.addEventListener('click', (ev) => {
    if (!settings.intercept || !hasToken) return;
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;

    const anchor = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!anchor) return;
    if (anchor.getAttribute('data-autodebrid-bypass')) return; // falhou antes: deixa passar
    if (anchor.getAttribute(MARK_ATTR) !== 'yes') {
      // Links ainda não marcados (adicionados agora): tenta classificar na hora.
      if (anchor.getAttribute(MARK_ATTR)) return;
      markLink(anchor);
      if (anchor.getAttribute(MARK_ATTR) !== 'yes') return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    const badge = anchor.nextElementSibling && anchor.nextElementSibling.classList &&
      anchor.nextElementSibling.classList.contains(BADGE_CLASS) ? anchor.nextElementSibling : null;
    debridAndOpen(anchor, badge);
  }, true);

  // ---------- coleta de links para o popup (mirrors) ----------

  function collectLinks() {
    const seen = new Set();
    const links = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const host = linkHost(a.href);
      const domain = matchedDomain(host);
      if (!domain) continue;
      const href = a.href;
      if (seen.has(href)) continue;
      seen.add(href);
      links.push({
        href,
        host: domain,
        text: (a.textContent || '').trim().slice(0, 80) || href.slice(0, 80),
      });
    }
    return links;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'collectLinks') {
      sendResponse({ ok: true, links: collectLinks(), page: location.href });
    } else if (msg.type === 'showToast') {
      showToast(msg.text, msg.kind || 'info');
      sendResponse({ ok: true });
    }
    return false;
  });

  // ---------- observação de mudanças no DOM ----------

  let scanScheduled = false;
  const observer = new MutationObserver(() => {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(() => { scanScheduled = false; scan(); }, 500);
  });

  // ---------- configurações ----------

  function applyStoredSettings(items) {
    if (typeof items.intercept === 'boolean') settings.intercept = items.intercept;
    if (typeof items.badges === 'boolean') settings.badges = items.badges;
    if (typeof items.newTab === 'boolean') settings.newTab = items.newTab;
  }

  // O service worker é a fonte da verdade: devolve só os domínios habilitados
  // do serviço de debrid ativo e diz se há chave configurada para ele.
  async function loadDomains() {
    const res = await send({ type: 'getDomains' });
    if (!res.ok || !Array.isArray(res.domains)) return false;
    domainSet = new Set(res.domains);
    hasToken = !!res.hasToken;
    return true;
  }

  // Mudanças que alteram quais links são "suportados": serviço, chaves, hosters desligados.
  const DOMAIN_KEYS = ['provider', 'apiToken', 'torboxToken', 'disabledHosts'];

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    const flat = {};
    for (const [k, v] of Object.entries(changes)) flat[k] = v.newValue;
    const badgesBefore = settings.badges;
    applyStoredSettings(flat);
    const domainsChanged = DOMAIN_KEYS.some((k) => k in changes);
    if (domainsChanged) await loadDomains();
    if (domainsChanged || badgesBefore !== settings.badges) {
      clearBadges();
      scan();
    }
  });

  // ---------- inicialização ----------

  async function init() {
    const items = await chrome.storage.sync.get(['intercept', 'badges', 'newTab']);
    applyStoredSettings(items);

    if (await loadDomains()) {
      scan();
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  init();
})();
