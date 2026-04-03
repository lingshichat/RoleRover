import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const mode = process.argv[2];
const forwardedArgs = process.argv.slice(3);

if (mode !== "dev" && mode !== "build") {
  console.error(
    "[run-tauri-local-updater] Expected first argument to be `dev` or `build`.",
  );
  process.exit(1);
}

const port = Number(process.env.DESKTOP_UPDATER_FEED_PORT ?? "8765");
if (!Number.isInteger(port) || port <= 0) {
  console.error("[run-tauri-local-updater] DESKTOP_UPDATER_FEED_PORT must be a positive integer.");
  process.exit(1);
}

const tauriConfigPath = path.join(ROOT, "desktop", "src-tauri", "tauri.conf.json");
const generatedConfigPath = path.join(
  ROOT,
  "desktop",
  ".codex-temp",
  "tauri.local-updater.generated.json",
);
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));

tauriConfig.plugins ??= {};
tauriConfig.plugins.updater = {
  ...(tauriConfig.plugins.updater ?? {}),
  dangerousInsecureTransportProtocol: true,
  endpoints: [`http://127.0.0.1:${port}/latest.json`],
};

fs.mkdirSync(path.dirname(generatedConfigPath), { recursive: true });
fs.writeFileSync(generatedConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

console.log(
  `[run-tauri-local-updater] Generated temporary updater config at ${generatedConfigPath}`,
);
console.log(
  `[run-tauri-local-updater] Overriding updater endpoint to http://127.0.0.1:${port}/latest.json`,
);

const child = spawn(
  process.execPath,
  [path.join(ROOT, "scripts", "run-tauri-cli.mjs"), mode, ...forwardedArgs],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      TAURI_CONFIG: generatedConfigPath,
    },
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
