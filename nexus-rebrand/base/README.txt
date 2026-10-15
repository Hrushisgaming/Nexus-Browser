The Helium base that Nexus is built from. build_nexus_dmg.sh uses the newest helium_*arm64-macos.dmg in this folder,
so the kit builds on any Mac without downloading anything.

Current base: Helium 0.19.2.1 (Chromium 155.0.8059.39), arm64.
To update: drop a newer helium_*arm64-macos.dmg in here (you can delete the old one) and run the build again.
If this folder is ever empty, the build looks in ~/Downloads and then downloads the latest release itself.
