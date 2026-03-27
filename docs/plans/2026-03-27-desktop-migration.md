# Desktop Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Land the first executable Electron desktop migration slice for RoleRover without breaking the existing Next.js app structure.

**Architecture:** Keep Next.js App Router plus local route handlers intact, add an Electron shell around the standalone build, and progressively remove web-only product surfaces. Sensitive settings move behind a desktop bridge while non-sensitive settings stay in the existing API-backed flow.

**Tech Stack:** Next.js 16, React 19, Electron, next-electron-rsc, electron-builder, electron-updater, better-sqlite3, TypeScript/ESM scripts

---

### Task 1: Lock the Desktop Execution Slices

**Files:**
- Modify: `.trellis/tasks/03-26-desktop-migration/prd.md`
- Create: `docs/plans/2026-03-27-desktop-migration.md`

**Step 1: Confirm the PRD matches the final product call**

Check for these statements:
- Desktop-only scope
- Electron + Next.js standalone
- GitHub Releases auto-update
- safeStorage for sensitive keys
- Dashboard as default entry

**Step 2: Write the execution split**

Document these ownership slices:
- Electron shell and build chain
- Auth / landing cleanup
- Share removal
- Secure settings bridge

**Step 3: Keep the plan implementation-first**

Prefer small slices that can merge independently without changing the overall route.

### Task 2: Land the Electron Shell PoC

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`
- Create: `electron/main.mjs`
- Create: `electron/preload.mjs`
- Create: `electron/dev-runner.mjs`
- Create: `electron-builder.yml`
- Create: `resources/icon.ico` if packaging later needs it

**Step 1: Add Electron dependencies and scripts**

Add:
- `electron`
- `electron-builder`
- `electron-updater`
- `next-electron-rsc`

Add scripts for:
- desktop dev
- desktop build
- electron-only build helpers

**Step 2: Add the minimal main-process shell**

Implement:
- single BrowserWindow
- `contextIsolation: true`
- `nodeIntegration: false`
- preload bridge registration
- `next-electron-rsc` handler + interceptor
- window state persistence

**Step 3: Add the preload bridge**

Expose a narrow `window.roleRoverDesktop` API for:
- desktop detection
- app info
- secure setting get/set/delete

**Step 4: Add packaging config**

Configure Windows target, app files, and GitHub publish metadata placeholder.

### Task 3: Remove Web-Only Product Entry

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Modify: `src/app/[locale]/(auth)/login/page.tsx`
- Modify: `src/middleware.ts`
- Modify: `src/app/[locale]/dashboard/page.tsx`
- Modify: `src/components/auth/auth-guard.tsx`

**Step 1: Route the app into Dashboard by default**

Replace landing/login entry flow with dashboard-first desktop behavior.

**Step 2: Stop middleware auth redirects**

Keep locale routing only.

**Step 3: Keep fingerprint-based local identity**

Do not remove local request identity headers yet.

### Task 4: Remove Share Surface Safely

**Files:**
- Modify: `src/components/editor/share-dialog.tsx`
- Modify: `src/components/editor/editor-toolbar.tsx`
- Modify: `src/components/dashboard/resume-card.tsx`
- Modify: `src/app/[locale]/editor/[id]/page.tsx`
- Modify: `src/app/[locale]/share/[token]/page.tsx`
- Modify: `src/app/api/share/[token]/route.ts`
- Modify: `src/app/api/resume/[id]/share/route.ts`
- Modify: `src/app/api/resume/[id]/shares/route.ts`
- Modify: `src/app/api/resume/[id]/shares/[shareId]/route.ts`

**Step 1: Remove share actions from UI**

Keep the editor and dashboard compiling without share flows.

**Step 2: Retire public share endpoints**

Return a clear unsupported or not-found response instead of live sharing behavior.

### Task 5: Move Sensitive Settings Behind the Desktop Bridge

**Files:**
- Create: `src/lib/desktop/client.ts`
- Modify: `src/stores/settings-store.ts`
- Modify: `src/components/settings/settings-dialog.tsx`
- Create: `src/types/desktop.d.ts`

**Step 1: Create a renderer-safe desktop client**

The client should:
- detect whether Electron bridge exists
- read secure settings from Electron when available
- fall back to browser storage in non-desktop mode

**Step 2: Update the settings store**

Keep:
- provider, base URL, model, auto-save in current store flow

Move:
- AI API key
- Exa Pool API key

**Step 3: Keep UI mostly unchanged**

No redesign in this slice; focus on behavior.

### Task 6: Verify the PoC

**Files:**
- Verify: `package.json`
- Verify: `next.config.ts`
- Verify: `electron/**`
- Verify: desktop route and settings changes

**Step 1: Run static verification**

Run:
- `npm run type-check`
- `npm run lint`

**Step 2: Run desktop smoke checks**

Verify:
- Electron shell opens
- dashboard loads
- one local API request succeeds
- secure settings bridge is callable

**Step 3: Record remaining gaps**

If PDF bundling, data-dir migration, tray, or auto-update are not fully closed, capture them as next slices rather than bloating the PoC.
