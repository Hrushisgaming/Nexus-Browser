# Nexus changes to the Helium source (helium-macos 0.19.2.1 / Chromium 155)

NOT BUILT OR TESTED: Chromium is not in this tree, so these edits were only checked for
consistency (patch context lines, script syntax, name-substitution self-test). Do a real build
before trusting them. NEXUS_CHANGES.diff is the full diff against the original.

## Changed
- Product name: PRODUCT_FULLNAME / SHORTNAME / INSTALLER names = Nexus
  (change-chromium-branding.patch). This is what makes the app, "Nexus Helper" processes and
  Activity Monitor say Nexus. Crash-reporter product name = Nexus.
- Bundle ID: com.nexus.browser (was net.imput.helium). Apple Team ID blanked (it was Helium's).
  Pick your own ID/Team ID before signing.
- Data dir "Nexus" and Keychain "Nexus Safe Storage" / "Nexus" (matches the current kit).
- Internal URL scheme: nexus:// (kHeliumUIScheme, omnibox suggestions, settings text) and the
  build-time Chrome/Chromium -> Nexus substitution (name_substitution*.py, self-test updated).
- Packaging: Nexus.app, Nexus Packaging, Nexus.provisionprofile, DMG volume/file name
  (nexus_<chromium>-<rev>.<platform>_macos.dmg), dmg.json, dev.sh, sparkle delta script.
- ~130 user-visible English strings in added patch lines (flag descriptions, settings text,
  dialogs, "Nexus Noise"...). Later patches that use those lines as context were updated to match.
- app.icns replaced with the Nexus icon. Credits page: "Nexus (based on Helium)".

## Deliberately NOT changed
- LICENSE files and "The Helium Authors" copyright/attribution (GPL-3.0). COMPANY/COPYRIGHT in BRANDING.
- Helium's hosted services (services.helium.imput.net etc.) and wording "Helium services".
- Code identifiers, file names, pref names (helium.*), directory names (helium-chromium):
  invisible to users and renaming them makes merging future Helium updates painful.
- i18n/ translations (see below).

## Still to do on a Mac
- resources/dmg_dsstore is a binary Finder layout tied to the name "Helium.app":
  regenerate with devutils/generate_dmg_dsstore.sh.
- resources/assets/Assets.car + AppIcon.icon are still the Helium icon set; if the built app
  still shows the Helium icon, replace them (the current kit works around this by removing CFBundleIconName).
- In-app logos in helium-chromium/resources/branding/ are still Helium's.
- Translated strings whose English text changed no longer match, so those fall back to English
  in non-English locales until i18n is regenerated.
