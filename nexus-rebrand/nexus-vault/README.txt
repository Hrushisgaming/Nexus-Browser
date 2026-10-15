NEXUS VAULT - local, encrypted password manager for Nexus

BUILT IN
It comes with Nexus.app. There is nothing to install. (In a build made from the Nexus source it is compiled into the browser, like uBlock Origin; see NATIVE_VAULT_VPN.md.)

IF YOU USED THE OLD "LOAD UNPACKED" VAULT: move your passwords over before removing it
(the built-in Vault is a different extension to the browser, so it starts empty).
1. Keep the old Vault loaded. Open it > Settings > Download encrypted backup.
2. Open the built-in Vault (same name), create a master password, then Settings > Import and choose that backup.
3. Check your logins are there, and only then remove the old copy at helium://extensions.

USE
- First click: create a master password (min 10 characters). It cannot be recovered.
- Sign in to a site: a "+" appears on the icon; open it and click Save.
- On a login page: open the icon, click the login, then "Fill on this page".
- Settings: auto-lock time, change master password, encrypted backup, import (.csv or backup .json).

SECURITY NOTES
- Everything is encrypted with AES-256-GCM; the key comes from your master password (PBKDF2-SHA256, 600,000 rounds).
- Data lives only in this browser profile on this computer. The extension has no network access.
- Back up regularly: Settings > Download encrypted backup.
- Not independently audited. Keep your most critical accounts (email, banking) in a well-reviewed manager too.
