#!/usr/bin/env python3
"""Rebrand an unpacked Helium.app into Nexus (stdlib only).
usage: nexus_patch.py /path/to/Helium.app
Edits resources inside the app. Run the shell wrapper afterwards to re-sign and build the dmg."""
import os, re, sys, glob, plistlib, shutil, gzip, base64, struct
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from nexus_pak import read_pak, write_pak

A = os.path.join(HERE, 'assets')
def asset(n): return open(os.path.join(A, n), 'rb').read()

# pak resource ids (same in the 100% and 200% paks). Helium shifts these between releases,
# so each role lists the ids seen so far (0.18.x first, 0.19.x second); the first one present as a PNG wins.
ROLE_IDS = {
    'ntp':   (15294, 15296),   # dark asterisk shown on New Tab / sidebar
    'big':   (15305, 15307),   # blue star on the profile picker
    'small': (356,),           # small blue star
}

def role_ids(res):
    out = {}
    for role, cands in ROLE_IDS.items():
        hit = [c for c in cands if c in res and res[c][:4] == b'\x89PNG']
        assert hit, ('no PNG found for %s among %s: this Helium version moved its icons' % (role, cands))
        out[role] = hit[0]        # old id wins where it exists; the new id only exists in newer builds
    return out

def png_for(pak_name, role):
    two = '200' in pak_name
    if role == 'ntp':   return asset('favicon_ntp_32.png' if two else 'favicon_ntp_16.png')
    if role == 'big':   return asset('nexus_cat_64.png' if two else 'nexus_cat_32.png')
    if role == 'small': return asset('nexus_cat_32.png' if two else 'nexus_cat_16.png')

# Helium logo images inside resources.pak (about / setup / error pages) -> cat
RES_LOGOS = {336:'nexus_cat_128.png', 15150:'nexus_cat_64.png', 15151:'nexus_cat_256.png',
             15186:'nexus_cat_16.png', 15187:'nexus_cat_24.png'}
ID_LOGO_SVG = 15153

def find_gz(res, needle):
    """id of the gzip-compressed resource containing needle (ids move between Helium releases)"""
    for rid, d in res.items():
        if d[:2] == b'\x1f\x8b':
            try:
                if needle in gzip.decompress(d): return rid
            except Exception: pass
    raise AssertionError('resource containing %r not found' % needle)


# The first-run setup page (helium://setup) draws Helium's asterisk as inline SVG inside its JavaScript, so the png swaps
# above never touch it. Swap those two SVGs (icon only / icon + wordmark) for the Nexus crosshair, same sizes, currentColor.
def _crosshair(cx, cy):
    t = 'translate(%s %s)' % (cx - 128, cy - 128)
    return ('<g transform="%s" fill="none" stroke="currentColor" stroke-linecap="round">'
            '<circle cx="128" cy="128" r="105.6" stroke-width="22.4"/>'
            '<circle cx="128" cy="128" r="72" stroke-width="11.2" stroke-dasharray="92 20.8" stroke-dashoffset="102.4"/>'
            '<path d="M128 36v48M128 172v48M36 128h48M172 128h48" stroke-width="20.8"/>'
            '<path fill="currentColor" stroke="none" d="M128 99.2q4.8 24 28.8 28.8-24 4.8-28.8 28.8-4.8-24-28.8-28.8 24-4.8 28.8-28.8z"/></g>') % t

NX_ICON = ('<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">' + _crosshair(128, 128) + '</svg>')
NX_WORD = ('<svg width="1123" height="256" viewBox="0 0 1123 256" fill="none" xmlns="http://www.w3.org/2000/svg">' + _crosshair(128, 128) +
           '<text x="300" y="196" fill="currentColor" font-size="214" font-weight="700" '
           'font-family="Instrument Sans Variable, -apple-system, Helvetica, Arial, sans-serif">Nexus</text></svg>')

def patch_setup_logo(res):
    rid = find_gz(res, b'M152.62 237.85L128 256L103.38 237.85')
    t = gzip.decompress(res[rid]).decode('utf-8')
    for var, svg in (('d0', NX_ICON), ('f0', NX_WORD)):
        pat = re.compile(r"var %s=K\('<svg[^']*?'\)" % var)
        assert pat.search(t), 'setup logo %s not found: this Helium version changed the setup page' % var
        t = pat.sub(lambda m: "var %s=K('%s')" % (var, svg), t, count=1)
    res[rid] = gzip.compress(t.encode('utf-8'), 9, mtime=0)

# Leftover visible "Helium" words in built-in pages and scripts (found by scanning every resource in resources.pak):
#  - the script that rewrites the Chrome Web Store button: "Add to Chrome" -> "Add to Helium"
#  - the uBlock Origin About page: "uBlock Origin 1.x (Helium)"
#  - the uBlock Origin filter list names: "Helium filters - Annoyances / Unbreak"
# Internal names (pref keys, CSS variables, filter asset ids, code comments, copyright lines) are left alone on purpose.
def patch_visible_helium(res):
    jobs = [
        (b'replaceDownloadButtonText', [(b", 'Helium');", b", 'Nexus');")]),
        (b'#aboutNameVer', [(b'(Helium)`', b'(Nexus)`')]),
        (b'"parent": "Helium filters"', [(b'"parent": "Helium filters"', b'"parent": "Nexus filters"'),
                                         ('"title": "Helium filters \u2013 '.encode(), '"title": "Nexus filters \u2013 '.encode())]),
    ]
    for needle, subs in jobs:
        rid = find_gz(res, needle)
        t = gzip.decompress(res[rid])
        for a, b in subs:
            assert a in t, 'leftover-branding text not found (this Helium version changed it): %r' % a
            t = t.replace(a, b)
        res[rid] = gzip.compress(t, 9, mtime=0)

def patch_resources(p):
    enc, order, res, als = read_pak(p)
    setup_id = find_gz(res, b'<title>Helium Setup</title>')
    logos = dict(RES_LOGOS)
    logos[setup_id - 1] = 'nexus_cat_128.png'      # the setup page logo sits right before the setup page
    RES_TEXT = {find_gz(res, b'Helium fork:'): [(b'Helium fork:', b'Nexus fork:')],
                setup_id: [(b'<title>Helium Setup</title>', b'<title>Nexus Setup</title>')]}
    for rid, fn in logos.items():
        assert res[rid][:4] == b'\x89PNG', rid
        res[rid] = asset(fn)
    b64 = base64.b64encode(asset('nexus_cat_256.png')).decode()
    svg = ('<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" '
           'xmlns:xlink="http://www.w3.org/1999/xlink"><image width="256" height="256" '
           'href="data:image/png;base64,%s" xlink:href="data:image/png;base64,%s"/></svg>' % (b64, b64))
    assert res[ID_LOGO_SVG][:2] == b'\x1f\x8b'
    res[ID_LOGO_SVG] = gzip.compress(svg.encode(), 9, mtime=0)
    for rid, subs in RES_TEXT.items():
        assert res[rid][:2] == b'\x1f\x8b', rid
        t = gzip.decompress(res[rid])
        for a, b in subs:
            assert a in t, (rid, a); t = t.replace(a, b)
        res[rid] = gzip.compress(t, 9, mtime=0)
    patch_setup_logo(res)
    patch_visible_helium(res)
    write_pak(p, enc, order, res, als)

KEEP = re.compile(r'Helium(?= Authors| Helper| open source)')
def rename(text):
    out, last = [], 0
    for m in re.finditer(r'Helium', text):
        if KEEP.match(text, m.start()): continue
        out.append(text[last:m.start()]); out.append('Nexus'); last = m.end()
    out.append(text[last:])
    return ''.join(out)

# Chromium keeps the key that protects saved passwords and cookies in a macOS Keychain entry. Helium names that entry
# "Helium Storage Key". Same-length swap (the length is baked into the code), so Nexus gets its own entry:
# "Nexus Safe Storage". Only the service name is changed; the account name and the salt are left alone.
KC_OLD, KC_NEW = b'Helium Storage Key', b'Nexus Safe Storage'
assert len(KC_OLD) == len(KC_NEW)

def patch_keychain(app):
    import mmap
    done = 0
    for fw in glob.glob(os.path.join(app, 'Contents', 'Frameworks', '*.framework')):
        stem = os.path.basename(fw)[:-len('.framework')]
        for exe in glob.glob(os.path.join(fw, 'Versions', '*', stem)):
            if os.path.islink(exe) or not os.path.isfile(exe): continue
            with open(exe, 'r+b') as f, mmap.mmap(f.fileno(), 0) as m:
                i = m.find(KC_OLD)
                while i != -1:
                    m[i:i + len(KC_OLD)] = KC_NEW; done += 1; i = m.find(KC_OLD, i + 1)
    if done: print(f'keychain: Nexus now uses its own entry ("{KC_NEW.decode()}"), patched {done} place(s)')
    else: print('WARNING: could not find the Keychain name in this Helium version. Nexus will still share Helium\'s Keychain entry.\n'
                '         (Everything else works. Tell me the Helium version and I will update the patch.)')

def main(app):
    app = os.path.abspath(app)
    assert os.path.isdir(os.path.join(app, 'Contents')), 'not an app bundle: ' + app
    # 1. Info.plist
    ip = os.path.join(app, 'Contents', 'Info.plist')
    with open(ip, 'rb') as f: pl = plistlib.load(f)
    pl['CFBundleDisplayName'] = 'Nexus'; pl['CFBundleName'] = 'Nexus'
    pl.pop('CFBundleIconName', None)          # use app.icns instead of the Helium Assets.car icon
    with open(ip, 'wb') as f: plistlib.dump(pl, f)
    # 2. app icon
    shutil.copyfile(os.path.join(A, 'app.icns'), os.path.join(app, 'Contents', 'Resources', 'app.icns'))
    # 3. paks + product_logo_32.png
    nloc = nimg = 0
    for root, dirs, files in os.walk(app):
        for fn in files:
            p = os.path.join(root, fn)
            if os.path.islink(p): continue
            if fn == 'locale.pak':
                enc, order, res, als = read_pak(p)
                for rid in order:
                    try: s = res[rid].decode('utf-8')
                    except UnicodeDecodeError: continue
                    if 'Helium' in s: res[rid] = rename(s).encode('utf-8')
                write_pak(p, enc, order, res, als); nloc += 1
            elif fn in ('chrome_100_percent.pak', 'chrome_200_percent.pak'):
                enc, order, res, als = read_pak(p)
                for role, rid in role_ids(res).items():
                    res[rid] = png_for(fn, role); nimg += 1
                write_pak(p, enc, order, res, als)
            elif fn == 'InfoPlist.strings':
                raw = open(p, 'rb').read()
                enc_name = 'utf-16' if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8'
                try: txt = raw.decode(enc_name)
                except UnicodeDecodeError: continue
                if 'Helium' in txt:
                    new = rename(txt)
                    if enc_name == 'utf-16': out = b'\xff\xfe' + new.encode('utf-16-le') if raw[:2] == b'\xff\xfe' else b'\xfe\xff' + new.encode('utf-16-be')
                    else: out = new.encode('utf-8')
                    open(p, 'wb').write(out)
            elif fn == 'resources.pak':
                patch_resources(p); nimg += 7
            elif fn == 'product_logo_32.png' and root.endswith('Resources'):
                open(p, 'wb').write(asset('nexus_cat_32.png'))
    print(f'patched {nloc} locale paks, {nimg} images')
    patch_keychain(app)

if __name__ == '__main__':
    main(sys.argv[1])
