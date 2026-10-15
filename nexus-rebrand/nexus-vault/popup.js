import * as V from './vault.js';

const app = document.getElementById('app');
const IN_TAB = new URLSearchParams(location.search).has('tab');
if (IN_TAB) document.body.classList.add('tab');

const S = { view: 'loading', data: null, tabUrl: '', tabHost: '', tabId: null, q: '', sel: null, draft: null, pending: null,
  err: '', info: '', gen: { length: 20, lower: true, upper: true, digits: true, symbols: true }, prefs: { autolockMin: 15 } };

// small DOM helper: text is always set as text, never as HTML
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
};
const toast = (t) => { const e = h('div', { class: 'toast' }, t); document.body.append(e); setTimeout(() => e.remove(), 1600); };
const go = (view, extra = {}) => { Object.assign(S, { view, err: '', info: '' }, extra); render(); };

async function scheduleLock() {
  const { prefs } = await chrome.storage.local.get('prefs');
  S.prefs = { autolockMin: 15, ...(prefs || {}) };
  if (S.prefs.autolockMin > 0) chrome.alarms.create('autolock', { delayInMinutes: Math.max(0.5, S.prefs.autolockMin) });
  else chrome.alarms.clear('autolock');
}
async function load() { S.data = await V.loadVault(); await scheduleLock(); }
async function persist() { await V.saveVault(S.data); await scheduleLock(); }
async function doLock() { await V.lock(); S.data = null; go('locked'); }

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && !IN_TAB) { S.tabUrl = tab.url || ''; S.tabId = tab.id; S.tabHost = V.hostOf(S.tabUrl); }
  } catch (_) {}
  const { pending } = await chrome.storage.session.get('pending');
  S.pending = pending && Date.now() - pending.ts < 600000 ? pending : null;
  if (!(await V.hasVault())) S.view = 'setup';
  else if (await V.isUnlocked()) { await load(); S.view = new URLSearchParams(location.search).get('view') || 'list'; }
  else S.view = 'locked';
  render();
}

// ---------- views ----------
function header(extra = []) {
  return h('header', {}, h('h1', {}, 'Nexus Vault'), ...extra);
}
function meter(pw) {
  const s = V.strength(pw);
  return h('div', { class: 'meter' }, [1, 2, 3, 4].map((i) => h('i', { class: i <= s ? 'on' + s : '' })));
}
function pwInput(id, ph) { return h('input', { id, type: 'password', placeholder: ph || '', autocomplete: 'off' }); }
const $ = (id) => document.getElementById(id);

function viewSetup() {
  const go_ = async () => {
    const a = $('p1').value, b = $('p2').value;
    if (a.length < 10) return fail('Use at least 10 characters. A few random words works well.');
    if (a !== b) return fail('The two passwords do not match.');
    try { await V.createVault(a); await load(); go('list'); } catch (e) { fail(e.message); }
  };
  const fail = (m) => { $('err').textContent = m; };
  return [header(), h('main', { class: 'stack' },
    h('h2', {}, 'Create your master password'),
    h('p', { class: 'hint' }, 'This one password unlocks everything. It is never stored and cannot be recovered. If you forget it, the vault cannot be opened, so choose something you will remember.'),
    pwInput('p1', 'Master password'), pwInput('p2', 'Repeat master password'),
    h('div', { id: 'meterbox' }),
    h('div', { id: 'err', class: 'err' }),
    h('button', { class: 'btn', onclick: go_ }, 'Create vault'))];
}
function viewLocked() {
  const unlock = async () => {
    const btn = $('ub'); btn.disabled = true; btn.textContent = 'Unlocking…';
    try { await V.unlock($('pw').value); await load(); go('list'); }
    catch (e) { $('err').textContent = e.message; btn.disabled = false; btn.textContent = 'Unlock'; $('pw').select(); }
  };
  const el = pwInput('pw', 'Master password');
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
  setTimeout(() => el.focus(), 0);
  return [header(), h('main', { class: 'stack' }, h('h2', {}, 'Vault is locked'), el, h('div', { id: 'err', class: 'err' }), h('button', { id: 'ub', class: 'btn', onclick: unlock }, 'Unlock'))];
}

function pendingBanner() {
  const p = S.pending; if (!p) return null;
  const host = V.hostOf(p.url);
  const existing = S.data.entries.find((e) => V.hostOf(e.url) === host && e.username === p.username);
  if (existing && existing.password === p.password) { clearPending(); return null; }
  const clear = async () => { await clearPending(); render(); };
  const save = async () => {
    if (existing) { existing.password = p.password; existing.updated = Date.now(); }
    else S.data.entries.push(V.newEntry({ name: host, url: p.url, username: p.username, password: p.password }));
    await persist(); await clearPending(); toast(existing ? 'Password updated' : 'Saved'); render();
  };
  return h('div', { class: 'banner' },
    h('div', {}, existing ? 'Update password for ' : 'Save login for ', h('b', {}, host), p.username ? ' (' + p.username + ')?' : '?'),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: save }, existing ? 'Update' : 'Save'), h('button', { class: 'btn sec', onclick: clear }, 'Not now')));
}
async function clearPending() { S.pending = null; await chrome.storage.session.remove('pending'); chrome.action.setBadgeText({ text: '' }); }

function viewList() {
  const q = S.q.trim().toLowerCase();
  let list = S.data.entries.filter((e) => !q || [e.name, e.url, e.username].some((x) => (x || '').toLowerCase().includes(q)));
  const m = (e) => (S.tabHost && V.hostMatches(e.url, S.tabHost) ? 0 : 1);
  list.sort((a, b) => m(a) - m(b) || a.name.localeCompare(b.name));
  const search = h('input', { type: 'search', placeholder: 'Search logins', value: S.q });
  search.addEventListener('input', () => { S.q = search.value; const pos = search.selectionStart; render(); const n = document.querySelector('input[type=search]'); n.focus(); n.setSelectionRange(pos, pos); });
  return [header([h('button', { onclick: () => go('edit', { draft: V.newEntry({ url: /^https?:/.test(S.tabUrl) ? new URL(S.tabUrl).origin : '', name: S.tabHost }), sel: null }) }, '+ Add'),
      h('button', { onclick: () => go('settings') }, 'Settings'), h('button', { onclick: doLock }, 'Lock')]),
    h('main', {}, pendingBanner(), search,
      h('div', { style: 'margin-top:8px' }, list.length ? list.map((e) =>
        h('div', { class: 'item', onclick: () => go('detail', { sel: e.id }) },
          h('div', { class: 'av' }, (e.name || '?')[0].toUpperCase()),
          h('div', { class: 'm' }, h('div', { class: 't' }, e.name || '(no name)'), h('div', { class: 's' }, e.username || V.hostOf(e.url))),
          m(e) === 0 ? h('span', { class: 'tag' }, 'this site') : null))
        : h('p', { class: 'hint', style: 'text-align:center;margin-top:30px' }, S.data.entries.length ? 'No matches.' : 'No logins yet. Click “+ Add”, or sign in to a site and Nexus Vault will offer to save it.')))];
}

async function fillEntry(e) {
  if (!/^https?:/.test(S.tabUrl)) return toast('Open a login page first');
  if (!V.hostMatches(e.url, S.tabHost) && !confirm(`This login is saved for ${V.hostOf(e.url) || 'no site'}, but this page is ${S.tabHost}.\n\nFill it anyway?`)) return;
  const msg = { type: 'fill', username: e.username, password: e.password };
  try { await chrome.tabs.sendMessage(S.tabId, msg); }
  catch { try { await chrome.scripting.executeScript({ target: { tabId: S.tabId }, files: ['content.js'] }); await chrome.tabs.sendMessage(S.tabId, msg); } catch { return toast('Could not fill this page'); } }
  window.close();
}
const copy = async (t, what) => { try { await navigator.clipboard.writeText(t); toast(what + ' copied'); } catch { toast('Copy failed'); } };

function viewDetail() {
  const e = S.data.entries.find((x) => x.id === S.sel); if (!e) return viewList();
  let shown = false;
  const pv = h('div', { class: 'v' }, '••••••••••');
  const tog = h('button', { onclick: () => { shown = !shown; pv.textContent = shown ? e.password : '••••••••••'; tog.textContent = shown ? 'Hide' : 'Show'; } }, 'Show');
  const f = (k, v, ...btns) => h('div', { class: 'field' }, h('div', {}, h('div', { class: 'k' }, k), v), ...btns);
  const del = async () => { if (!confirm(`Delete “${e.name}”? This cannot be undone.`)) return; S.data.entries = S.data.entries.filter((x) => x.id !== e.id); await persist(); go('list'); };
  return [header([h('button', { onclick: () => go('list') }, '← Back')]), h('main', {},
    h('h2', { style: 'margin-top:0' }, e.name),
    f('Website', h('div', { class: 'v' }, e.url || '—')),
    f('Username', h('div', { class: 'v' }, e.username || '—'), e.username ? h('button', { onclick: () => copy(e.username, 'Username') }, 'Copy') : null),
    f('Password', pv, tog, h('button', { onclick: () => copy(e.password, 'Password') }, 'Copy')),
    e.notes ? f('Notes', h('div', { class: 'v', style: 'white-space:pre-wrap' }, e.notes)) : null,
    h('div', { class: 'row', style: 'margin-top:14px' },
      IN_TAB ? null : h('button', { class: 'btn', onclick: () => fillEntry(e) }, 'Fill on this page'),
      h('button', { class: 'btn sec', onclick: () => go('edit', { draft: { ...e } }) }, 'Edit'),
      h('button', { class: 'btn danger', onclick: del }, 'Delete')))];
}

function viewEdit() {
  const d = S.draft; const isNew = !S.data.entries.some((x) => x.id === d.id);
  const fld = (id, label, val, attrs = {}) => [h('label', { for: id }, label), h('input', { id, value: val || '', autocomplete: 'off', ...attrs })];
  const pw = h('input', { id: 'pw', value: d.password, autocomplete: 'off', type: 'password' });
  const mt = h('div', {}); const upd = () => { mt.replaceChildren(meter(pw.value)); }; pw.addEventListener('input', upd); upd();
  const genopt = (key, label) => { const c = h('input', { type: 'checkbox' }); c.checked = S.gen[key]; c.addEventListener('change', () => { S.gen[key] = c.checked; }); return h('label', { class: 'chk' }, c, label); };
  const len = h('input', { type: 'range', min: 8, max: 64, value: S.gen.length }); const lenl = h('span', { class: 'hint' }, `Length ${S.gen.length}`);
  len.addEventListener('input', () => { S.gen.length = +len.value; lenl.textContent = `Length ${len.value}`; });
  const gen = () => { pw.value = V.generatePassword(S.gen); pw.type = 'text'; upd(); };
  const save = async () => {
    const name = $('name').value.trim(), url = $('url').value.trim(), username = $('user').value.trim();
    if (!pw.value) { $('err').textContent = 'Password is required.'; return; }
    Object.assign(d, { name: name || V.hostOf(url) || 'Untitled', url, username, password: pw.value, notes: $('notes').value, updated: Date.now() });
    const i = S.data.entries.findIndex((x) => x.id === d.id);
    if (i >= 0) S.data.entries[i] = d; else S.data.entries.push(d);
    await persist(); go('detail', { sel: d.id });
  };
  return [header([h('button', { onclick: () => go(isNew ? 'list' : 'detail', { sel: d.id }) }, 'Cancel')]), h('main', {},
    fld('name', 'Name', d.name), fld('url', 'Website', d.url, { placeholder: 'https://example.com' }), fld('user', 'Username or email', d.username),
    h('label', { for: 'pw' }, 'Password'), h('div', { class: 'row' }, pw, h('button', { class: 'btn sec fit', onclick: gen }, 'Generate')), mt,
    h('details', {}, h('summary', {}, 'Generator options'), len, lenl, genopt('lower', 'a–z'), genopt('upper', 'A–Z'), genopt('digits', '0–9'), genopt('symbols', 'Symbols')),
    h('label', { for: 'notes' }, 'Notes'), h('textarea', { id: 'notes', rows: 3 }, d.notes || ''),
    h('div', { id: 'err', class: 'err' }), h('button', { class: 'btn', style: 'width:100%', onclick: save }, 'Save'))];
}

function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
function viewSettings() {
  const msg = h('div', { class: 'err', id: 'err' }, S.err); const info = h('div', { class: 'hint', id: 'info' }, S.info);
  const sel = h('select', {}, [[5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [0, 'Only when the browser closes']].map(([v, t]) => h('option', { value: v }, t)));
  sel.value = String(S.prefs.autolockMin);
  sel.addEventListener('change', async () => { S.prefs.autolockMin = +sel.value; await chrome.storage.local.set({ prefs: S.prefs }); await scheduleLock(); toast('Saved'); });
  const change = async () => {
    const a = $('op').value, b = $('np').value, c = $('np2').value;
    if (b.length < 10) return (msg.textContent = 'New password needs at least 10 characters.');
    if (b !== c) return (msg.textContent = 'New passwords do not match.');
    try { await V.changeMaster(a, b); $('op').value = $('np').value = $('np2').value = ''; msg.textContent = ''; info.textContent = 'Master password changed.'; }
    catch (e) { msg.textContent = e.message; }
  };
  const exportIt = async () => download(`nexus-vault-backup-${new Date().toISOString().slice(0, 10)}.json`, await V.exportBackup());
  const imp = async () => {
    const file = $('file').files[0]; if (!file) return (msg.textContent = 'Choose a file first.');
    try {
      const text = await file.text(); let entries;
      if (file.name.toLowerCase().endsWith('.csv')) entries = V.csvToEntries(text);
      else { const p = prompt('Enter the master password this backup was made with:'); if (p == null) return; entries = await V.readBackup(text, p); }
      const r = V.mergeEntries(S.data, entries); await persist(); msg.textContent = ''; info.textContent = `Imported ${r.added} login(s), skipped ${r.skipped} duplicate or empty.`;
    } catch (e) { msg.textContent = e.message; }
  };
  return [header([h('button', { onclick: () => go('list') }, '← Back')]), h('main', {},
    h('h2', { style: 'margin-top:0' }, 'Auto-lock'), sel,
    h('h2', {}, 'Change master password'), pwInput('op', 'Current password'), h('div', { style: 'height:6px' }), pwInput('np', 'New password'), h('div', { style: 'height:6px' }), pwInput('np2', 'Repeat new password'),
    h('div', { style: 'height:8px' }), h('button', { class: 'btn sec', onclick: change }, 'Change password'),
    h('h2', {}, 'Backup'), h('p', { class: 'hint' }, 'The backup file is encrypted with your master password. Keep a copy somewhere safe (not only on this computer).'),
    h('button', { class: 'btn sec', onclick: exportIt }, 'Download encrypted backup'),
    h('h2', {}, 'Import'),
    IN_TAB ? h('div', {}, h('p', { class: 'hint' }, 'Import a Nexus Vault backup (.json) or a password export from another browser or manager (.csv). Delete the CSV afterwards because it is not encrypted.'),
        h('input', { id: 'file', type: 'file', accept: '.json,.csv' }), h('div', { style: 'height:8px' }), h('button', { class: 'btn sec', onclick: imp }, 'Import'))
      : h('div', {}, h('p', { class: 'hint' }, 'Importing needs a full tab, because the file picker closes this small window.'),
        h('button', { class: 'btn sec', onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab=1&view=settings') }) }, 'Open import page')),
    msg, info)];
}

function render() {
  const views = { setup: viewSetup, locked: viewLocked, list: viewList, detail: viewDetail, edit: viewEdit, settings: viewSettings };
  if (!views[S.view]) return;
  app.replaceChildren(...views[S.view]().filter(Boolean));
  if (S.view === 'setup') { const mb = $('meterbox'); const p1 = $('p1'); p1.addEventListener('input', () => mb.replaceChildren(meter(p1.value))); }
}
init();
