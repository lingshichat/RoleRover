'use client';

import { SessionProvider } from 'next-auth/react';
import { config } from '@/lib/config';

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  if (!config.auth.enabled) {
    return <>{children}</>;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
