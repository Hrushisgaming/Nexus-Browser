#!/usr/bin/env bash
# Run from the helium-macos folder AFTER a successful ./build.sh (so build/src exists).
# Collects the (already patched) Chromium files I need to write the native "Ask Nexus" tab-strip button.
# Output: nexus-collect.zip  -> upload it to Claude.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/build/src"
[ -d "$SRC" ] || { echo "build/src not found. Run ./build.sh first (and do not delete build/src)."; exit 1; }

LIST="$(mktemp)"
# 1) every file touched by Helium's tab strip / toolbar / side panel / layout patches
for p in "$ROOT"/helium-chromium/patches/helium/ui/{tab-strip-controls,tabs,tab-icon,tab-search-in-toolbar,toolbar,toolbar-button-prefs,side-panel,side-panel-webui-general,side-panel-webui-customize,app-menu-button,location-bar-page-action}.patch \
         "$ROOT"/helium-chromium/patches/helium/ui/layout/*.patch; do
  [ -f "$p" ] && sed -n 's#^+++ b/##p' "$p"
done >> "$LIST"
# 2) key Chromium files and whole folders around them
cat >> "$LIST" <<'LST'
chrome/browser/ui/views/frame/browser_view.cc
chrome/browser/ui/views/frame/browser_view.h
chrome/browser/ui/views/frame/tab_strip_region_view.cc
chrome/browser/ui/views/frame/tab_strip_region_view.h
chrome/browser/ui/views/tabs/tab_strip.cc
chrome/browser/ui/views/tabs/tab_strip.h
chrome/browser/ui/views/tabs/tab_search_button.cc
chrome/browser/ui/views/tabs/tab_search_button.h
chrome/browser/ui/views/tabs/tab_strip_control_button.cc
chrome/browser/ui/views/tabs/tab_strip_control_button.h
chrome/browser/ui/views/tabs/BUILD.gn
chrome/browser/ui/BUILD.gn
chrome/browser/ui/views/side_panel/side_panel_entry.h
chrome/browser/ui/views/side_panel/side_panel_registry.h
chrome/browser/ui/views/side_panel/side_panel_coordinator.h
chrome/browser/ui/views/side_panel/side_panel_ui.h
chrome/browser/ui/views/side_panel/side_panel_util.cc
chrome/browser/ui/views/side_panel/side_panel_util.h
chrome/browser/ui/views/side_panel/side_panel_enums.h
chrome/browser/ui/actions/chrome_action_id.h
chrome/browser/ui/browser_actions.cc
chrome/browser/ui/browser_actions.h
chrome/app/chrome_command_ids.h
LST
# every file in the vertical-tab, side panel and tab strip folders that exists (small text files only)
for d in chrome/browser/ui/views/side_panel chrome/browser/ui/views/tabs; do
  [ -d "$SRC/$d" ] && (cd "$SRC" && find "$d" -maxdepth 1 -type f \( -name '*.h' -o -name '*.cc' -o -name '*.mm' -o -name '*.gn' \) )
done >> "$LIST"

OUT="$ROOT/nexus-collect"; rm -rf "$OUT" "$ROOT/nexus-collect.zip"; mkdir -p "$OUT"
n=0
sort -u "$LIST" | while read -r f; do
  [ -n "$f" ] && [ -f "$SRC/$f" ] || continue
  case "$f" in *.png|*.svg|*.icon|*.pak|*.xtb|*.json) continue;; esac
  mkdir -p "$OUT/$(dirname "$f")"; cp "$SRC/$f" "$OUT/$f"
done
{ echo "chromium: $(cat "$ROOT/helium-chromium/chromium_version.txt")"; echo "helium revision: $(cat "$ROOT/helium-chromium/revision.txt")"; date; } > "$OUT/INFO.txt"
(cd "$ROOT" && zip -qr nexus-collect.zip nexus-collect)
rm -rf "$OUT"
echo "Done: $ROOT/nexus-collect.zip ($(du -h "$ROOT/nexus-collect.zip" | cut -f1)). Upload this file to Claude."
