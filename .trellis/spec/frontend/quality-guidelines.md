# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

The baseline frontend quality bar in JadeAI is:

- `pnpm lint`
- `pnpm type-check`
- Manual verification of the affected UI flow

The repo currently uses Next.js ESLint rules (`core-web-vitals` +
TypeScript config) and strict TypeScript. There is no dedicated frontend test
script yet, so manual testing is part of the required review process.

For staged desktop migration tasks, the blocking gate may be narrower when the
task PRD or guide says so. In the current desktop rewrite:

- `pnpm run verify:desktop:migration` is the blocking gate
- `pnpm lint` runs desktop/shared blocking lint and reports pure web-reference
  lint debt as observation-only
- `pnpm run report:web:reference` reports archived web-reference debt without
  turning it into a desktop release blocker
- `pnpm run lint:repo:full` remains available when you explicitly want the full
  legacy repo lint picture

---

## Forbidden Patterns

- Adding new code that bypasses strict typing with `any` or unchecked assertions
  when a real type is available.
- Using browser APIs in server components or route modules without moving that
  logic into a client boundary.
- Duplicating shared UI primitives instead of reusing `src/components/ui/`.
- Hard-coding strings in UI where the feature already uses `next-intl`
  translations.
- Introducing new magic values when the codebase already centralizes them in
  files such as `src/lib/constants.ts` or `src/lib/template-labels.ts`.
- Mutating shared store state outside the store API unless there is a deliberate
  reason and the save lifecycle is still respected.

---

## Required Patterns

- Use the `@/...` path alias for internal imports.
- Decide the server/client boundary explicitly. Add `'use client';` only when
  needed, but always add it when a file uses hooks or browser-only APIs.
- Reuse shared types from `src/types/` and shared UI from `src/components/ui/`.
- For user-visible text in feature UI, use `useTranslations(...)` or other
  existing i18n utilities instead of hard-coded English-only strings.
- Keep new styles compatible with both light and dark themes when the affected
  surface already supports both.
- Keep new UI visually coordinated with `visual-design-guidelines.md` instead of
  creating a one-off design language for a single feature.
- Log or surface failures intentionally. Silent failures make editor and AI
  issues much harder to debug.

---

## Testing Requirements

- Run `pnpm lint`.
- Run `pnpm type-check`.
- If the task PRD or guide defines a narrower hard gate, run that gate as the
  blocking check and keep any web-reference lint debt clearly marked as
  observation-only.
- For the current desktop migration boundary, run
  `pnpm run verify:desktop:migration` as the blocking check.
- If the work stays inside archived web-reference code, run
  `pnpm run lint:web:reference` when you want strict lint inside that archived
  lane, or `pnpm run report:web:reference` when you only need observation, and
  state clearly that neither result changes the desktop client release gate.
- Use `pnpm run lint:repo:full` only when you intentionally want the full
  legacy repo debt report, including deprecated web/reference surfaces.
- Manually verify the exact flow you changed.
- If the change touches localized UI, verify both `messages/en.json` and
  `messages/zh.json` coverage or at least confirm the impacted locale path.
- If the change touches editor autosave, AI chat, dialogs, drag-and-drop, or
  preview templates, do a browser-level smoke test for that interaction.
- If the change touches visible styling, manually compare the result against
  neighboring screens for accent, spacing, radius, and motion consistency.

Because the repository does not yet define an automated frontend test suite, do
not claim a change is fully verified without describing the manual checks that
were performed.

---

## Code Review Checklist

- Does the change respect the server/client boundary?
- Are shared types, constants, and UI primitives reused instead of duplicated?
- Are translations handled correctly for user-facing copy?
- If shared state changed, are autosave, hydration, and cleanup paths still correct?
- If interaction patterns changed, do keyboard/focus behavior and nested click
  handling still work?
- If visual styling changed, does it still match JadeAI's current neutral + pink
  design language and the correct page-type intensity?
- Were the blocking verification commands run (repo default or task-defined hard gate), and was the distinction between desktop blocking lint and web-reference observation kept clear?
- If the work stayed in pure web-reference code, was that scope called out so
  desktop CI expectations were not misrepresented?
- Was the changed UI flow manually tested?
