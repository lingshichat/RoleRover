# Desktop Runtime Boundary

> Purpose: Define the executable cross-layer contract for the PR1 desktop shell boundary between the React/Vite renderer and the Tauri/Rust command layer.

## Scope

This contract covers the bootstrap-stage desktop shell in `desktop/`:

1. Tauri starts the desktop-local Vite dev/build pipeline
2. Rust exposes bootstrap/runtime commands
3. Renderer requests runtime/workspace/settings snapshots through Tauri commands
4. Renderer can request representative template validation snapshots and native HTML export writes through Tauri commands
5. Renderer falls back to explicit placeholder data only when Tauri commands are unavailable
6. UI must surface fallback limitations instead of presenting fallback data as native readiness

## Files

- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/src/storage.rs`
- `desktop/src/lib/desktop-api.ts`
- `desktop/src/lib/template-validation.ts`
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

1. `get_bootstrap_context`, `get_workspace_snapshot`, `get_storage_snapshot`, `get_workspace_settings_snapshot`, `get_secret_vault_status`, `get_importer_dry_run`, and `get_template_validation_snapshot` must route through `invokeWithFallback(...)`.
2. Fallback reads must log the failing command name via `reportDesktopFallback(...)`.
3. Renderer pages must use `isBrowserFallbackRuntime(context)` instead of string-matching raw runtime text.
4. Native write commands such as `write_template_validation_export` must not silently fall back; write failures should surface as explicit UI errors.

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
  "fileName": "classic-contract-baseline-classic",
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
3. `write_template_validation_export` must only write inside the workspace `exports` directory, sanitize the requested file name, enforce `.html`, and return the final resolved output path.
4. Browser fallback may preview representative sample HTML, but it must not claim native export success.

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
4. `library.tsx` template validation lane must show whether representative documents came from workspace data, native samples, or browser fallback.
5. `library.tsx` must disable native export actions in browser fallback mode and surface write errors instead of silently succeeding.
6. `settings.tsx` must not present fallback vault/settings snapshots as proof of native desktop readiness.

## Validation And Error Matrix

| Boundary | Input | Success | Failure | UI / Runtime Expectation |
|---|---|---|---|---|
| Tauri startup -> frontend dev server | `beforeDevCommand`, `devUrl=1420` | Vite listens on `127.0.0.1:1420` | Wrong cwd or wrong command path | `tauri dev` fails early; fix command path instead of changing renderer contract |
| Renderer -> `get_bootstrap_context` | Tauri command available | `runtimeMode="tauri"` and `supportsNativeCommands=true` | Tauri API unavailable | Renderer falls back to `browser_fallback` and logs the failing command |
| Renderer -> workspace/storage/settings snapshots | Matching Tauri commands available | Real native paths and statuses | Command throws / browser runtime | Placeholder snapshot returned; page must mark it as fallback-only |
| Renderer -> `get_template_validation_snapshot` | Workspace has representative templates | Representative documents render from workspace data | No representative docs available | Rust returns native sample docs and UI labels the source honestly |
| Renderer -> `write_template_validation_export` | Valid HTML + writable exports dir | HTML file lands in workspace `exports` and receipt returns final path | Browser fallback / write failure / invalid path | Export button stays disabled in fallback or UI shows explicit error state |
| Page state mapping | `BootstrapContext` | Runtime-specific labels and warnings | Raw status shown without runtime check | UI becomes misleading and PR1 is not complete |

## Good / Base / Bad Cases

### Good

- `pnpm dev:tauri` starts Vite on `1420`
- `root.tsx` shows native runtime badge
- `library.tsx` shows real SQLite version instead of `browser-fallback`
- `library.tsx` renders representative `classic` / `modern` previews and writes HTML exports into the workspace `exports` directory

### Base

- Opening the renderer directly in a browser returns fallback context
- Pages still render, but root/home/library/settings all display fallback messaging and limitations
- Template validation previews may render fallback samples, but export actions remain disabled

### Bad

- `tauri.conf.json` points `beforeDevCommand` at the repo-root Next.js stack
- Renderer infers fallback by string-matching ad hoc runtime text only
- Fallback snapshots render `created` / `cleanWorkspace` / `Initialized` without a fallback warning
- Export UI claims success without a native write receipt from `write_template_validation_export`

## Required Tests And Assertion Points

Manual assertions:

1. Run `pnpm dev:tauri`; confirm `http://127.0.0.1:1420` responds and the desktop shell opens.
2. In the desktop shell, confirm root banner shows native runtime mode and no fallback limitations.
3. In a browser-only renderer context, confirm root banner shows fallback mode and limitations.
4. In the desktop shell, confirm `library.tsx` shows the template validation lane with representative `classic` / `modern` templates.
5. Trigger HTML export from the native desktop shell and confirm the returned path points inside the workspace `exports` directory.
6. Confirm browser fallback keeps the template validation lane visible but disables native export.
7. Confirm library/settings copy changes between native and fallback modes.

Automated / static assertions:

1. `pnpm --filter @rolerover/desktop build`
2. `cargo check --manifest-path desktop/src-tauri/Cargo.toml --target-dir .codex-cargo-target/desktop-tauri`
3. `pnpm exec eslint` on touched desktop route / API files
4. `pnpm --filter @rolerover/desktop exec tsc -b`
