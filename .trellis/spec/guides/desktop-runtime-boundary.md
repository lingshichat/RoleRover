# Desktop Runtime Boundary

> Purpose: Define the executable cross-layer contract for the PR1 desktop shell boundary between the React/Vite renderer and the Tauri/Rust command layer.

## Scope

This contract covers the bootstrap-stage desktop shell in `desktop/`:

1. Tauri starts the desktop-local Vite dev/build pipeline
2. Rust exposes bootstrap/runtime commands
3. Renderer requests runtime/workspace/settings snapshots through Tauri commands
4. Renderer falls back to explicit placeholder data only when Tauri commands are unavailable
5. UI must surface fallback limitations instead of presenting fallback data as native readiness

## Files

- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/src/lib.rs`
- `desktop/src/lib/desktop-api.ts`
- `desktop/src/routes/root.tsx`
- `desktop/src/routes/home.tsx`
- `desktop/src/routes/library.tsx`
- `desktop/src/routes/settings.tsx`
- `desktop/src/i18n.ts`
- `scripts/dev-local.mjs`

## Local Commands

```bash
pnpm --filter @rolerover/desktop build
pnpm dev:tauri
cargo check --manifest-path desktop/src-tauri/Cargo.toml --target-dir .codex-cargo-target/desktop-tauri
pnpm exec eslint desktop/src/lib/desktop-api.ts desktop/src/i18n.ts desktop/src/routes/root.tsx desktop/src/routes/home.tsx desktop/src/routes/library.tsx desktop/src/routes/settings.tsx
```

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

1. `get_bootstrap_context`, `get_workspace_snapshot`, `get_storage_snapshot`, `get_workspace_settings_snapshot`, `get_secret_vault_status`, and `get_importer_dry_run` must route through `invokeWithFallback(...)`.
2. Fallback reads must log the failing command name via `reportDesktopFallback(...)`.
3. Renderer pages must use `isBrowserFallbackRuntime(context)` instead of string-matching raw runtime text.

## UI Truthfulness Contract

Pages:

- `desktop/src/routes/root.tsx`
- `desktop/src/routes/home.tsx`
- `desktop/src/routes/library.tsx`
- `desktop/src/routes/settings.tsx`

Rules:

1. Root shell must show runtime mode, native-command readiness, and fallback limitations.
2. `home.tsx` must map fallback runtime to:
   - `workspaceStateFallback`
   - `migrationStateNeedsDesktop`
3. `library.tsx` must not present fallback storage as initialized native storage.
4. `settings.tsx` must not present fallback vault/settings snapshots as proof of native desktop readiness.

## Validation And Error Matrix

| Boundary | Input | Success | Failure | UI / Runtime Expectation |
|---|---|---|---|---|
| Tauri startup -> frontend dev server | `beforeDevCommand`, `devUrl=1420` | Vite listens on `127.0.0.1:1420` | Wrong cwd or wrong command path | `tauri dev` fails early; fix command path instead of changing renderer contract |
| Renderer -> `get_bootstrap_context` | Tauri command available | `runtimeMode="tauri"` and `supportsNativeCommands=true` | Tauri API unavailable | Renderer falls back to `browser_fallback` and logs the failing command |
| Renderer -> workspace/storage/settings snapshots | Matching Tauri commands available | Real native paths and statuses | Command throws / browser runtime | Placeholder snapshot returned; page must mark it as fallback-only |
| Page state mapping | `BootstrapContext` | Runtime-specific labels and warnings | Raw status shown without runtime check | UI becomes misleading and PR1 is not complete |

## Good / Base / Bad Cases

### Good

- `pnpm dev:tauri` starts Vite on `1420`
- `root.tsx` shows native runtime badge
- `library.tsx` shows real SQLite version instead of `browser-fallback`

### Base

- Opening the renderer directly in a browser returns fallback context
- Pages still render, but root/home/library/settings all display fallback messaging and limitations

### Bad

- `tauri.conf.json` points `beforeDevCommand` at the repo-root Next.js stack
- Renderer infers fallback by string-matching ad hoc runtime text only
- Fallback snapshots render `created` / `cleanWorkspace` / `Initialized` without a fallback warning

## Required Tests And Assertion Points

Manual assertions:

1. Run `pnpm dev:tauri`; confirm `http://127.0.0.1:1420` responds and the desktop shell opens.
2. In the desktop shell, confirm root banner shows native runtime mode and no fallback limitations.
3. In a browser-only renderer context, confirm root banner shows fallback mode and limitations.
4. Confirm library/settings copy changes between native and fallback modes.

Automated / static assertions:

1. `pnpm --filter @rolerover/desktop build`
2. `cargo check --manifest-path desktop/src-tauri/Cargo.toml --target-dir .codex-cargo-target/desktop-tauri`
3. `pnpm exec eslint` on touched desktop route / API files

