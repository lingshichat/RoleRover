# Windows Release Smoke Checklist

Scope: Windows-first desktop release readiness for the current RoleRover Tauri runtime.

This checklist is intentionally honest about what is automatable in-repo and what still needs a human smoke pass on a packaged desktop build.

## How To Use This Checklist

- CI only checks that this checklist exists in the tracked repository.
- Release confidence still depends on a human running the smoke steps below on a real packaged app.
- You do not need to write a long report every time. A short pass/fail note with the version and date is enough.

Suggested lightweight record:

```text
Version: 0.1.0
Date: 2026-04-03
Tester: <name>
Native smoke: pass / fail
Packaged smoke: pass / fail
Notes: <short note if anything looks off>
```

## Automated Gates

Run these from the repo root:

```bash
pnpm run verify:desktop:migration
pnpm run report:desktop:release-readiness
pnpm run verify:desktop:release-readiness
pnpm run build:tauri
pnpm run build:desktop:updater-feed
```

Notes:

- `verify:desktop:migration` is the current blocking migration gate for type-check, desktop lint boundary, renderer build, and Rust `cargo check`.
- `report:desktop:release-readiness` prints the current Windows release status without failing the shell.
- `verify:desktop:release-readiness` fails when hard Windows release blockers remain.
- `build:tauri` is the packaging smoke command that should produce Windows bundle artifacts.
- `build:desktop:updater-feed` turns the signed updater artifact into `desktop/dev-updater/latest.json` for local updater smoke.

## Manual Native Smoke

Run these in the native desktop shell, not browser fallback:

1. Launch `pnpm dev:tauri` and confirm the shell boots with native runtime badges.
2. Open the template validation lane and export HTML to a user-chosen system path.
3. Cancel the same export flow and confirm the UI reports cancellation without writing a file.
4. Save an AI provider config and secret, then run the native AI smoke test from settings.
5. Resize or move the main window, close it, and confirm the next launch restores normal bounds.
6. Exit while maximized and while fullscreen, then confirm those flags replay on next launch.
7. Use the tray icon to hide, restore, and quit the app cleanly.
8. Start `pnpm run serve:desktop:updater-feed`, use Settings -> updater check, and confirm the native shell can read the local feed without contract errors.

## Packaged Windows Smoke

After `pnpm run build:tauri` succeeds:

1. Confirm Windows bundle artifacts exist under the generated bundle output directory.
2. Install or unpack the produced Windows artifact on a clean-enough local path.
3. Launch the packaged app and repeat the core smoke flow:
   - startup
   - export
   - AI smoke
   - window state
   - tray
4. Confirm the packaged app uses the checked-in desktop icon and exits without zombie background processes.

## Current Hard Blockers

These still need human validation before claiming Windows release readiness:

- A packaged Windows smoke pass has not been recorded yet from the current Tauri runtime.
- Every tagged release still needs a quick installer launch and core-flow check before publishing the GitHub draft release.

## Exit Criteria

Windows release readiness can be claimed only when:

- `verify:desktop:migration` passes.
- `verify:desktop:release-readiness` passes.
- `build:tauri` completes and produces usable Windows bundle artifacts.
- `build:desktop:updater-feed` produces a valid local `latest.json` with signed artifact metadata.
- The manual native smoke and packaged Windows smoke both complete without critical regressions.
