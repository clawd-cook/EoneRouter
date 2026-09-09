import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import { createOuterServer } from "../lib/eone/forward-proxy.ts";
import {
  internalNextArgs,
  listenOnAllInterfaces,
  stopChildProcess,
} from "../lib/eone/next-listen.ts";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  const parsed = parseEnv(readFileSync(envFile, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] ??= value;
  }
}

function allocateLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const tmp = net.createServer();
    tmp.listen(0, "127.0.0.1", () => {
      const addr = tmp.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      tmp.close((err) => (err ? reject(err) : resolvePort(port)));
    });
    tmp.on("error", reject);
  });
}

function waitForNext(port, timeoutMs) {
  return new Promise((resolveReady, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error(`Next did not become ready within ${timeoutMs}ms`));
    }, timeoutMs);

    const attempt = () => {
      if (settled) return;
      const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
        settled = true;
        clearTimeout(timeout);
        response.resume();
        resolveReady();
      });
      request.on("error", () => {
        if (!settled) setTimeout(attempt, 100);
      });
    };

    attempt();
  });
}

const publicPort = Number(process.env.PORT || 3001);
const internalPort = await allocateLoopbackPort();
const nextBin = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const nextArgs = internalNextArgs(process.argv.slice(2), internalPort);
const childEnv = { ...process.env };
delete childEnv.PORT;

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  stdio: "inherit",
  env: childEnv,
});

const outer = createOuterServer({
  upstreamHost: "127.0.0.1",
  upstreamPort: internalPort,
});

const command = process.argv[2];
const readyTimeout = command === "start" ? 120_000 : 60_000;

let terminatingSignal;

function stop(signal) {
  terminatingSignal = signal;
  child.kill(signal);
  if (outer.listening) outer.close();
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

child.on("exit", (code, signal) => {
  const exit = () => {
    const exitSignal = signal ?? terminatingSignal;
    if (exitSignal) {
      process.removeAllListeners(exitSignal);
      process.kill(process.pid, exitSignal);
      return;
    }
    process.exit(code ?? 1);
  };

  if (outer.listening) {
    outer.close(exit);
  } else {
    exit();
  }
});

try {
  await waitForNext(internalPort, readyTimeout);
  await listenOnAllInterfaces(outer, publicPort);
} catch (error) {
  child.removeAllListeners("exit");
  await stopChildProcess(child);
  throw error;
}
