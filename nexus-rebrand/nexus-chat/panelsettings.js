// The "AI side panel and button" settings block. Used by both the side panel's Settings view and the full-page options.
import { h } from './md.js';
import { LAUNCHER } from './store.js';

const CORNERS = [['tr', 'Top right'], ['tl', 'Top left'], ['br', 'Bottom right'], ['bl', 'Bottom left']];
const MODES = [['docked', 'Docked to the page edge (like a tab)'], ['floating', 'Floating round button']];
const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];

// S = settings object, touch(fn) = run fn to change S, save it and toast.  rerender() redraws the host view.
export function panelSection(S, touch, rerender) {
  const L = S.launcher = { ...LAUNCHER, ...(S.launcher || {}) };
  const on = S.panelEnabled !== false;
  const sel = (opts, cur, set) => h('select', { onchange: (e) => touch(() => set(e.target.value)) }, opts.map(([v, t]) => h('option', { value: v, selected: v === cur }, t)));
  const dim = on ? {} : { disabled: true };
  return [
    h('h3', {}, 'AI side panel and button'),
    h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: on, onchange: async (e) => { await touch(() => { S.panelEnabled = e.target.checked; }); rerender(); } }),
      'Turn on the AI side panel'),
    h('div', { class: 'hint' }, on
      ? 'On by default. Turning it off hides the button on web pages, removes the right-click entries and stops the toolbar icon from opening the panel. Your chats and keys are kept.'
      : 'The AI side panel is off. Tick the box above to bring it back.'),
    h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: L.enabled, ...dim, onchange: async (e) => { await touch(() => { L.enabled = e.target.checked; }); rerender(); } }),
      'Show the “Ask Nexus” pill on web pages (off by default)'),
    h('div', { class: 'hint' }, 'A small pill on the page. Click it to open the panel, drag it to the top or bottom to move it, right-click it for more. You can also switch it on or off by right-clicking the Chat with Nexus toolbar icon.'),
    ...(on && L.enabled ? [
      h('label', {}, 'Style'),
      h('select', { onchange: async (e) => { await touch(() => { L.mode = e.target.value; }); rerender(); } }, MODES.map(([v, t]) => h('option', { value: v, selected: v === L.mode }, t))),
      h('div', { class: 'hint' }, L.mode === 'floating'
        ? 'A round button that floats over the page.'
        : 'Sits flush against the top or bottom edge of the page, right under the tab bar (or the bottom edge). With vertical tabs, choose Bottom left to keep it by the tab list. It is part of the page, so it cannot go inside the browser\u2019s own tab bar.'),
      h('label', {}, L.mode === 'floating' ? 'Corner' : 'Position'),
      L.mode === 'floating' ? sel(CORNERS, L.corner, (v) => { L.corner = v; }) : sel(CORNERS, L.dock, (v) => { L.dock = v; }),
      h('label', {}, 'Size'), sel(SIZES, L.size, (v) => { L.size = v; }),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: L.label, onchange: (e) => touch(() => { L.label = e.target.checked; }) }), 'Show the words “Ask Nexus” next to the icon'),
      ...(L.mode === 'floating' ? [
      h('label', {}, 'Distance from the edge'),
      h('div', { class: 'row' },
        h('input', { type: 'number', min: 0, max: 400, value: L.offsetX, title: 'Sideways (px)', 'aria-label': 'Sideways distance in pixels', onchange: (e) => touch(() => { L.offsetX = Math.max(0, +e.target.value || 0); }) }),
        h('input', { type: 'number', min: 0, max: 800, value: L.offsetY, title: 'Up or down (px)', 'aria-label': 'Up or down distance in pixels', onchange: (e) => touch(() => { L.offsetY = Math.max(0, +e.target.value || 0); }) })),
      h('div', { class: 'hint' }, 'Sideways, then up/down, in pixels. Dragging the button updates these for you.'),
      ] : []),
      ...(L.mode === 'floating' ? [h('label', {}, 'How visible it is when you are not pointing at it'),
      h('input', { type: 'range', min: 25, max: 100, value: Math.round(L.idle * 100), onchange: (e) => touch(() => { L.idle = (+e.target.value || 85) / 100; }) })] : []),
      h('label', {}, 'Do not show it on these sites'),
      h('textarea', { rows: 3, placeholder: 'one site per line, e.g. example.com', onchange: (e) => touch(() => { L.hiddenOn = e.target.value.split(/[\s,]+/).map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean); }) }, (L.hiddenOn || []).join('\n')),
    ] : []),
    h('div', { class: 'hint', style: 'margin-top:8px' }, 'Shortcut: Alt+Shift+N opens the panel. Change it at helium://extensions/shortcuts. The toolbar icon also opens it: pin “Chat with Nexus” from the puzzle-piece menu if you do not see it.'),
  ];
}
