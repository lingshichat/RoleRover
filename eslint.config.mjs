import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local build outputs / tool state:
    "desktop/dist/**",
    "desktop/src-tauri/target/**",
    ".opencode/**",
    ".claude/**",
    ".kilocode/**",
    ".omc/**",
    // The desktop migration hard gate lives in scripts/verify-desktop-lint-boundary.mjs,
    // so keep active desktop/shared surfaces out of repo-wide ignore lists.
    // Legacy web resume template architecture; excluded while desktop migration is in flight.
    "src/components/preview/templates/**",
    "src/app/api/resume/[[]id[]]/export/**",
    // Local packaging / Codex artifacts:
    ".codex-*/**",
    ".codex-temp-*",
    "release-installer*/**",
  ]),
]);

export default eslintConfig;

