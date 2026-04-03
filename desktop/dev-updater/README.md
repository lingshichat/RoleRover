# Local Updater Feed

This directory hosts the local updater smoke-test feed for the Tauri desktop runtime.

What is committed:
- `pubkey.txt`: the public minisign key wired into `desktop/src-tauri/tauri.conf.json`
- this README

What is generated locally:
- `latest.json`
- `artifacts/`

What is intentionally not committed:
- the private signing key used by `tauri build`

Expected local private key path:
- `desktop/.tauri/updater.key`

Build and feed flow:
1. Run `pnpm run build:tauri`
2. Run `pnpm run build:desktop:updater-feed`
3. Run `pnpm run serve:desktop:updater-feed`
4. In another shell, run `pnpm run dev:tauri:local-updater`
5. In the native desktop shell, use the updater check action from Settings

Notes:
- The committed production updater endpoint now points to `https://github.com/lingshichat/RoleRover/releases/latest/download/latest.json`
- `pnpm run dev:tauri:local-updater` generates a temporary `TAURI_CONFIG` override so local updater smoke can still target `http://127.0.0.1:8765/latest.json`
- `dangerousInsecureTransportProtocol` is enabled only in that generated local override so the smoke feed can run over HTTP
