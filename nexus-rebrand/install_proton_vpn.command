#!/bin/bash
# Installs and pins the official Proton VPN extension for Nexus (double-click to run).
#   ./install_proton_vpn.command          install + pin
#   ./install_proton_vpn.command --undo   remove the pre-install entry and the pin
# Nexus must be closed while this runs. It uses only files in your own Library folder.
set -euo pipefail

EXT_ID="jplgfhpmjnbigmhklmmbgecoobifkmpa"                       # Proton VPN on the Chrome Web Store
UPDATE_URL="https://clients2.google.com/service/update2/crx"
DATA="${NEXUS_DATA_DIR:-$HOME/Library/Application Support/net.imput.helium}"   # Nexus keeps Helium's data folder
MODE="install"; [ "${1:-}" = "--undo" ] && MODE="undo"

say() { printf '%s\n' "$*"; }
command -v python3 >/dev/null || { say "python3 is missing. Run 'xcode-select --install' first, then try again."; exit 1; }

if [ -z "${NEXUS_SKIP_RUNNING_CHECK:-}" ] && pgrep -f "(Nexus|Helium)\.app/Contents/MacOS" >/dev/null 2>&1; then
  say "Nexus is open. Please quit it (Cmd+Q), then run this again."
  exit 1
fi

EXTDIR="$DATA/External Extensions"
JSON="$EXTDIR/$EXT_ID.json"

if [ "$MODE" = "install" ]; then
  mkdir -p "$EXTDIR"
  printf '{\n  "external_update_url": "%s"\n}\n' "$UPDATE_URL" > "$JSON"
  say "Added Proton VPN to Nexus's pre-install list."
fi

python3 -I - "$DATA" "$EXT_ID" "$MODE" <<'PY'
import glob, json, os, shutil, sys
data, ext, mode = sys.argv[1:4]
files = [p for p in glob.glob(os.path.join(data, '*', 'Preferences')) if os.path.basename(os.path.dirname(p)) == 'Default' or os.path.basename(os.path.dirname(p)).startswith('Profile ')]
if not files:
    print('No Nexus profile found yet. Open Nexus once, quit it, and run this again to pin the icon.')
for f in files:
    with open(f, encoding='utf-8') as fh: prefs = json.load(fh)
    pins = prefs.setdefault('extensions', {}).setdefault('pinned_extensions', [])
    if mode == 'install' and ext not in pins: pins.append(ext)
    elif mode == 'undo' and ext in pins: pins.remove(ext)
    else: print('Already up to date:', os.path.basename(os.path.dirname(f))); continue
    bak = f + '.nexus-backup'
    if not os.path.exists(bak): shutil.copy2(f, bak)
    tmp = f + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh: json.dump(prefs, fh, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp, f)
    print(('Pinned' if mode == 'install' else 'Unpinned'), 'in profile:', os.path.basename(os.path.dirname(f)))
PY

if [ "$MODE" = "undo" ]; then
  rm -f "$JSON"
  say "Removed the pre-install entry. If Proton VPN is already installed, remove it at helium://extensions."
else
  say ""
  say "Done. Open Nexus. If it asks to enable 'Proton VPN', click Enable, then sign in with your Proton account."
  say "If the icon is not in the toolbar, click the puzzle-piece button and pin Proton VPN."
fi
