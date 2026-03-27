# Hook Guidelines

> How hooks are used in this project.

---

## Overview

Custom hooks in JadeAI live in `src/hooks/` and are used to encapsulate client
behavior that would otherwise be duplicated across route components.

Hooks are responsible for orchestration, not rendering. They return state and
actions, and they often coordinate one or more Zustand stores.

If the hook powers AI chat, session history, or specialist-to-chat coordination,
also follow `ai-experience-guidelines.md`.

---

## Custom Hook Patterns

- Mark hook files with `'use client';`.
- Keep private helpers inside the hook file when they are only used there.
  Examples: `getHeaders()` in `use-editor.ts` and `use-resume.ts`.
- Return an object with descriptive names instead of tuples. Existing hooks
  return values like `resumes`, `isLoading`, `fetchResumes`, `clearMessages`,
  and `loadResume`.
- Use hooks to coordinate stores instead of making route components manage store
  resets manually.
- Clean up side effects on unmount when the hook owns lifecycle-sensitive state.

Examples:

- `src/hooks/use-editor.ts`: loads a resume, maps API data into store shape, and
  resets both editor stores on cleanup.
- `src/hooks/use-resume.ts`: wraps dashboard CRUD flows around `/api/resume`.
- `src/hooks/use-ai-chat.ts`: configures the AI SDK transport, merges local-only
  messages with server-backed chat state, and reloads resume data after tool
  results appear.
- `src/hooks/use-message-pagination.ts`: preserves session continuity while
  loading older AI messages and restoring scroll position.
- `src/hooks/use-auth.ts`: hides whether auth comes from OAuth or fingerprint mode.

### Auth Hook Rule

- Treat `useAuth()` as the app-level auth contract.
- Do not call `useSession()` directly in components that must also work in
  desktop/fingerprint mode. In that mode `SessionProvider` may be skipped on
  purpose, so `useSession()` will throw.
- If you need NextAuth-specific state for a web-only affordance, read
  `SessionContext` defensively and gate it behind `config.auth.enabled`.

---

## Data Fetching

- Client-side data fetching is done with plain `fetch`, not React Query or SWR.
- Fetching usually happens inside a hook or a route-level client page, then the
  result is stored in local state or Zustand.
- Many authenticated or anonymous API requests need the `x-fingerprint` header.
  Existing hooks read it from `localStorage` before calling the API.
- For AI chat, the project uses `@ai-sdk/react` with a custom
  `DefaultChatTransport`, not ad hoc streaming code.
- When server updates can happen outside the normal local mutation flow, perform
  an explicit reload. `use-ai-chat.ts` does this after tool outputs.
- AI session history should stay hook-driven. Prefer extending
  `useMessagePagination` / `useAIChat` instead of rebuilding pagination and
  message merging logic inside components.

---

## Naming Conventions

- File names and exported hooks use the `use-*` / `use*` pattern:
  `use-editor.ts` exports `useEditor`.
- Prefer a single options object for more complex hooks:
  `useAIChat({ resumeId, sessionId, initialMessages, selectedModel })`.
- For simple one-parameter hooks, a direct primitive argument is fine:
  `useEditor(resumeId)`.
- Keep helper functions unexported unless multiple files truly need them.

---

## Common Mistakes

- Forgetting cleanup for store-backed pages, which leaves stale editor state in memory.
- Re-creating unstable third-party configuration objects on every render when a
  hook actually needs a stable memoized instance.
- Duplicating header-building logic inconsistently. If fingerprint or AI header
  behavior changes, check every hook that performs fetches.
- Returning ambiguous tuple values instead of named fields.
- Using a custom hook for one-off view logic that should stay as local state in a
  single component.
- Re-implementing AI chat session/history orchestration in UI components instead
  of extending the existing AI hooks.
