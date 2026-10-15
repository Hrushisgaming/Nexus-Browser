// Runs on web pages. It (1) fills a login when you press Fill in the popup and
// (2) notices when you submit a login form so Nexus Vault can offer to save it. Nothing is sent anywhere else.
(() => {
  if (window.__nexusVaultLoaded) return;
  window.__nexusVaultLoaded = true;

  const visible = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const TEXTY = ['text', 'email', 'tel', 'url', ''];
  const textInputs = (scope) => [...scope.querySelectorAll('input')].filter((i) =>
    TEXTY.includes((i.getAttribute('type') || '').toLowerCase()) && !i.disabled && !i.readOnly && visible(i));
  const userFieldFor = (pw) => {
    let best = null;
    for (const c of textInputs(pw.form || document)) if (c.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) best = c;
    return best;
  };
  const setValue = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  chrome.runtime.onMessage.addListener((m, _sender, send) => {
    if (!m || m.type !== 'fill') return;
    const pw = [...document.querySelectorAll('input[type=password]')].find(visible);
    let user = pw ? userFieldFor(pw) : null;
    if (!pw) user = textInputs(document).find((i) => /user|email|login|account/i.test((i.name || '') + (i.id || '') + (i.autocomplete || ''))) || null;
    if (user && m.username) setValue(user, m.username);
    if (pw && m.password) setValue(pw, m.password);
    send({ ok: !!(user || pw) });
  });

  document.addEventListener('submit', (e) => {
    try {
      const f = e.target;
      if (!(f instanceof HTMLFormElement)) return;
      const filled = [...f.querySelectorAll('input[type=password]')].filter((i) => i.value);
      if (!filled.length) return;
      const pw = filled[filled.length - 1];           // last one = the new password on sign-up / change forms
      const u = userFieldFor(pw);
      chrome.runtime.sendMessage({ type: 'captured', username: u ? u.value : '', password: pw.value });
    } catch (_) { /* extension was reloaded; ignore */ }
  }, true);
})();
