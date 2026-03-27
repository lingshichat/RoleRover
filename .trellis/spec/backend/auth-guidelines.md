# Auth Guidelines

> How authentication and authorization work in JadeAI.

---

## Overview

JadeAI supports two authentication modes controlled by the `NEXT_PUBLIC_AUTH_ENABLED`
environment variable:

- **OAuth mode** (`NEXT_PUBLIC_AUTH_ENABLED=true`): Full NextAuth.js with Google
  OAuth. Users sign in with Google.
- **Fingerprint/Desktop mode** (`NEXT_PUBLIC_AUTH_ENABLED=false` or unset):
  anonymous single-user mode where a browser-generated fingerprint is sent via
  the `x-fingerprint` header. This is the active desktop flow and the default
  local-development flow.

---

## Auth Configuration

The NextAuth config lives in `src/lib/auth/config.ts`:

```typescript
// src/lib/auth/config.ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: config.auth.enabled
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [
        Credentials({
          name: 'Fingerprint',
          credentials: {
            fingerprint: { label: 'Fingerprint', type: 'text' },
          },
          async authorize(credentials) {
            const fingerprint = credentials?.fingerprint as string;
            if (!fingerprint) return null;
            return { id: `fp_${fingerprint}`, name: 'Anonymous User' };
          },
        }),
      ],
  pages: { signIn: '/login' },
  secret: process.env.AUTH_SECRET,
});
```

The auth-enabled flag comes from `src/lib/config.ts`:

```typescript
// src/lib/config.ts
export const config = {
  auth: {
    enabled: process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true',
  },
  // ...
};
```

---

## Auth Helpers

Use the helpers in `src/lib/auth/helpers.ts` — do not call `auth()` directly
in route handlers.

### `getUserIdFromRequest(request: Request): string | null`

Reads the `x-fingerprint` header only. In fingerprint/anonymous mode this
contains the browser fingerprint. In OAuth mode it normally returns `null`;
session resolution happens later inside `resolveUser()`.

```typescript
export function getUserIdFromRequest(request: Request): string | null {
  return request.headers.get('x-fingerprint') || null;
}
```

### `resolveUser(fingerprint?: string | null): Promise<User | null>`

Resolves the current user based on auth mode:

- OAuth mode: calls `auth()` to get the session, looks up the user by ID or email
- Fingerprint mode: calls `userRepository.upsertByFingerprint(fingerprint)`

```typescript
export async function resolveUser(fingerprint?: string | null) {
  await dbReady;  // ensure DB tables exist

  if (config.auth.enabled) {
    const session = await auth();
    if (!session?.user?.id) return null;
    let user = await userRepository.findById(session.user.id);
    if (!user && session.user.email) {
      user = await userRepository.findByEmail(session.user.email);
    }
    return user;
  }

  if (!fingerprint) return null;
  return userRepository.upsertByFingerprint(fingerprint);
}
```

### `getCurrentUserId(): Promise<string | null>`

Returns only the user ID string, or `null`. Used when you only need the ID
and not the full user record.

---

## Route-Level Auth

Every protected route handler must check authentication at the top:

```typescript
export async function GET(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ... rest of handler
  }
}
```

---

## Middleware

The Next.js middleware in `src/middleware.ts` is now **locale routing only**:

```typescript
// src/middleware.ts
export default async function middleware(request: NextRequest) {
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(zh|en)/:path*'],
};
```

There are no middleware-level auth redirects in the desktop flow. API routes
and server helpers must resolve authorization explicitly via `resolveUser()`.

> **Desktop rule**: Do not reintroduce page-level auth redirects in middleware
> for the desktop build. Desktop entry goes straight to the dashboard.

## Client-Side Session Rule

When `NEXT_PUBLIC_AUTH_ENABLED=false`, client components may render without a
NextAuth `SessionProvider`.

- Use `useAuth()` from `src/hooks/use-auth.ts` for product auth state.
- If a component truly needs raw NextAuth session state, read `SessionContext`
  defensively instead of calling `useSession()` directly.
- Do not assume `/api/auth/session` returns JSON in desktop mode; the desktop
  runtime intentionally avoids booting that client fetch path.

Good:

```typescript
const { user, isAuthenticated } = useAuth();
```

Also acceptable when integrating with NextAuth-specific UI:

```typescript
const session = useContext(SessionContext);
const isLoggedIn = config.auth.enabled && !!session?.data?.user;
```

Bad:

```typescript
const { data: session } = useSession();
```

This will throw when `SessionProvider` is intentionally omitted for the
desktop/fingerprint flow.

---

## Auth Handler Route

The NextAuth API handler is a zero-logic passthrough:

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

---

## User Repository Auth Methods

```typescript
// src/lib/db/repositories/user.repository.ts

async findById(id: string) { ... }

async findByEmail(email: string) { ... }

async findByFingerprint(fingerprint: string) { ... }

// Upserts a user by fingerprint, creating one if not found
async upsertByFingerprint(fingerprint: string) {
  const existing = await this.findByFingerprint(fingerprint);
  if (existing) return existing;
  return this.create({ fingerprint, authType: 'fingerprint' });
}

async create(data: { email?: string; name?: string; avatarUrl?: string; fingerprint?: string; authType: 'oauth' | 'fingerprint' }) { ... }
```

---

## OAuth Callback Flow

When a user signs in with Google:

1. NextAuth `jwt` callback fires with `user`, `account`, and `profile`
2. If `account.provider === 'google'`, the callback creates or finds the user
   in the `users` table via `userRepository.create(...)`
3. A sample resume is created for new users via `createSampleResume(dbUser.id)`
4. The stable `dbUser.id` is stored in the JWT token as `token.userId`
5. The `session` callback copies `token.userId` into `session.user.id`

---

## Common Mistakes

- Calling `auth()` directly in route handlers instead of `resolveUser()`
- Forgetting to pass the fingerprint header from the client to API routes
- Skipping the `await dbReady` call in `resolveUser()` (can cause queries before
  tables exist in fingerprint mode)
- Not handling the case where `session.user.id` is undefined in the JWT callback
- In OAuth mode, relying on the fingerprint header instead of the session cookie
- Creating a new NextAuth handler route instead of reusing the existing
  `src/app/api/auth/[...nextauth]/route.ts`
- Assuming `getUserIdFromRequest()` can identify OAuth users by itself; in OAuth
  mode it is only a passthrough for fingerprint-based requests
