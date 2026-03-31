import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const DESKTOP_ACTIVE_FILES = [
  "desktop/src/lib/desktop-api.ts",
  "desktop/src/lib/template-validation.ts",
  "desktop/src/i18n.ts",
  "desktop/src/routes/root.tsx",
  "desktop/src/routes/home.tsx",
  "desktop/src/routes/library.tsx",
  "desktop/src/routes/settings.tsx",
];

const SHARED_ACTIVE_FILES = [
  "src/lib/constants.ts",
  "src/lib/pdf/export-tailwind-css.ts",
  "src/lib/template-renderer/index.ts",
  "src/lib/template-renderer/template-contract.ts",
  "src/lib/template-renderer/types.ts",
  "src/lib/template-renderer/templates/classic.tsx",
  "src/lib/template-renderer/templates/modern.tsx",
  "src/types/resume.ts",
  "scripts/build-export-css.ts",
  "scripts/verify-desktop-lint-boundary.mjs",
];

function resolveCommandBin(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function quoteShellArg(arg) {
  return /[\s"]/u.test(arg) ? `"${arg.replaceAll("\"", '\\"')}"` : arg;
}

function runCommand(label, command, args) {
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
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.signal) {
    console.error(
      `[verify-desktop-lint-boundary] ${command} exited from signal ${result.signal}.`,
    );
    process.exit(1);
  }
}

function runEslint(label, files) {
  if (files.length === 0) {
    console.log(`[verify-desktop-lint-boundary] ${label}: no files to lint.`);
    return;
  }

  // ESLint warnings remain visible in output, but only errors block by default.
  runCommand(label, "pnpm", ["exec", "eslint", ...files]);
}

function normalizeRelativeFile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(ROOT, filePath);
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function getBoundaryFiles() {
  return new Set([...DESKTOP_ACTIVE_FILES, ...SHARED_ACTIVE_FILES]);
}

function getUniqueFiles(files) {
  return [...new Set(files)];
}

function printUsage() {
  console.log(`Usage:\n  node scripts/verify-desktop-lint-boundary.mjs active\n  node scripts/verify-desktop-lint-boundary.mjs shared\n  node scripts/verify-desktop-lint-boundary.mjs touched <file...>\n  node scripts/verify-desktop-lint-boundary.mjs list\n  node scripts/verify-desktop-lint-boundary.mjs verify`);
}

const mode = process.argv[2] ?? "verify";

switch (mode) {
  case "active": {
    runEslint("Linting desktop active surface", DESKTOP_ACTIVE_FILES);
    break;
  }

  case "shared": {
    runEslint("Linting desktop shared active surface", SHARED_ACTIVE_FILES);
    break;
  }

  case "touched": {
    const boundaryFiles = getBoundaryFiles();
    const touchedFiles = getUniqueFiles(
      process.argv.slice(3).map(normalizeRelativeFile),
    );
    const matchedFiles = touchedFiles.filter((filePath) =>
      boundaryFiles.has(filePath),
    );

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
          desktopActiveFiles: DESKTOP_ACTIVE_FILES,
          sharedActiveFiles: SHARED_ACTIVE_FILES,
        },
        null,
        2,
      ),
    );
    break;
  }

  case "verify": {
    runCommand("Type-checking repo", "pnpm", ["type-check"]);
    runEslint("Linting desktop active surface", DESKTOP_ACTIVE_FILES);
    runEslint("Linting desktop shared active surface", SHARED_ACTIVE_FILES);
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


