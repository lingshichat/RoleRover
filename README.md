<div align="center">

# RoleRover

**Local-first AI resume workspace for Windows**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078d4)](./desktop)

[中文文档](./README.zh-CN.md)

</div>

RoleRover helps you write, tailor, and export resumes in a desktop app that keeps the main workflow close to your local machine. Install it, open your workspace, iterate with AI, and export polished resumes without setting up a server.

## Highlights

- Drag-and-drop resume editor with inline editing and autosave
- 50 resume templates with theme customization and export support
- AI-powered resume writing, resume parsing, JD matching, cover letter drafting, translation, and writing polish
- English and Chinese interface
- Local-first desktop experience with native import, export, window persistence, and in-app updates
- AI provider settings and secrets stay under the user's local control

## Screenshots

| Template Gallery | Resume Editor |
|:---:|:---:|
| ![Template Gallery](images/template-list.png) | ![Resume Editor](images/resume-edit.png) |

| AI Resume Generation | Shared Resume |
|:---:|:---:|
| ![AI Resume Generation](images/AI%20填充简历.gif) | ![Shared Resume Page](images/简历分享页.png) |

## Download

1. Open [GitHub Releases](https://github.com/lingshichat/RoleRover/releases).
2. Download the latest Windows installer, usually `.exe` or `.msi`.
3. Install RoleRover and launch it like a normal desktop app.

Current platform support:

- Windows is supported today
- macOS is planned next

## Why Desktop First

- No server setup is required for the main product workflow
- Resume editing, imports, exports, and update checks happen in a native desktop app
- Local configuration makes it easier to control AI providers and credentials yourself
- The product loop is optimized for a single-user workspace with less browser friction

## Build From Source

If you want to run RoleRover locally from source:

### Prerequisites

- Node.js 20+
- pnpm 9+
- For `pnpm run dev:tauri` or release builds on Windows: Rust stable and the Tauri 2 Windows toolchain

### Install

```bash
git clone https://github.com/lingshichat/RoleRover.git
cd RoleRover
pnpm install
```

### Run

```bash
pnpm run dev:tauri
```

This starts the desktop renderer and the native Tauri shell together.

## FAQ

<details>
<summary><b>Where are AI provider settings and keys stored?</b></summary>

In the supported desktop runtime, provider settings stay in the local client
workspace and secrets are designed to prefer OS keyring-backed storage when
available.

</details>

<details>
<summary><b>Why do some files or screenshots still mention JadeAI?</b></summary>

RoleRover is a maintained derivative of
[JadeAI](https://github.com/twwch/JadeAI). Some historical names remain in
older assets, shared code, or attribution files while the desktop product
continues to evolve under the RoleRover name.

</details>

## License And Attribution

RoleRover is distributed under the [Apache License 2.0](./LICENSE).

This repository is a derivative work based on JadeAI. When redistributing or
extending this project, keep the license text, upstream attribution, and the
derivative-work notice in [NOTICE](./NOTICE).
