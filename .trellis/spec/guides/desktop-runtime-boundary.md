# Desktop Runtime Boundary

> Purpose: Define the executable cross-layer contract for the PR1 desktop shell boundary between the React/Vite renderer and the Tauri/Rust command layer.

## Scope

This contract covers the bootstrap-stage desktop shell in `desktop/`:

1. Tauri starts the desktop-local Vite dev/build pipeline
2. Rust exposes bootstrap/runtime commands
3. Renderer requests runtime/workspace/settings snapshots through Tauri commands
4. Renderer can request representative template validation snapshots, secret inventory snapshots, and native HTML export writes through Tauri commands
5. Renderer can mutate desktop-local provider config / secrets and start native AI prompt streams through Tauri write commands
6. Renderer consumes incremental AI events from the desktop-native `desktop://ai-stream` event bridge
7. Renderer can request a native release-readiness snapshot that reflects bundling, updater, tray, and window-state posture
8. Renderer falls back to explicit placeholder data only when Tauri commands are unavailable
9. UI must surface fallback limitations instead of presenting fallback data as native readiness

## Files

- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/src/ai.rs`
- `desktop/src-tauri/src/release.rs`
- `desktop/src-tauri/src/storage.rs`
- `desktop/src-tauri/src/settings.rs`
- `desktop/src-tauri/src/workspace.rs`
- `desktop/src/lib/desktop-api.ts`
- `desktop/src/lib/desktop-loaders.ts`
- `desktop/src/lib/template-validation.ts`
- `desktop/src/routes/root.tsx`
- `desktop/src/routes/home.tsx`
- `desktop/src/routes/dashboard.tsx`
- `desktop/src/routes/editor.tsx`
- `desktop/src/routes/templates.tsx`
- `desktop/src/routes/settings.tsx`
- `desktop/src/i18n.ts`
- `src/lib/constants.ts`
- `src/lib/pdf/export-tailwind-css.ts`
- `src/lib/template-renderer/index.ts`
- `src/lib/template-renderer/template-contract.ts`
- `src/lib/template-renderer/types.ts`
- `src/lib/template-renderer/templates/classic.tsx`
- `src/lib/template-renderer/templates/modern.tsx`
- `src/types/resume.ts`
- `scripts/build-export-css.ts`
- `scripts/dev-local.mjs`
- `scripts/verify-desktop-lint-boundary.mjs`

## Local Commands

```bash
pnpm dev:tauri
pnpm run lint:desktop:active
pnpm run lint:desktop:shared
pnpm run verify:desktop:migration
pnpm run report:desktop:release-readiness
pnpm run verify:desktop:release-readiness
pnpm run build:desktop:updater-feed
pnpm run serve:desktop:updater-feed
pnpm lint   # repo-wide observation
```

## Lightweight Development Workflow

To avoid high CPU/memory usage from repeated Rust recompilation during active development, follow this decoupled workflow:

1. **Browser-Only Mode for UI/Component Changes**:
   Run the Vite dev server pure in the browser without Tauri.
   ```bash
   pnpm --filter @rolerover/desktop run dev
   ```
   *Open `http://localhost:1420` in your browser. The renderer will automatically fall back to placeholder data for native commands, allowing fast UI iteration.*

2. **Background HMR for Native Desktop**:
   If you need to test the UI inside the native shell, start Tauri once and leave it running.
   ```bash
   pnpm run tauri:dev
   ```
   *Vite's Hot Module Replacement (HMR) will stream React changes directly to the Tauri window without requiring Rust to restart.*

3. **Rust-Only Validation**:
   When changing Rust code in `desktop/src-tauri/`, avoid full local builds. Use cargo's fast check mode instead:
   ```bash
   cd desktop/src-tauri && cargo check
   ```

4. **GitHub CI Delegation**:
   Avoid running `pnpm build` or full `tauri build` locally. Push your code and rely on GitHub CI to produce the final `.exe` or `.msi` artifacts.

## Staged Migration Lint Boundary

Blocking hard gate for the current desktop migration slice:

- `pnpm type-check`
- `pnpm run lint:desktop:active`
- `pnpm run lint:desktop:shared`
- `pnpm --filter @rolerover/desktop build`
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml --target-dir .codex-cargo-target/desktop-tauri`

Desktop active surface enforced by `lint:desktop:active`:

- `desktop/src/lib/desktop-api.ts`
- `desktop/src/lib/template-validation.ts`
- `desktop/src/i18n.ts`
- `desktop/src/routes/root.tsx`
- `desktop/src/routes/home.tsx`
- `desktop/src/routes/dashboard.tsx`
- `desktop/src/routes/editor.tsx`
- `desktop/src/routes/templates.tsx`
- `desktop/src/routes/settings.tsx`

Shared active surface v1 enforced by `lint:desktop:shared`:

- `src/lib/constants.ts`
- `src/lib/pdf/export-tailwind-css.ts`
- `src/lib/template-renderer/index.ts`
- `src/lib/template-renderer/template-contract.ts`
- `src/lib/template-renderer/types.ts`
- `src/lib/template-renderer/templates/classic.tsx`
- `src/lib/template-renderer/templates/modern.tsx`
- `src/types/resume.ts`
- `scripts/build-export-css.ts` when the export CSS contract changes
- `scripts/verify-desktop-lint-boundary.mjs` when the migration gate changes

Observation-only signals for this migration stage:

- `pnpm lint` at repo scope
- Desktop build chunk warnings
- Shared-surface warnings that remain outside the current blocking contract

## Dev Command Contract

`desktop/src-tauri/tauri.conf.json` must start desktop-local frontend commands from the `desktop/` package directory:

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://127.0.0.1:1420",
    "frontendDist": "../dist"
  }
}
```

Important rule:

- Do **not** point `beforeDevCommand` at the repo-root `pnpm dev` / `npm --prefix .. run dev` flow.
- Tauri expects the desktop renderer on port `1420`; the root Next.js dev stack uses a different runtime and can create false startup failures.

## Bootstrap Command Contract

Rust command:

- File: `desktop/src-tauri/src/lib.rs`
- Command: `get_bootstrap_context`

Returned payload fields:

```json
{
  "appName": "RoleRover Desktop",
  "appVersion": "0.1.0",
  "frontendShell": "React + Vite + TanStack Router + react-i18next",
  "runtime": "Tauri + Rust bootstrap shell",
  "platform": "windows",
  "buildChannel": "development",
  "branch": "tauri-rust-desktop-rewrite",
  "runtimeMode": "tauri",
  "supportsNativeCommands": true,
  "limitations": []
}
```

Renderer fallback shape:

- File: `desktop/src/lib/desktop-api.ts`
- Constant: `FALLBACK_CONTEXT`

Required fallback values:

```json
{
  "runtimeMode": "browser_fallback",
  "supportsNativeCommands": false,
  "limitations": [
    "Native Tauri commands are unavailable in browser fallback mode.",
    "Workspace, storage, settings, and importer snapshots are placeholders for shell development only.",
    "Use the desktop shell to validate real filesystem, secrets, and migration behavior."
  ]
}
```

## Renderer Access Contract

Renderer helper:

- File: `desktop/src/lib/desktop-api.ts`
- Function: `invokeWithFallback(command, fallback)`

Rules:

1. `get_bootstrap_context`, `get_workspace_snapshot`, `get_storage_snapshot`, `get_workspace_settings_snapshot`, `get_secret_vault_status`, `get_secret_inventory_snapshot`, `get_release_readiness_snapshot`, `get_importer_dry_run`, and `get_template_validation_snapshot` must route through `invokeWithFallback(...)`.
2. Fallback reads must log the failing command name via `reportDesktopFallback(...)`.
3. Renderer pages must use `isBrowserFallbackRuntime(context)` instead of string-matching raw runtime text.
4. Native write commands such as `write_template_validation_export`, `update_ai_provider_settings`, `write_secret_value`, and `start_ai_prompt_stream` must not silently fall back; write failures should surface as explicit UI errors.

## AI Runtime Streaming Contract

Rust commands:

- File: `desktop/src-tauri/src/lib.rs`
- Commands:
  - `get_secret_inventory_snapshot`
  - `update_ai_provider_settings`
  - `write_secret_value`
  - `start_ai_prompt_stream`

Rust runtime module:

- File: `desktop/src-tauri/src/ai.rs`
- Event: `desktop://ai-stream`

Secret inventory read payload:

```json
{
  "backend": "os_keyring",
  "encryptedAtRest": true,
  "warnings": [
    "Active secret descriptors are backed by Windows Credential Manager."
  ],
  "updatedAtEpochMs": 1710000000000,
  "entries": [
    {
      "key": "provider.openai.api_key",
      "provider": "openai",
      "purpose": "Desktop AI runtime credential for openai.",
      "updatedAtEpochMs": 1710000000000,
      "isConfigured": true
    }
  ]
}
```

Provider config write input:

```json
{
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o",
  "setAsDefault": true
}
```

Secret write input:

```json
{
  "key": "provider.openai.api_key",
  "provider": "openai",
  "purpose": "Desktop AI runtime credential for openai.",
  "value": "sk-..."
}
```

Prompt stream start input:

```json
{
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o",
  "prompt": "Summarize the desktop runtime boundary.",
  "systemPrompt": "Respond in concise English."
}
```

Prompt stream start receipt:

```json
{
  "requestId": "4a4f7b6f-1f25-4b6d-a1a8-0b83e5c7023d",
  "provider": "openai",
  "model": "gpt-4o",
  "eventName": "desktop://ai-stream",
  "startedAtEpochMs": 1710000000000
}
```

Incremental event payload:

```json
{
  "requestId": "4a4f7b6f-1f25-4b6d-a1a8-0b83e5c7023d",
  "provider": "openai",
  "model": "gpt-4o",
  "kind": "delta",
  "startedAtEpochMs": 1710000000000,
  "emittedAtEpochMs": 1710000001200,
  "finishedAtEpochMs": null,
  "chunkIndex": 3,
  "deltaText": "desktop",
  "accumulatedText": "RoleRover desktop",
  "errorMessage": null
}
```

Rules:

1. `get_secret_inventory_snapshot` may expose secret descriptors and presence only; it must never return plaintext secret values.
2. `update_ai_provider_settings` persists the selected provider's `baseUrl` / `model` under the desktop workspace settings document and may also flip `defaultProvider`.
3. `write_secret_value` must prefer the Windows OS keyring backend for new writes, update the manifest descriptor list, and only retain fallback storage when migration debt still exists; clearing or missing values must not silently claim success.
4. `start_ai_prompt_stream` resolves provider config and secret from the desktop workspace contract, not from browser local storage or web request headers.
5. PR5 validates the OpenAI-compatible streaming path first. Unsupported providers must fail explicitly instead of pretending native parity.
6. Renderer consumers must filter `desktop://ai-stream` events by `requestId` and build the final transcript from `deltaText` / `accumulatedText`.
7. Future providers extend by adding dispatcher branches behind the same command + event contract; the renderer event model must stay stable.

## Template Validation Contract

Rust commands:

- File: `desktop/src-tauri/src/lib.rs`
- Commands:
  - `get_template_validation_snapshot`
  - `write_template_validation_export`

Read payload:

```json
{
  "source": "workspace_documents",
  "representativeTemplates": ["classic", "modern"],
  "documents": [
    {
      "metadata": {
        "id": "resume-1",
        "title": "Classic Contract Baseline",
        "template": "classic",
        "language": "en",
        "targetJobTitle": "Senior Product Engineer",
        "targetCompany": "RoleRover",
        "isDefault": true,
        "isSample": false,
        "createdAtEpochMs": 1710000000000,
        "updatedAtEpochMs": 1710000000000
      },
      "theme": {
        "primaryColor": "#111827",
        "accentColor": "#2563eb",
        "fontFamily": "Inter",
        "fontSize": "medium",
        "lineSpacing": 1.6,
        "margin": { "top": 24, "right": 24, "bottom": 24, "left": 24 },
        "sectionSpacing": 16,
        "avatarStyle": "circle"
      },
      "sections": [
        {
          "id": "section-1",
          "documentId": "resume-1",
          "sectionType": "summary",
          "title": "Summary",
          "sortOrder": 1,
          "visible": true,
          "content": { "text": "..." },
          "createdAtEpochMs": 1710000000000,
          "updatedAtEpochMs": 1710000000000
        }
      ]
    }
  ]
}
```

Allowed `source` values:

- `workspace_documents`
- `native_sample_documents`
- `workspace_plus_native_sample_documents`
- `browser_fallback_sample`

Write input:

```json
{
  "fileName": "classic-contract-baseline-classic.html",
  "outputPath": "C:/Users/Avery/Desktop/classic-contract-baseline-classic.html",
  "html": "<!DOCTYPE html>..."
}
```

Write success payload:

```json
{
  "fileName": "classic-contract-baseline-classic.html",
  "outputPath": "C:/Users/.../workspace/exports/classic-contract-baseline-classic.html",
  "bytesWritten": 24567
}
```

Rules:

1. `get_template_validation_snapshot` must return representative `classic` / `modern` documents from workspace storage when present, and may fill gaps with clearly marked native sample documents (`metadata.isSample=true`).
2. `desktop/src/lib/template-validation.ts` must normalize the snapshot into shared `Resume` input before calling the unified template renderer.
3. `write_template_validation_export` may write to a user-selected system path when `outputPath` is provided; otherwise it may fall back to the workspace `exports` directory for validation flows. In both cases it must normalize `.html`, reject invalid parentless paths, and return the final resolved output path.
4. Browser fallback may preview representative sample HTML, but it must not claim native export success.

## Window State Contract

Files:

- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/src/storage.rs`
- `desktop/src-tauri/src/settings.rs`
- `desktop/src-tauri/src/workspace.rs`

Rules:

1. Native startup may restore the main window geometry from `workspace_settings.window_state_json` only when the persisted document still has `window.rememberWindowState=true` and the stored JSON is valid; imported legacy window-state payloads must be rewritten through this command path to prove the runtime read them.
2. Restoration applies the previously recorded normal bounds (after clamping to the desktop shell's supported minima/maxima) and replays any persisted `maximized` or `fullscreen` flags without overwriting the normal-bounds snapshot so the next session can resume at the same size if the user exits in a maximized/fullscreen mode.
3. Native window events such as `Moved`, `Resized`, and `ScaleFactorChanged` must refresh the in-memory normal-bounds snapshot, while `CloseRequested` / `Destroyed` must persist the latest normal bounds plus any `maximized` / `fullscreen` state into `workspace_settings.window_state_json`.
4. Browser fallback may surface the `rememberWindowState` toggle but must never claim real persistence is active.

## Tray Contract

Files:

- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/tauri.conf.json`

Rules:

1. Native startup may create a single system tray icon only when the default window icon is available; tray boot failures must log explicitly and must not abort the desktop shell.
2. The tray menu must expose concrete shell actions (`Show RoleRover`, `Hide To Tray`, `Quit`) against the main window instead of placeholder items.
3. Tray click handling may restore and focus the hidden main window; menu-driven quit must exit the shell cleanly instead of leaving background zombie processes.
4. Browser fallback must never imply that tray affordances are active or testable there.

## Release Readiness Contract

Files:

- `desktop/src-tauri/src/release.rs`
- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src/lib/desktop-api.ts`
- `desktop/src/lib/desktop-loaders.ts`
- `desktop/src/routes/settings.tsx`
- `scripts/verify-desktop-release-readiness.mjs`

Rust command:

- `get_release_readiness_snapshot`
- `check_for_app_update`

Read payload:

```json
{
  "bundleActive": true,
  "updaterPluginWired": true,
  "updaterConfigDeclared": true,
  "updaterConfigured": true,
  "updaterArtifactsEnabled": true,
  "updaterArtifactsMode": "current",
  "updaterEndpointCount": 1,
  "updaterPubkeyConfigured": true,
  "updaterDangerousInsecureTransport": true,
  "updaterUsesLocalhost": true,
  "updaterWindowsInstallMode": "passive",
  "trayIconReady": true,
  "rememberWindowStateEnabled": true,
  "blockers": [],
  "warnings": [
    "Updater config allows insecure transport so the local smoke feed can run over HTTP.",
    "Updater endpoint currently targets localhost, which is suitable for local smoke only."
  ],
}
```

Rules:

1. The native desktop runtime must wire `tauri-plugin-updater` during bootstrap even if the renderer does not expose a user-facing update button yet.
2. `tauri.conf.json` must declare `plugins.updater` with a feed endpoint and public key, and any localhost / insecure transport fallback must stay visible as warnings instead of being treated as production-ready hosting.
3. `bundle.createUpdaterArtifacts` must be enabled so the native build emits signed updater payloads instead of only wiring the runtime plugin.
4. `settings.tsx` must surface release blockers and warnings from the snapshot so PR6 can track truthful release posture inside the native shell.
5. Browser fallback must return an explicitly blocked placeholder snapshot and must not imply real release readiness.
6. `check_for_app_update` must fail explicitly when the feed is unreachable and must return parsed remote version metadata when the local smoke feed is running.

## UI Truthfulness Contract

Pages:

- `desktop/src/routes/root.tsx`
- `desktop/src/routes/home.tsx`
- `desktop/src/routes/dashboard.tsx`
- `desktop/src/routes/editor.tsx`
- `desktop/src/routes/templates.tsx`
- `desktop/src/routes/settings.tsx`

Rules:

1. Root shell must show runtime mode, native-command readiness, and fallback limitations.
2. `home.tsx` must map fallback runtime to:
   - `workspaceStateFallback`
   - `migrationStateNeedsDesktop`
3. `dashboard.tsx` must not present fallback storage as initialized native storage.
4. `templates.tsx` template validation lane must show whether representative documents came from workspace data, native samples, or browser fallback.
5. `templates.tsx` must disable native export actions in browser fallback mode and surface saved, cancelled, and write-error outcomes explicitly instead of silently succeeding.
6. `settings.tsx` must not present fallback vault/settings snapshots as proof of native desktop readiness.
7. `settings.tsx` AI controls must disable native config writes and prompt streaming in browser fallback mode.
8. `settings.tsx` must show whether the selected provider secret is configured and must state that PR5 validates the OpenAI-compatible streaming path first.

## Validation And Error Matrix

| Boundary | Input | Success | Failure | UI / Runtime Expectation |
|---|---|---|---|---|
| Tauri startup -> frontend dev server | `beforeDevCommand`, `devUrl=1420` | Vite listens on `127.0.0.1:1420` | Wrong cwd or wrong command path | `tauri dev` fails early; fix command path instead of changing renderer contract |
| Renderer -> `get_bootstrap_context` | Tauri command available | `runtimeMode="tauri"` and `supportsNativeCommands=true` | Tauri API unavailable | Renderer falls back to `browser_fallback` and logs the failing command |
| Renderer -> workspace/storage/settings snapshots | Matching Tauri commands available | Real native paths and statuses | Command throws / browser runtime | Placeholder snapshot returned; page must mark it as fallback-only |
| Renderer -> `get_secret_inventory_snapshot` | Native secrets manifest or fallback exists | Descriptor-only inventory returns, with no plaintext secret values | Command throws / browser runtime | Placeholder inventory returns and UI marks the surface as fallback-only |
| Renderer -> `get_template_validation_snapshot` | Workspace has representative templates | Representative documents render from workspace data | No representative docs available | Rust returns native sample docs and UI labels the source honestly |
| Renderer -> `write_template_validation_export` | Valid HTML + writable user-selected path or workspace exports dir | HTML file lands at the selected system path (or workspace fallback path) and receipt returns final path | Browser fallback / cancelled save dialog / write failure / invalid path | Export button stays disabled in fallback; UI shows cancelled or explicit error state |
| Native startup / window events -> `workspace_settings.window_state_json` | Desktop runtime active + `rememberWindowState=true` | Main window reapplies the most recent normal bounds plus any `maximized`/`fullscreen` flags, while move/resize/close events persist the updated geometry | Browser fallback / invalid stored JSON / native window event wiring failure | Runtime logs a warning, fallback mode stays explicit, and the shell reverts to the default geometry without claiming persistence |
| Native startup / tray events -> system tray icon + tray menu | Desktop runtime active + default icon available | Tray icon exposes Show / Hide To Tray / Quit actions and tray interaction can restore the main window | Browser fallback / missing icon / tray init failure | Runtime logs the tray failure explicitly and keeps the main window shell usable without pretending tray support |
| Renderer -> `get_release_readiness_snapshot` | Native desktop runtime + Tauri config available | Settings page shows the real bundling/updater/tray/window-state posture with blockers when needed | Browser fallback / config gaps / missing updater feed/signing | Fallback stays explicitly blocked and native UI keeps incomplete updater chains visible instead of implying parity |
| Renderer -> `check_for_app_update` | Native desktop runtime + running updater feed | Settings page reports current/latest versions or an available update without leaving the app | Browser fallback / unreachable feed / invalid latest.json | UI shows an explicit updater check error and keeps local smoke limitations visible |
| Renderer -> `update_ai_provider_settings` | Provider, base URL, model are valid | Settings document is persisted and subsequent reads reflect the change | Browser fallback / invalid provider / empty model or base URL | UI shows explicit error; no silent fallback write |
| Renderer -> `write_secret_value` | Valid secret key contract + non-empty value | Secret manifest and vault fallback update together | Browser fallback / invalid key / file write failure | UI shows explicit error; plaintext secret never echoes back to renderer |
| Renderer -> `start_ai_prompt_stream` | Supported provider + saved secret + prompt | Start receipt returns and `desktop://ai-stream` emits started / delta / completed events | Unsupported provider / missing secret / upstream error | UI shows explicit failure state and event log captures the error |
| Page state mapping | `BootstrapContext` | Runtime-specific labels and warnings | Raw status shown without runtime check | UI becomes misleading and PR1 is not complete |

## Good / Base / Bad Cases

### Good

- `pnpm dev:tauri` starts Vite on `1420`
- `root.tsx` shows native runtime badge
- `dashboard.tsx` shows real SQLite version instead of `browser-fallback`
- `templates.tsx` renders representative `classic` / `modern` previews and writes HTML exports to a user-selected system path through the native save dialog
- Desktop window restores the last geometry (including maximized/fullscreen state) after restart and honors the `rememberWindowState` toggle.
- Native tray icon can hide the window, restore it from the tray, and quit the desktop shell without placeholder behavior.
- `build:desktop:updater-feed` emits a signed local `latest.json`, and settings can perform a native updater check against the local smoke feed.
- `settings.tsx` saves an OpenAI-compatible provider config + API key into the desktop workspace and streams an assistant response through `desktop://ai-stream`

### Base

- Opening the renderer directly in a browser returns fallback context
- Pages still render, but root/home/library/settings all display fallback messaging and limitations
- Template validation previews may render fallback samples, but export actions remain disabled
- Settings may preview provider contracts, but config writes and native AI streaming stay unavailable
- Tray behavior is intentionally unavailable in browser fallback; tray checks wait for the native desktop shell.
- Release readiness stays blocked in browser fallback and does not claim real updater posture.
- Local updater smoke may still warn that transport is HTTP/localhost until a hosted HTTPS feed replaces it.

### Bad

- `tauri.conf.json` points `beforeDevCommand` at the repo-root Next.js stack
- Renderer infers fallback by string-matching ad hoc runtime text only
- Fallback snapshots render `created` / `cleanWorkspace` / `Initialized` without a fallback warning
- Export UI claims success without a native write receipt from `write_template_validation_export`
- Tray menu items exist but do nothing, or tray boot failure silently removes the feature without logging.
- Settings UI implies updater parity even though feed/signing/artifact requirements are still missing.
- Settings UI claims a provider is stream-ready without a saved secret or while browser fallback is active
- Renderer consumes all `desktop://ai-stream` events globally without filtering by `requestId`
- Desktop window always opens at the default size and ignores the previously persisted maximized/fullscreen state.

## Required Tests And Assertion Points

Manual assertions:

1. Run `pnpm dev:tauri`; confirm `http://127.0.0.1:1420` responds and the desktop shell opens.
2. In the desktop shell, confirm root banner shows native runtime mode and no fallback limitations.
3. In a browser-only renderer context, confirm root banner shows fallback mode and limitations.
4. In the desktop shell, confirm `templates.tsx` shows the template validation lane with representative `classic` / `modern` templates.
5. Trigger HTML export from the native desktop shell, choose a custom system save path, and confirm the returned path matches the selected location.
6. Trigger the same export flow and cancel the save dialog; confirm the UI reports a cancelled outcome and no file is written.
7. Confirm browser fallback keeps the template validation lane visible but disables native export.
8. In the native desktop shell, save an OpenAI-compatible provider config and API key from `settings.tsx`.
9. Run the native AI smoke test from `settings.tsx` and confirm the event log shows started / delta / completed (or explicit error) for the returned `requestId`.
10. Confirm browser fallback keeps the AI controls visible but disables config writes and native streaming.
11. Confirm library/settings copy changes between native and fallback modes.
12. Resize or move the desktop window, close the app, and confirm the next launch restores the latest normal bounds while replaying any maximized/fullscreen state active at exit.
13. Toggle between normal, maximized, and fullscreen states, close the shell, and confirm the restored session replays the flags while keeping the normal bounds updated for future runs.
14. In the native desktop shell, confirm the tray icon can hide the window, restore it from tray interaction, and exit cleanly through the tray menu.
15. In the native desktop shell, confirm settings show updater wiring plus local-smoke warnings for localhost / insecure transport.
16. Run `pnpm run verify:desktop:release-readiness` and confirm it passes with warnings once updater feed, signing pubkey, and artifacts are configured.
17. Run `pnpm run build:desktop:updater-feed`, start `pnpm run serve:desktop:updater-feed`, and confirm Settings can execute a native updater check against the local smoke feed.

Automated / static assertions:

1. `pnpm --filter @rolerover/desktop build`
2. `cargo check --manifest-path desktop/src-tauri/Cargo.toml --target-dir .codex-cargo-target/desktop-tauri`
3. `pnpm run lint:desktop:active`
4. `pnpm run lint:desktop:shared`
5. `pnpm lint` as repo-wide observation
6. `pnpm --filter @rolerover/desktop exec tsc -b`



