import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CHECK_ONLY = process.argv.includes("--check");
const ROOT_PACKAGE_PATH = path.join(ROOT, "package.json");
const DESKTOP_PACKAGE_PATH = path.join(ROOT, "desktop", "package.json");
const TAURI_CONFIG_PATH = path.join(ROOT, "desktop", "src-tauri", "tauri.conf.json");
const CARGO_TOML_PATH = path.join(ROOT, "desktop", "src-tauri", "Cargo.toml");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function syncJsonVersion(filePath, expectedVersion) {
  const json = readJson(filePath);
  const currentVersion = json.version;
  const needsUpdate = currentVersion !== expectedVersion;

  if (needsUpdate && !CHECK_ONLY) {
    json.version = expectedVersion;
    writeJson(filePath, json);
  }

  return needsUpdate
    ? `${path.relative(ROOT, filePath)}: ${currentVersion ?? "<missing>"} -> ${expectedVersion}`
    : null;
}

function syncCargoPackageVersion(filePath, expectedVersion) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  let inPackageSection = false;
  let packageVersionLine = -1;
  let currentVersion = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\[package\]\s*$/u.test(line)) {
      inPackageSection = true;
      continue;
    }

    if (inPackageSection && /^\s*\[.+\]\s*$/u.test(line)) {
      break;
    }

    if (inPackageSection) {
      const match = line.match(/^(\s*version\s*=\s*")([^"]+)(".*)$/u);
      if (match) {
        packageVersionLine = index;
        currentVersion = match[2];
        if (currentVersion !== expectedVersion && !CHECK_ONLY) {
          lines[index] = `${match[1]}${expectedVersion}${match[3]}`;
        }
        break;
      }
    }
  }

  if (packageVersionLine === -1) {
    throw new Error("Unable to locate [package] version in desktop/src-tauri/Cargo.toml.");
  }

  if (currentVersion !== expectedVersion && !CHECK_ONLY) {
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  }

  return currentVersion !== expectedVersion
    ? `${path.relative(ROOT, filePath)}: ${currentVersion ?? "<missing>"} -> ${expectedVersion}`
    : null;
}

const rootPackage = readJson(ROOT_PACKAGE_PATH);
const expectedVersion =
  typeof rootPackage.version === "string" ? rootPackage.version.trim() : "";

if (expectedVersion.length === 0) {
  throw new Error("Root package.json must declare a non-empty version.");
}

const changes = [
  syncJsonVersion(DESKTOP_PACKAGE_PATH, expectedVersion),
  syncJsonVersion(TAURI_CONFIG_PATH, expectedVersion),
  syncCargoPackageVersion(CARGO_TOML_PATH, expectedVersion),
].filter(Boolean);

if (CHECK_ONLY && changes.length > 0) {
  console.error("[sync-desktop-version] Desktop version files are out of sync:");
  for (const change of changes) {
    console.error(`- ${change}`);
  }
  process.exit(1);
}

if (changes.length === 0) {
  console.log(
    `[sync-desktop-version] Desktop version files already match package.json (${expectedVersion}).`,
  );
  process.exit(0);
}

console.log(`[sync-desktop-version] Synced desktop version files to ${expectedVersion}:`);
for (const change of changes) {
  console.log(`- ${change}`);
}
