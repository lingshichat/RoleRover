'use client';

import { useEffect, useState } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { config } from '@/lib/config';
import { generateId } from '@/lib/utils';

function persistFingerprint(value: string) {
  localStorage.setItem('jade_fingerprint', value);
  document.cookie = `jade_fingerprint=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (config.auth.enabled) {
      setIsLoading(false);
      return;
    }

    async function getFingerprint() {
      try {
        // Check localStorage first
        const stored = localStorage.getItem('jade_fingerprint');
        if (stored) {
          document.cookie = `jade_fingerprint=${encodeURIComponent(stored)}; Path=/; Max-Age=31536000; SameSite=Lax`;
          setFingerprint(stored);
          setIsLoading(false);
          return;
        }

        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const visitorId = result.visitorId;

        persistFingerprint(visitorId);
        setFingerprint(visitorId);
      } catch {
        // Fallback: generate a random ID
        const fallbackId = generateId();
        persistFingerprint(fallbackId);
        setFingerprint(fallbackId);
      } finally {
        setIsLoading(false);
      }
    }

    getFingerprint();
  }, []);

  return { fingerprint, isLoading };
}
