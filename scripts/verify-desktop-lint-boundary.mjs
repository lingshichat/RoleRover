import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const DESKTOP_BLOCKING_PATHS = [
  "desktop/src/lib/desktop-api.ts",
  "desktop/src/lib/ai/reasoning-parser.ts",
  "desktop/src/lib/template-validation.ts",
  "desktop/src/i18n.ts",
  "desktop/src/routes/root.tsx",
  "desktop/src/routes/home.tsx",
  "desktop/src/routes/dashboard.tsx",
  "desktop/src/routes/editor.tsx",
  "desktop/src/routes/templates.tsx",
  "desktop/src/routes/settings.tsx",
  "desktop/src/components/ai/ai-chat-panel.tsx",
  "desktop/src/components/ai/ai-chat-bubble.tsx",
  "desktop/src/components/ai/reasoning-block.tsx",
  "desktop/src/components/ai/tool-execution-card.tsx",
  "desktop/src/components/dashboard/create-resume-dialog.tsx",
  "desktop/src/lib/resume-import.ts",
];

const SHARED_BLOCKING_PATHS = [
  "src/components/ui",
  "src/components/dashboard/template-thumbnail.tsx",
  "src/components/preview",
  "src/lib/constants.ts",
  "src/lib/export",
  "src/lib/pdf/export-tailwind-css.ts",
  "src/lib/ai/parse-schema.ts",
  "src/lib/qrcode.ts",
  "src/lib/section-content.ts",
  "src/lib/template-labels.ts",
  "src/lib/template-renderer/index.ts",
  "src/lib/template-renderer/template-contract.ts",
  "src/lib/template-renderer/types.ts",
  "src/lib/template-renderer/templates/classic.tsx",
  "src/lib/template-renderer/templates/modern.tsx",
  "src/lib/utils.ts",
  "src/types/resume.ts",
  "scripts/build-export-css.ts",
  "scripts/verify-desktop-lint-boundary.mjs",
];

const WEB_REFERENCE_PATHS = [
  "src/app",
  "src/middleware.ts",
  "src/components/ai",
  "src/components/auth",
  "src/components/dashboard",
  "src/components/editor",
  "src/components/landing",
  "src/components/layout",
  "src/components/resume",
  "src/components/settings",
  "src/components/tour",
  "src/hooks",
  "src/i18n",
  "src/lib/ai",
  "src/lib/auth",
  "src/lib/config.ts",
  "src/lib/db",
  "src/lib/desktop",
  "src/lib/resume-target.ts",
  "src/lib/utils",
  "src/stores",
  "src/types",
];

const WEB_REFERENCE_IGNORES = [
  "src/components/dashboard/template-thumbnail.tsx",
  "src/components/preview/**",
  "src/components/ui/**",
  "src/lib/ai/parse-schema.ts",
  "src/types/resume.ts",
];

function resolveCommandBin(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function quoteShellArg(arg) {
  return /[\s"]/u.test(arg) ? `"${arg.replaceAll("\"", '\\"')}"` : arg;
}

function runCommand(label, command, args, options = {}) {
  console.log(`\n[verify-desktop-lint-boundary] ${label}`);
  console.log(`> ${command} ${args.join(" ")}`);

  const result =
    process.platform === "win32"
      ? spawnSync(
          [command, ...args].map(quoteShellArg).join(" "),
          {
            cwd: ROOT,
            stdio: "inherit",
            shell: true,
          },
        )
      : spawnSync(resolveCommandBin(command), args, {
          cwd: ROOT,
          stdio: "inherit",
        });

  if (result.error) {
    console.error(
      `[verify-desktop-lint-boundary] Failed to start ${command}:`,
      result.error,
    );
    if (options.allowFailure) {
      return 1;
    }
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    if (options.allowFailure) {
      return result.status;
    }
    process.exit(result.status);
  }

  if (result.signal) {
    console.error(
      `[verify-desktop-lint-boundary] ${command} exited from signal ${result.signal}.`,
    );
    if (options.allowFailure) {
      return 1;
    }
    process.exit(1);
  }

  return 0;
}

function runEslint(label, paths, options = {}) {
  if (paths.length === 0) {
    console.log(`[verify-desktop-lint-boundary] ${label}: no files to lint.`);
    return 0;
  }

  // ESLint warnings remain visible in output, but only errors block by default.
  const args = ["exec", "eslint", ...paths];
  for (const pattern of options.ignorePatterns ?? []) {
    args.push("--ignore-pattern", pattern);
  }

  return runCommand(label, "pnpm", args, {
    allowFailure: options.allowFailure,
  });
}

function normalizeRelativeFile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(ROOT, filePath);
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function normalizeBoundaryPaths(paths) {
  return getUniqueFiles(paths.map((filePath) => normalizeRelativeFile(filePath)));
}

function getUniqueFiles(files) {
  return [...new Set(files)];
}

function pathMatchesBoundary(filePath, boundaryPath) {
  return filePath === boundaryPath || filePath.startsWith(`${boundaryPath}/`);
}

function getBoundaryMatches(touchedFiles, boundaryPaths) {
  const normalizedBoundaryPaths = normalizeBoundaryPaths(boundaryPaths);
  return touchedFiles.filter((filePath) =>
    normalizedBoundaryPaths.some((boundaryPath) =>
      pathMatchesBoundary(filePath, boundaryPath),
    ),
  );
}

function printUsage() {
  console.log(`Usage:\n  node scripts/verify-desktop-lint-boundary.mjs active\n  node scripts/verify-desktop-lint-boundary.mjs shared\n  node scripts/verify-desktop-lint-boundary.mjs lint\n  node scripts/verify-desktop-lint-boundary.mjs reference\n  node scripts/verify-desktop-lint-boundary.mjs reference-report\n  node scripts/verify-desktop-lint-boundary.mjs touched <file...>\n  node scripts/verify-desktop-lint-boundary.mjs list\n  node scripts/verify-desktop-lint-boundary.mjs verify`);
}

const mode = process.argv[2] ?? "verify";

switch (mode) {
  case "active": {
    runEslint("Linting desktop blocking surface", DESKTOP_BLOCKING_PATHS);
    break;
  }

  case "shared": {
    runEslint("Linting desktop shared blocking surface", SHARED_BLOCKING_PATHS);
    break;
  }

  case "reference": {
    runEslint("Linting pure web reference surface", WEB_REFERENCE_PATHS, {
      ignorePatterns: WEB_REFERENCE_IGNORES,
    });
    break;
  }

  case "reference-report": {
    const status = runEslint(
      "Observing pure web reference surface",
      WEB_REFERENCE_PATHS,
      {
        ignorePatterns: WEB_REFERENCE_IGNORES,
        allowFailure: true,
      },
    );

    if (status !== 0) {
      console.log(
        "[verify-desktop-lint-boundary] Web reference lint debt remains observation-only for the desktop client line.",
      );
    }
    break;
  }

  case "lint": {
    runEslint("Linting desktop blocking surface", DESKTOP_BLOCKING_PATHS);
    runEslint("Linting desktop shared blocking surface", SHARED_BLOCKING_PATHS);

    const status = runEslint(
      "Observing pure web reference surface",
      WEB_REFERENCE_PATHS,
      {
        ignorePatterns: WEB_REFERENCE_IGNORES,
        allowFailure: true,
      },
    );

    if (status !== 0) {
      console.log(
        "[verify-desktop-lint-boundary] Web reference lint debt remains observation-only for the desktop client line.",
      );
    }
    break;
  }

  case "touched": {
    const touchedFiles = getUniqueFiles(
      process.argv.slice(3).map(normalizeRelativeFile),
    );
    const matchedFiles = getUniqueFiles([
      ...getBoundaryMatches(touchedFiles, DESKTOP_BLOCKING_PATHS),
      ...getBoundaryMatches(touchedFiles, SHARED_BLOCKING_PATHS),
    ]);

    if (matchedFiles.length === 0) {
      console.log(
        "[verify-desktop-lint-boundary] No touched files matched the desktop migration boundary.",
      );
      break;
    }

    runEslint(
      "Linting touched files within desktop migration boundary",
      matchedFiles,
    );
    break;
  }

  case "list": {
    console.log(
      JSON.stringify(
        {
          desktopBlockingPaths: normalizeBoundaryPaths(DESKTOP_BLOCKING_PATHS),
          sharedBlockingPaths: normalizeBoundaryPaths(SHARED_BLOCKING_PATHS),
          webReferencePaths: normalizeBoundaryPaths(WEB_REFERENCE_PATHS),
          webReferenceIgnores: WEB_REFERENCE_IGNORES,
        },
        null,
        2,
      ),
    );
    break;
  }

  case "verify": {
    runCommand("Type-checking repo", "pnpm", ["type-check"]);
    runEslint("Linting desktop blocking surface", DESKTOP_BLOCKING_PATHS);
    runEslint("Linting desktop shared blocking surface", SHARED_BLOCKING_PATHS);
    runCommand("Building desktop renderer", "pnpm", [
      "--filter",
      "@rolerover/desktop",
      "build",
    ]);
    runCommand("Checking Tauri Rust boundary", "cargo", [
      "check",
      "--manifest-path",
      "desktop/src-tauri/Cargo.toml",
      "--target-dir",
      ".codex-cargo-target/desktop-tauri",
    ]);
    break;
  }

  default: {
    console.error(`[verify-desktop-lint-boundary] Unknown mode: ${mode}`);
    printUsage();
    process.exit(1);
  }
}


