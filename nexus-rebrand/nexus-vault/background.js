// Locks the vault on a timer / when the computer locks, and holds a login the user just typed on a page.
import { lock } from './vault.js';

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'autolock') lock(); });
chrome.idle.onStateChanged.addListener((s) => { if (s === 'locked') lock(); });
chrome.runtime.onStartup.addListener(() => { chrome.storage.session.remove(['k', 'pending']); });

const short = (s) => typeof s === 'string' && s.length > 0 && s.length < 1024;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'captured' || sender.id !== chrome.runtime.id || !sender.tab || !sender.url) return;
  (async () => {
    const { vault } = await chrome.storage.local.get('vault');
    if (!vault || !short(msg.password) || (msg.username && !short(msg.username))) return;
    // sender.url comes from the browser, not from the page, so a page cannot claim to be another site
    await chrome.storage.session.set({ pending: { url: sender.url, username: msg.username || '', password: msg.password, ts: Date.now() } });
    await chrome.action.setBadgeBackgroundColor({ color: '#3F5C7C' });
    await chrome.action.setBadgeText({ text: '+' });
  })().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
  return true;
});
