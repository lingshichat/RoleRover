# Desktop Lint Boundary And Debt Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the current desktop migration lint expectations into an explicit, reproducible quality gate that blocks active desktop regressions without requiring repo-wide legacy lint cleanup first.

**Architecture:** Keep repo-wide `pnpm lint` as an observation signal, define a smaller hard-gate command set for the active desktop and shared migration surface, and store non-blocking repo debt in a task-local baseline. Codify the gate in scripts/package commands and document the blocking-versus-observation rules in Trellis docs so future sessions use the same acceptance language.

**Tech Stack:** pnpm, ESLint 9, TypeScript 5, Vite/Tauri desktop shell, Rust cargo check, Trellis task/workflow docs

---

### Task 1: Freeze The Verified Baseline

**Files:**
- Modify: `.trellis/tasks/03-31-lint-boundary-and-debt-split/prd.md`
- Create: `.trellis/tasks/03-31-lint-boundary-and-debt-split/research.md`
- Create: `.trellis/tasks/03-31-lint-boundary-and-debt-split/lint-debt-baseline.md`
- Create: `docs/plans/2026-03-31-lint-boundary-and-debt-split.md`

**Step 1: Re-run the verified command set and confirm the same shape**

Run:
- `pnpm lint`
- `pnpm type-check`
- `pnpm --filter @rolerover/desktop build`
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml --target-dir .codex-cargo-target/desktop-tauri`

Expected:
- repo lint still fails mostly outside the desktop active slice
- repo type-check passes
- desktop build passes
- cargo check passes

**Step 2: Group every current failure into one of three buckets**

Buckets:
- `desktop-active`
- `shared-active`
- `legacy-repo-debt`

**Step 3: Write the baseline docs before touching scripts**

Record:
- exact command outcomes
- active surface file list
- which debt remains visible but non-blocking

### Task 2: Codify The Hard Gate Commands

**Files:**
- Modify: `package.json`
- Create: `scripts/verify-desktop-lint-boundary.mjs`
- Modify: `eslint.config.mjs`

**Step 1: Add named scripts for the migration gate**

Add scripts such as:
- `lint:desktop:active`
- `lint:desktop:shared`
- `verify:desktop:migration`

Keep `pnpm lint` unchanged as the repo-wide observation command.

**Step 2: Centralize the file groups in one script**

The script should define:
- desktop active files
- shared active files
- optional touched-file support for future slices

Do not duplicate long file lists across multiple package scripts.

**Step 3: Keep the blocking rule simple**

Rule:
- errors in the hard gate block the slice
- repo-wide lint output is still printed/reported, but does not block unless the failing file is inside the active surface

**Step 4: Run the new scripts immediately**

Run:
- `pnpm run lint:desktop:active`
- `pnpm run lint:desktop:shared`
- `pnpm run verify:desktop:migration`

Expected:
- active desktop gate passes
- shared gate is either green or reduced to explicitly accepted warnings

### Task 3: Document Blocking Versus Observation

**Files:**
- Modify: `.trellis/spec/frontend/quality-guidelines.md`
- Modify: `.trellis/spec/guides/desktop-runtime-boundary.md`
- Modify: `.trellis/workflow.md`
- Modify: `.trellis/worktree.yaml`

**Step 1: Update the frontend quality guide**

Document:
- repo default remains `pnpm lint` + `pnpm type-check`
- desktop migration slices may define a narrower hard gate when the PRD says so

**Step 2: Update the desktop runtime boundary guide**

Document:
- exact desktop active file list
- shared active surface v1
- required commands
- what counts as an observation-only signal

**Step 3: Update Trellis workflow language**

Make the workflow explicit that:
- the task-defined hard gate is the blocker
- repo-wide lint remains reported as observation until debt is intentionally pulled into scope

### Task 4: Close The Debt Tracking Loop

**Files:**
- Modify: `.trellis/tasks/03-31-lint-boundary-and-debt-split/prd.md`
- Modify: `.trellis/tasks/03-31-lint-boundary-and-debt-split/lint-debt-baseline.md`

**Step 1: Promote the closest shared/tooling debt into explicit tracking**

Specifically review:
- `scripts/build-export-css.ts`
- `src/lib/template-renderer/templates/classic.tsx`
- `src/lib/template-renderer/templates/modern.tsx`

Decide whether each item is:
- current blocker
- tracked shared-active warning
- legacy observation

**Step 2: Make reclassification rules explicit**

Rule:
- if a future desktop slice edits/imports a legacy failing path directly, move that path into the shared active surface instead of leaving it in the debt bucket

**Step 3: Keep the PRD and baseline in sync**

The same file groups and command names should appear in:
- the PRD
- the baseline doc
- the Trellis guides
- the package/script entry points

### Task 5: Verify The Final Gate And Handoff

**Files:**
- Verify: `package.json`
- Verify: `scripts/verify-desktop-lint-boundary.mjs`
- Verify: `.trellis/spec/frontend/quality-guidelines.md`
- Verify: `.trellis/spec/guides/desktop-runtime-boundary.md`
- Verify: `.trellis/workflow.md`
- Verify: `.trellis/tasks/03-31-lint-boundary-and-debt-split/lint-debt-baseline.md`

**Step 1: Run the final hard-gate commands**

Run:
- `pnpm type-check`
- `pnpm --filter @rolerover/desktop build`
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml --target-dir .codex-cargo-target/desktop-tauri`
- `pnpm run lint:desktop:active`
- `pnpm run lint:desktop:shared`

Expected:
- the desktop migration hard gate is reproducible and green

**Step 2: Run repo-wide lint as observation**

Run:
- `pnpm lint`

Expected:
- remaining failures are reported through the baseline/debt lens instead of being treated as accidental blockers

**Step 3: Handoff without auto-commit**

Before any commit:
- run the relevant finish/check flow
- summarize what is inside the hard gate
- summarize what remains repo-wide observation

Do not commit or push unless the user explicitly authorizes it.
