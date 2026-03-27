import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const isDevelopment = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  output: isDevelopment ? undefined : 'standalone',
  outputFileTracingIncludes: {
    '*': ['public/**/*', '.next/static/**/*', 'drizzle/**/*'],
  },
  serverExternalPackages: ['better-sqlite3', 'puppeteer-core', '@sparticuz/chromium-min', 'electron'],
};

export default withNextIntl(nextConfig);
