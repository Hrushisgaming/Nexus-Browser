import { h } from './md.js';
import { getSettings, saveSettings } from './store.js';
import { panelSection } from './panelsettings.js';

let S;
const toast = (t) => { const e = h('div', { class: 'toast' }, t); document.getElementById('toasts').append(e); setTimeout(() => e.remove(), 2000); };
const touch = async (fn) => { fn(); await saveSettings(S); toast('Saved'); };
function draw() { document.getElementById('root').replaceChildren(...panelSection(S, touch, draw).filter(Boolean)); }
(async () => { S = await getSettings(); draw(); })();
