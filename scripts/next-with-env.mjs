import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  const parsed = parseEnv(readFileSync(envFile, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] ??= value;
  }
}

const nextBin = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
