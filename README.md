<div align="center">

# RoleRover

**AI-assisted resume workspace, maintained as a derivative of JadeAI**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed)](./Dockerfile)

[中文文档](./README.zh-CN.md)

</div>

> RoleRover is our maintained fork of [JadeAI](https://github.com/twwch/JadeAI).
> Most product-facing and technical identifiers in this repository now use
> `RoleRover`. Remaining `JadeAI` references are kept only where they describe
> the upstream project or the current repository path.

## Why This Fork Exists

- Keep an independently maintained roadmap and product positioning
- Replace upstream-oriented README, deployment, and branding defaults
- Keep the strong editor, AI, export, and sharing capabilities already in the codebase
- Transition to `RoleRover` incrementally instead of attempting a risky all-at-once rename

## What You Get Today

- Drag-and-drop resume editor with inline editing and autosave
- 50 resume templates with theme customization and multi-format export
- AI resume generation, resume parsing, JD matching, cover letter generation, translation, and writing review
- Share links with optional password protection
- SQLite by default, optional PostgreSQL
- English and Chinese UI
- Per-user AI settings stored in the browser instead of the server

## Fork Status

| Item | Status |
|------|--------|
| Public product name | `RoleRover` |
| Upstream base | [`twwch/JadeAI`](https://github.com/twwch/JadeAI) |
| Current maintained repo | `lingshichat/JadeAI` |
| License | [Apache License 2.0](./LICENSE) |
| Attribution | See [NOTICE](./NOTICE) |
| Rename strategy | Transitional: product branding and most technical identifiers now use `RoleRover`; upstream attribution remains intact |

## Screenshots

| Template Gallery | Resume Editor |
|:---:|:---:|
| ![Template Gallery](images/template-list.png) | ![Resume Editor](images/resume-edit.png) |

| AI Resume Generation | Shared Resume |
|:---:|:---:|
| ![AI Resume Generation](images/AI%20填充简历.gif) | ![Shared Resume Page](images/简历分享页.png) |

## Getting Started

### Local Development

#### Prerequisites

- Node.js 20+
- pnpm 9+

#### Installation

```bash
git clone https://github.com/lingshichat/JadeAI.git
cd JadeAI

pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

> The current GitHub/repository path still uses `JadeAI`, but the maintained
> product brand is `RoleRover`.

`pnpm dev` will:

- create `.env.local` from `.env.example` when needed
- ensure the `data/` directory exists
- start the Next.js app and the local Exa Pool MCP sidecar

If you need manual database maintenance, `pnpm db:migrate` and `pnpm db:seed`
remain available.

### Docker

This fork no longer assumes the upstream published image. Build and run the
local Dockerfile instead:

```bash
docker compose up --build -d
```

Or run it manually:

```bash
docker build -t rolerover:latest .

docker run -d -p 3000:3000 \
  --name rolerover \
  -e AUTH_SECRET=<your-generated-secret> \
  -v "$(pwd)/data:/app/data" \
  rolerover:latest
```

Generate `AUTH_SECRET` with:

```bash
openssl rand -base64 32
```

### Optional PostgreSQL

```bash
docker run -d -p 3000:3000 \
  --name rolerover \
  -e AUTH_SECRET=<your-generated-secret> \
  -e DB_TYPE=postgresql \
  -e DATABASE_URL=postgresql://user:pass@host:5432/rolerover \
  rolerover:latest
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | Yes | — | Secret key for session encryption |
| `DB_TYPE` | No | `sqlite` | Database type: `sqlite` or `postgresql` |
| `DATABASE_URL` | When PostgreSQL | — | PostgreSQL connection string |
| `SQLITE_PATH` | No | `./data/jade.db` | SQLite database file path |
| `NEXT_PUBLIC_AUTH_ENABLED` | No | `false` | Enable Google OAuth (`true`) or use fingerprint mode (`false`) |
| `GOOGLE_CLIENT_ID` | When OAuth | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | When OAuth | — | Google OAuth client secret |
| `NEXT_PUBLIC_APP_NAME` | No | `RoleRover` | Public app name shown in the UI |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Application URL |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | No | `zh` | Default locale: `zh` or `en` |
| `EXA_POOL_MCP_PORT` | No | `3334` | Local port used by the Exa Pool MCP sidecar |

## Common Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Bootstrap local env if needed, then start the Next.js dev server and local Exa Pool MCP sidecar |
| `pnpm dev:stack` | Start the Next.js dev server and local Exa Pool MCP sidecar without bootstrap |
| `pnpm dev:web` | Start only the Next.js dev server |
| `pnpm dev:mcp` | Start only the local Exa Pool MCP sidecar |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | TypeScript type checking |
| `pnpm --filter @rolerover/desktop run dev` | Run desktop UI pure in browser for fast iteration |
| `pnpm run tauri:dev` | Start the Tauri app with HMR to the native desktop shell |
| `pnpm db:generate` | Generate Drizzle migrations (SQLite) |
| `pnpm db:generate:pg` | Generate Drizzle migrations (PostgreSQL) |
| `pnpm db:migrate` | Execute database migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm db:seed` | Seed sample data |

## Project Structure

```text
src/
├── app/                  # Next.js App Router and route handlers
├── components/           # UI, editor, dashboard, preview, landing
├── hooks/                # Custom React hooks
├── lib/
│   ├── ai/               # Prompts, tools, model integration
│   ├── auth/             # NextAuth and fingerprint auth
│   └── db/               # Schema, repositories, seeds, migrations
├── stores/               # Zustand state
└── types/                # Shared TypeScript types
```

## Branding Transition Notes

- Public-facing docs and default app naming now use `RoleRover`
- The current GitHub repository name still uses `JadeAI`
- Upstream attribution references still point to `JadeAI`
- A future repo rename can happen later without blocking day-to-day development

## FAQ

<details>
<summary><b>How does AI configuration work?</b></summary>

RoleRover does not require server-side AI API keys. Each user configures their
own provider, API key, base URL, and model in **Settings > AI**. Keys stay in
browser storage and are not persisted by the server.

</details>

<details>
<summary><b>Can I switch between SQLite and PostgreSQL?</b></summary>

Yes. Set `DB_TYPE=sqlite` or `DB_TYPE=postgresql`. SQLite is the default and
requires zero additional setup. For PostgreSQL, also set `DATABASE_URL`.

</details>

<details>
<summary><b>Why do I still see `JadeAI` in a few places?</b></summary>

The remaining references are intentional. They point either to the upstream
project we forked from or to the current repository path, which has not been
renamed yet.

</details>

## License And Attribution

This repository is a derivative work based on JadeAI and remains distributed
under the [Apache License 2.0](./LICENSE).

When redistributing or extending this fork:

- keep the Apache 2.0 license text
- retain upstream attribution notices
- mark modified files appropriately
- keep derivative-work attribution in [NOTICE](./NOTICE)
