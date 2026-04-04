<div align="center">

# RoleRover

**Desktop-first AI-assisted resume workspace, maintained as a derivative of JadeAI**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows--first-0078d4)](./desktop)

[中文文档](./README.zh-CN.md)

</div>

> RoleRover is our maintained fork of [JadeAI](https://github.com/twwch/JadeAI).
> The current shipping direction is a client-only desktop app.
> Web deployment and Docker-first release instructions are intentionally deprecated in this repository.

## Why RoleRover

Compared with the original JadeAI web-first posture, RoleRover is being shaped around a simpler desktop product loop:

- Download the release package, install, and start using it without standing up a web deployment stack
- Favor a more direct single-user workflow with fewer browser-to-server handoffs in the main product path
- Push core resume work closer to the local desktop runtime, including imports, exports, updater flow, tray behavior, and workspace persistence
- Keep AI provider settings and credentials under the user's local control instead of treating the product as a hosted service first
- Focus the current release surface on Windows, then extend to macOS after the desktop release path is fully stable

## Current Direction

- Desktop client first, with Tauri as the supported release runtime
- Windows installers and updater metadata are produced through GitHub Actions and GitHub Releases
- Users should install RoleRover from GitHub Releases instead of deploying a web stack
- Pushing a matching `vX.Y.Z` tag creates a draft release for human smoke testing before publish
- The root `package.json` version is the single source of truth for desktop versioning
- Windows is the current supported platform; macOS is planned next
- Legacy web and server code still exists in the repo as migration surface, but it is not the primary product path

## What You Get Today

- Drag-and-drop resume editor with inline editing and autosave
- 50 resume templates with theme customization and multi-format export
- AI resume generation, resume parsing, JD matching, cover letter generation, translation, and writing review
- English and Chinese UI
- Native desktop shell with tray and window-state persistence, local import and export, and updater wiring
- Client-local AI provider settings and secrets; the desktop runtime prefers OS keyring-backed storage when available
- Product direction that prioritizes lower setup friction and a tighter local editing loop over browser deployment complexity

## Repository Status

| Item | Status |
|------|--------|
| Public product name | `RoleRover` |
| Current maintained repo | [`lingshichat/RoleRover`](https://github.com/lingshichat/RoleRover) |
| Upstream base | [`twwch/JadeAI`](https://github.com/twwch/JadeAI) |
| Supported release path | Tauri desktop release via GitHub Releases |
| Current formal release channel | `stable` |
| Supported platform today | Windows |
| Planned next platform | macOS |
| License | [Apache License 2.0](./LICENSE) |
| Attribution | See [NOTICE](./NOTICE) |

## Screenshots

| Template Gallery | Resume Editor |
|:---:|:---:|
| ![Template Gallery](images/template-list.png) | ![Resume Editor](images/resume-edit.png) |

| AI Resume Generation | Shared Resume |
|:---:|:---:|
| ![AI Resume Generation](images/AI%20填充简历.gif) | ![Shared Resume Page](images/简历分享页.png) |

## Getting Started

### Download And Install

1. Open [GitHub Releases](https://github.com/lingshichat/RoleRover/releases).
2. Download the latest Windows installer package, usually `.exe` or `.msi`.
3. Install RoleRover and launch it like a normal desktop app.

Current platform support:

- Windows is supported now
- macOS is planned in a later desktop release stage

### Prerequisites

- Node.js 20+
- pnpm 9+
- For `pnpm run dev:tauri` or release builds on Windows: the Tauri 2 native toolchain, including Rust stable and the MSVC build prerequisites

### Installation

```bash
git clone https://github.com/lingshichat/RoleRover.git
cd RoleRover

pnpm install
```

### Development Modes

#### 1. Fast renderer iteration in the browser

```bash
pnpm --filter @rolerover/desktop run dev
```

Open `http://127.0.0.1:1420`.

This mode is only for fast UI iteration. Native Tauri commands fall back to placeholder data, so it is not sufficient for validating filesystem access, secrets, imports, exports, updater behavior, tray behavior, or release readiness.

#### 2. Full native desktop shell

```bash
pnpm run dev:tauri
```

This starts the desktop renderer plus the native Tauri shell so you can validate real desktop behavior end to end.

#### 3. Local updater smoke test

```bash
pnpm run dev:tauri:local-updater
```

Use this when you want the native shell to check updates against a temporary localhost feed instead of the hosted GitHub Release feed.

Local signing notes:

- Keep the private signing key at `desktop/.tauri/updater.key`
- Keep the signing password in ignored local config such as `.env.local`
- See [`desktop/dev-updater/README.md`](./desktop/dev-updater/README.md) for the full signed local feed flow

> `pnpm dev`, `pnpm dev:web`, Docker, and server-oriented workflows still exist in the repository as migration tooling, but they are no longer the recommended starting point for RoleRover product work.

## Common Commands

| Command | Description |
|---------|-------------|
| `pnpm --filter @rolerover/desktop run dev` | Run the desktop renderer in browser-only preview mode on `127.0.0.1:1420` |
| `pnpm run dev:tauri` | Start the Tauri desktop app with native runtime access |
| `pnpm run dev:tauri:local-updater` | Start the Tauri app with a temporary localhost updater override for smoke testing |
| `pnpm lint` | Run desktop/shared blocking lint and report pure web-reference lint debt without failing the desktop product line |
| `pnpm run lint:web:reference` | Run strict lint for the web-reference surface when you intentionally work there, without turning it into a desktop release gate |
| `pnpm run report:web:reference` | Report archived web-reference lint debt without failing the desktop product line |
| `pnpm run lint:repo:full` | Run the full legacy repo ESLint sweep, including deprecated web/reference surfaces |
| `pnpm run sync:desktop-version` | Sync desktop package, Tauri, and Cargo versions from the root `package.json` |
| `pnpm run verify:desktop:version-sync` | Fail if desktop version files drift from the root `package.json` |
| `pnpm run verify:desktop:migration` | Run the current desktop migration verification gate |
| `pnpm run verify:desktop:release-readiness` | Check updater, signing, tray, and release config readiness |
| `pnpm run build:tauri` | Build the signed Tauri desktop artifacts |
| `pnpm run build:desktop:release-updater-manifest` | Generate GitHub Release-ready `latest.json` updater metadata |
| `pnpm run build:desktop:updater-feed` | Generate a signed local updater feed for smoke testing |
| `pnpm run serve:desktop:updater-feed` | Serve the generated local updater feed on localhost |

## GitHub Release Workflow

1. Bump the root [`package.json`](./package.json) version.
2. Run `pnpm run sync:desktop-version`.
3. Commit the version sync changes.
4. Create and push a matching `vX.Y.Z` tag.
5. GitHub Actions runs [`.github/workflows/release-desktop.yml`](./.github/workflows/release-desktop.yml), verifies the desktop release gate, builds the signed Windows artifacts, generates `latest.json`, and creates a draft GitHub Release.
6. Download the draft assets and run a minimum smoke pass:
   - install the generated `.exe` or `.msi`
   - confirm the app launches normally
   - confirm update checking can reach the hosted feed
   - spot-check a representative resume open or export flow
7. Publish the draft release after the smoke pass succeeds.

Required GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Current release posture:

- Tagged releases currently create `stable` draft releases
- The production updater feed is GitHub-hosted `latest.json`
- Beta channel support can be added later without changing the single-version-source rule

## Project Layout

```text
desktop/                  # Desktop renderer package (React + Vite + TanStack Router)
desktop/src-tauri/        # Native Tauri + Rust shell, updater, tray, window state
desktop/dev-updater/      # Local updater smoke-test feed assets and docs
src/                      # Shared product logic reused during the desktop migration
scripts/                  # Version sync, build, updater, and release-readiness tooling
.github/workflows/        # Desktop build and tagged release automation
```

## FAQ

<details>
<summary><b>Why do browser URLs still appear if the product is client-only?</b></summary>

The desktop renderer can still run in a browser-only preview mode on
`http://127.0.0.1:1420` for fast UI iteration. That mode is intentionally not a
shipping target and cannot prove native desktop behavior.

</details>

<details>
<summary><b>Where are AI provider settings and keys stored?</b></summary>

For the supported desktop runtime, provider settings stay local to the client
workspace and secrets are designed to prefer OS keyring-backed storage when the
runtime is available. Browser preview is only a development fallback.

</details>

<details>
<summary><b>Why do some files still mention JadeAI or older web/server flows?</b></summary>

Those references are mostly migration and attribution residue. We still retain
upstream attribution to JadeAI, and some shared web-era code remains in the
repo while the product surface moves to the desktop runtime.

</details>

## License And Attribution

This repository is a derivative work based on JadeAI and remains distributed
under the [Apache License 2.0](./LICENSE).

When redistributing or extending this fork:

- keep the Apache 2.0 license text
- retain upstream attribution notices
- mark modified files appropriately
- keep derivative-work attribution in [NOTICE](./NOTICE)
