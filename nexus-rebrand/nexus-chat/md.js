// Tiny, safe Markdown renderer. Builds DOM nodes only; nothing is ever inserted as HTML.

export const h = (tag, props = {}, ...kids) => {
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

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(\*[^*\s][^*\n]*\*)/g;

function inline(text, parent) {
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) parent.append(h('code', {}, t.slice(1, -1)));
    else if (m[2]) parent.append(h('strong', {}, t.slice(2, -2)));
    else if (m[3]) {
      const i = t.indexOf('](');
      parent.append(h('a', { href: t.slice(i + 2, -1), target: '_blank', rel: 'noopener noreferrer' }, t.slice(1, i)));
    } else parent.append(h('em', {}, t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function blocks(text, root) {
  const lines = text.split('\n');
  let i = 0, para = [];
  const flush = () => { if (para.length) { const p = h('p'); inline(para.join('\n'), p); root.append(p); para = []; } };
  while (i < lines.length) {
    const l = lines[i]; let m;
    if (!l.trim()) { flush(); i++; continue; }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { flush(); const e = h('h' + (m[1].length + 2)); inline(m[2], e); root.append(e); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); root.append(h('hr')); i++; continue; }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      const ordered = /^\s*\d/.test(l), list = h(ordered ? 'ol' : 'ul');
      while (i < lines.length && (m = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]))) { const li = h('li'); inline(m[1], li); list.append(li); i++; }
      root.append(list); continue;
    }
    if (/^>\s?/.test(l)) {
      flush(); const q = h('blockquote'), buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      inline(buf.join('\n'), q); root.append(q); continue;
    }
    if (l.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      flush();
      const head = cells(l); i += 2;
      const t = h('table', {}, h('thead', {}, h('tr', {}, head.map((c) => { const th = h('th'); inline(c, th); return th; }))));
      const tb = h('tbody');
      while (i < lines.length && lines[i].trim().startsWith('|')) { tb.append(h('tr', {}, cells(lines[i]).map((c) => { const td = h('td'); inline(c, td); return td; }))); i++; }
      t.append(tb); root.append(h('div', { class: 'tbl' }, t)); continue;
    }
    para.push(l); i++;
  }
  flush();
}

export function renderMarkdown(src, target) {
  const frag = document.createDocumentFragment();
  for (const part of src.split(/(```[\s\S]*?(?:```|$))/g)) {
    if (!part) continue;
    if (part.startsWith('```')) {
      const body = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').replace(/\n$/, '');
      const lang = (/^```([^\n]*)/.exec(part)?.[1] || '').trim();
      const btn = h('button', { class: 'copy', onclick: async () => { try { await navigator.clipboard.writeText(body); btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1200); } catch { /* ignore */ } } }, 'Copy');
      frag.append(h('div', { class: 'code' }, h('div', { class: 'codebar' }, h('span', {}, lang || 'code'), btn), h('pre', {}, h('code', {}, body))));
    } else blocks(part, frag);
  }
  target.replaceChildren(frag);
}
