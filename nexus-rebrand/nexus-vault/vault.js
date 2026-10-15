// Nexus Vault core: encryption, storage, helpers. No network access anywhere in this extension.
const ITER = 600000;                       // PBKDF2-SHA256 iterations (OWASP 2023 guidance)
const te = new TextEncoder(), td = new TextDecoder();

export const b64 = (buf) => {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const aad = (h) => te.encode(`nexus-vault|${h.v}|${h.iter}|${h.salt}`);   // binds header to ciphertext

async function deriveKey(password, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function encryptWith(key, data, header) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(header) }, key, te.encode(JSON.stringify(data)));
  return { ...header, iv: b64(iv), ct: b64(ct) };
}
async function decryptWith(key, blob) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv), additionalData: aad(blob) }, key, unb64(blob.ct));
  return JSON.parse(td.decode(pt));
}
const header = (salt, iter = ITER) => ({ v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt) });
const emptyData = () => ({ entries: [] });

// ---- storage (local = encrypted vault on disk; session = unlock key, memory only) ----
export async function hasVault() { return !!(await chrome.storage.local.get('vault')).vault; }
export async function isUnlocked() { return !!(await chrome.storage.session.get('k')).k; }
export async function lock() { await chrome.storage.session.remove('k'); }

async function putSessionKey(key) { await chrome.storage.session.set({ k: b64(await crypto.subtle.exportKey('raw', key)) }); }
async function getSessionKey() {
  const { k } = await chrome.storage.session.get('k');
  if (!k) throw new Error('locked');
  return crypto.subtle.importKey('raw', unb64(k), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function createVault(password) {
  if (await hasVault()) throw new Error('vault exists');
  const h = header(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(password, unb64(h.salt), h.iter);
  await chrome.storage.local.set({ vault: await encryptWith(key, emptyData(), h) });
  await putSessionKey(key);
}
export async function unlock(password) {
  const { vault } = await chrome.storage.local.get('vault');
  if (!vault) throw new Error('no vault');
  const key = await deriveKey(password, unb64(vault.salt), vault.iter);
  try { await decryptWith(key, vault); } catch { throw new Error('Wrong master password'); }
  await putSessionKey(key);
}
export async function loadVault() {
  const { vault } = await chrome.storage.local.get('vault');
  return decryptWith(await getSessionKey(), vault);
}
export async function saveVault(data) {
  const { vault } = await chrome.storage.local.get('vault');
  const key = await getSessionKey();
  await chrome.storage.local.set({ vault: await encryptWith(key, data, { v: vault.v, kdf: vault.kdf, iter: vault.iter, salt: vault.salt }) });
}
export async function changeMaster(oldPw, newPw) {
  const { vault } = await chrome.storage.local.get('vault');
  let data;
  try { data = await decryptWith(await deriveKey(oldPw, unb64(vault.salt), vault.iter), vault); }
  catch { throw new Error('Current master password is wrong'); }
  const h = header(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(newPw, unb64(h.salt), h.iter);
  await chrome.storage.local.set({ vault: await encryptWith(key, data, h) });
  await putSessionKey(key);
}
export async function exportBackup() { return JSON.stringify({ app: 'nexus-vault', ...(await chrome.storage.local.get('vault')).vault }, null, 1); }
export async function readBackup(text, password) {
  const b = JSON.parse(text);
  if (b.app !== 'nexus-vault' || !b.ct) throw new Error('Not a Nexus Vault backup');
  try { return (await decryptWith(await deriveKey(password, unb64(b.salt), b.iter), b)).entries || []; }
  catch { throw new Error('Wrong password for this backup'); }
}

// ---- entries ----
export const hostOf = (u) => {
  if (!u) return '';
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
};
export function hostMatches(entryUrl, tabHost) {
  const e = hostOf(entryUrl), t = hostOf(tabHost);
  return !!e && !!t && (t === e || t.endsWith('.' + e));
}
export function newEntry(p = {}) {
  const now = Date.now();
  return { id: crypto.randomUUID(), name: '', url: '', username: '', password: '', notes: '', created: now, updated: now, ...p };
}
export function mergeEntries(data, incoming) {
  let added = 0, skipped = 0;
  for (const e of incoming) {
    if (!e || !e.password) { skipped++; continue; }
    const dupe = data.entries.some((x) => hostOf(x.url) === hostOf(e.url) && x.username === e.username && x.password === e.password);
    if (dupe) { skipped++; continue; }
    data.entries.push(newEntry({ name: e.name || hostOf(e.url) || 'Untitled', url: e.url || '', username: e.username || '', password: e.password, notes: e.notes || '' }));
    added++;
  }
  return { added, skipped };
}

// ---- generator / strength ----
const randInt = (n) => { const lim = Math.floor(0x100000000 / n) * n; let x; do { x = crypto.getRandomValues(new Uint32Array(1))[0]; } while (x >= lim); return x % n; };
const SETS = { lower: 'abcdefghijkmnopqrstuvwxyz', upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits: '23456789', symbols: '!@#$%^&*-_=+?' };
export function generatePassword({ length = 20, lower = true, upper = true, digits = true, symbols = true } = {}) {
  const on = Object.entries({ lower, upper, digits, symbols }).filter(([, v]) => v).map(([k]) => SETS[k]);
  if (!on.length) on.push(SETS.lower, SETS.upper, SETS.digits);
  length = Math.max(on.length, Math.min(128, length | 0));
  const all = on.join('');
  const out = on.map((s) => s[randInt(s.length)]);
  while (out.length < length) out.push(all[randInt(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = randInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}
export function strength(pw) {          // rough guess only: 0-4
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  const bits = pw.length * Math.log2(pool || 1) * (/(.)\1{2,}|1234|password|qwerty/i.test(pw) ? 0.5 : 1);
  return bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
}

// ---- CSV import (Chrome, Edge, Firefox, Bitwarden, 1Password style exports) ----
export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
export function csvToEntries(text) {
  const rows = parseCSV(text); if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iName = col('name', 'title'), iUrl = col('url', 'login_uri', 'website', 'web site', 'origin'),
    iUser = col('username', 'login_username', 'user', 'login'), iPass = col('password', 'login_password', 'pass'),
    iNote = col('note', 'notes', 'extra');
  if (iPass < 0) throw new Error('CSV has no password column');
  const g = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  return rows.slice(1).map((r) => ({ name: g(r, iName), url: g(r, iUrl), username: g(r, iUser), password: (r[iPass] || ''), notes: g(r, iNote) }));
}
