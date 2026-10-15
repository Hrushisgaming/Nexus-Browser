// The floating "Ask Nexus" button on web pages (similar to Chrome's Ask Gemini button).
// Everything about it is set in Chat with Nexus > Settings > "AI side panel and button".
// It lives in a closed shadow root so page styles cannot touch it, and it never reads page content.
(() => {
  if (window.top !== window) return;                     // top-level pages only, never inside iframes
  if (document.getElementById('nexus-launcher-host')) return;

  const DEF = { enabled: false, mode: 'docked', dock: 'tr', corner: 'tr', offsetX: 14, offsetY: 14, size: 'm', label: true, idle: 0.85, hiddenOn: [] };
  const DOCK_INSET = 16;                                   // docked pill: distance from the side edge (it touches the top/bottom edge)
  const docked = () => cfg.mode !== 'floating';
  const slot = () => (docked() ? cfg.dock : cfg.corner) || 'tr';
  const SIZES = { s: 30, m: 38, l: 48 };
  let cfg = { ...DEF }, panelOn = true, host = null, btn = null, menu = null;

  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const hostname = location.hostname.replace(/^www\./, '');
  const hiddenHere = () => (cfg.hiddenOn || []).some((d) => hostname === d || hostname.endsWith('.' + d));

  async function load() {
    if (!alive()) return;
    try {
      const { settings } = await chrome.storage.local.get('settings');
      panelOn = settings?.panelEnabled !== false;
      cfg = { ...DEF, ...(settings?.launcher || {}) };
    } catch { /* storage unavailable: keep defaults */ }
    render();
  }

  async function patch(change) {                          // save a small change without touching anything else
    if (!alive()) return;
    const { settings = {} } = await chrome.storage.local.get('settings');
    settings.launcher = { ...DEF, ...(settings.launcher || {}), ...change };
    await chrome.storage.local.set({ settings });
  }

  const css = (px, dk, atTop) => `
    :host{all:initial}
    .wrap{position:fixed;z-index:2147483646;display:flex;flex-direction:row;align-items:center;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .b{display:flex;align-items:center;gap:7px;height:${dk ? Math.round(px * 0.78) : px}px;min-width:${dk ? Math.round(px * 1.4) : px}px;padding:0 ${Math.round(px * (dk ? 0.3 : 0.2))}px;justify-content:center;border:0;border-radius:${dk ? (atTop ? '0 0 14px 14px' : '14px 14px 0 0') : px + 'px'};cursor:pointer;
       color:#fff;background:linear-gradient(135deg,#3e3a63,#408a99);box-shadow:${dk ? '0 1px 6px rgba(0,0,0,.25)' : '0 2px 10px rgba(0,0,0,.28)'};opacity:${dk ? 1 : 'var(--idle)'};transition:opacity .15s,transform .15s;user-select:none;touch-action:none}
    .b:hover,.b:focus-visible{opacity:1;${dk ? 'filter:brightness(1.12)' : 'transform:scale(1.06)'}}
    .b:focus-visible{outline:2px solid #fff;outline-offset:2px}
    .b svg{width:${Math.round(px * (dk ? 0.52 : 0.66))}px;height:${Math.round(px * (dk ? 0.52 : 0.66))}px;pointer-events:none;flex:0 0 auto}
    .b span{padding-right:${Math.round(px * 0.18)}px;pointer-events:none;white-space:nowrap}
    .b.drag{cursor:grabbing;transform:none;opacity:1}
    .menu{position:absolute;top:calc(100% + 6px);min-width:210px;background:#fff;color:#1d1b2e;border:1px solid #e4e1f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:4px;font-weight:500}
    .menu.bottom{top:auto;bottom:calc(100% + 6px)}
    .menu button{display:block;width:100%;text-align:left;background:none;border:0;border-radius:7px;padding:7px 10px;font:inherit;color:inherit;cursor:pointer}
    .menu button:hover{background:#eef1f7}
    @media (prefers-color-scheme:dark){.menu{background:#211f2c;color:#ecebf5;border-color:#34314a}.menu button:hover{background:#2f2c40}}
    @media print{.wrap{display:none}}`;

  function place(wrap) {
    const c = slot();
    wrap.style.top = wrap.style.bottom = wrap.style.left = wrap.style.right = 'auto';
    // docked: flush against the top or bottom edge (0px), a fixed distance from the side. floating: your own distances.
    wrap.style[c[0] === 't' ? 'top' : 'bottom'] = (docked() ? 0 : cfg.offsetY) + 'px';
    wrap.style[c[1] === 'r' ? 'right' : 'left'] = (docked() ? DOCK_INSET : cfg.offsetX) + 'px';
  }

  // The Nexus crosshair, drawn as inline SVG.
  function crosshair() {
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const svg = mk('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true' });
    const ink = { fill: 'none', stroke: '#e6f6ff', 'stroke-linecap': 'round' };
    svg.append(mk('circle', { ...ink, cx: 16, cy: 16, r: 13.2, 'stroke-width': 2.8 }),
      mk('circle', { ...ink, cx: 16, cy: 16, r: 9, 'stroke-width': 1.4, 'stroke-dasharray': '11.5 2.6', 'stroke-dashoffset': 12.8 }),
      mk('path', { ...ink, 'stroke-width': 2.6, d: 'M16 4.5v6M16 21.5v6M4.5 16h6M21.5 16h6' }),
      mk('path', { fill: '#e6f6ff', d: 'M16 12.4q.6 3 3.6 3.6-3 .6-3.6 3.6-.6-3-3.6-3.6 3-.6 3.6-3.6z' }));
    return svg;
  }

  function closeMenu() { menu?.remove(); menu = null; }

  function openMenu(wrap) {
    closeMenu();
    const mk = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { closeMenu(); fn(); }; return b; };
    menu = document.createElement('div'); menu.className = 'menu' + (slot()[0] === 'b' ? ' bottom' : '');
    menu.style[slot()[1] === 'r' ? 'right' : 'left'] = '0';
    menu.append(
      mk(docked() ? 'Make it a floating button' : 'Dock it to the page edge', () => patch({ mode: docked() ? 'floating' : 'docked' })),
      mk('Hide on ' + hostname, () => patch({ hiddenOn: [...new Set([...(cfg.hiddenOn || []), hostname])] })),
      mk('Hide the button everywhere', () => patch({ enabled: false })),
      mk('Customize…', () => chrome.runtime.sendMessage({ type: 'open-options' })));
    wrap.append(menu);
  }

  function render() {
    host?.remove(); host = btn = null; closeMenu();
    if (!alive() || !panelOn || !cfg.enabled || hiddenHere()) return;
    const px = SIZES[cfg.size] || SIZES.m;
    host = document.createElement('div'); host.id = 'nexus-launcher-host';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style'); style.textContent = css(px, docked(), slot()[0] === 't');
    const wrap = document.createElement('div'); wrap.className = 'wrap'; wrap.style.setProperty('--idle', String(cfg.idle));
    btn = document.createElement('button'); btn.className = 'b'; btn.type = 'button';
    btn.title = 'Ask Nexus (drag to move it to the top or bottom, right-click for options)'; btn.setAttribute('aria-label', 'Ask Nexus');
    btn.append(crosshair());
    if (cfg.label) { const t = document.createElement('span'); t.textContent = 'Ask Nexus'; btn.append(t); }
    wrap.append(btn); root.append(style, wrap); place(wrap);

    // click opens the panel; dragging moves the button and snaps it to the nearest corner
    let down = null;
    btn.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; down = { x: e.clientX, y: e.clientY, moved: false }; btn.setPointerCapture(e.pointerId); closeMenu(); });
    btn.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
      down.moved = true; btn.classList.add('drag');
      const w = btn.offsetWidth, hgt = btn.offsetHeight;
      wrap.style.right = wrap.style.bottom = 'auto';
      wrap.style.left = Math.max(0, Math.min(innerWidth - w, e.clientX - w / 2)) + 'px';
      wrap.style.top = Math.max(0, Math.min(innerHeight - hgt, e.clientY - hgt / 2)) + 'px';
    });
    btn.addEventListener('pointerup', (e) => {
      if (!down) return; const moved = down.moved; down = null; btn.classList.remove('drag');
      try { btn.releasePointerCapture(e.pointerId); } catch {}
      if (!moved) { try { chrome.runtime.sendMessage({ type: 'open-panel' }); } catch {} return; }
      const r = wrap.getBoundingClientRect();
      const right = r.left + r.width / 2 > innerWidth / 2, bottom = r.top + r.height / 2 > innerHeight / 2;
      const sl = (bottom ? 'b' : 't') + (right ? 'r' : 'l');
      if (docked()) { patch({ dock: sl }); place(wrap); return; }          // docked: snap flush to the nearest top/bottom corner
      patch({ corner: sl,
        offsetX: Math.max(4, Math.round(right ? innerWidth - r.right : r.left)),
        offsetY: Math.max(4, Math.round(bottom ? innerHeight - r.bottom : r.top)) });
    });
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(wrap); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('pointerdown', (e) => { if (menu && !e.composedPath().includes(host)) closeMenu(); }, true);

    document.documentElement.append(host);
    host.style.display = document.fullscreenElement ? 'none' : '';
  }

  document.addEventListener('fullscreenchange', () => { if (host) host.style.display = document.fullscreenElement ? 'none' : ''; });
  try { chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.settings) load(); }); } catch {}
  load();
})();
