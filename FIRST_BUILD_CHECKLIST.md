# First Nexus build from source (Mac)

Goal: prove the source builds into a working Nexus.dmg. Only then do we add the native "Ask Nexus" tab-strip button.

## You need
- A Mac (Apple Silicon builds arm64 by default), macOS 12+.
- Lots of free disk and several hours. My rough estimate, not from the docs: 150 GB+ free.
- Full Xcode 26 from the App Store (not only Command Line Tools). Open it once and accept the license.
- No Apple Developer account needed for an unsigned build for your own use.

## Steps
1. Terminal, one-time setup:
   sudo xcode-select -s /Applications/Xcode.app
   sudo xcodebuild -license accept
   brew install python@3.13 wget coreutils readline quilt
   pip3 install httplib2==0.22.0 requests pillow      # add --break-system-packages if pip refuses
   xcodebuild -downloadComponent MetalToolchain
   brew unlink binutils
   (then close and reopen Terminal)
2. Unzip, then:  cd Nexus-Helium-Source/helium-macos
3. Make sure Xcode is open, then run:  ./build.sh
   It downloads Chromium 155, applies the patches, compiles and writes build/nexus_*.dmg.
4. If it fails (from the Helium docs):
   - failed while downloading Chromium: delete build/downloads_cache and run ./build.sh again
   - failed anywhere after downloading: delete build/src and run ./build.sh again
   Either way, send me the last ~60 lines of the output. Patch errors there are expected to be mine to fix.
5. When it works: open the .dmg, run Nexus, check it opens, and look at Activity Monitor (it should say Nexus).
6. KEEP build/src (do not delete it). Run:  ./nexus_collect_files.sh
   Upload the nexus-collect.zip it creates (the tab strip, toolbar and side panel code) and tell me what you saw in step 5.
