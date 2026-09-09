import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";
import { spawn } from "node:child_process";
import {
  internalNextArgs,
  listenOnAllInterfaces,
  stopChildProcess,
  stripPortFlags,
} from "./next-listen.ts";

test("strips -p and --port", () => {
  assert.deepEqual(stripPortFlags(["dev", "-p", "3001"]), ["dev"]);
  assert.deepEqual(stripPortFlags(["start", "--port", "3001"]), ["start"]);
});

test("forces loopback hostname and internal port", () => {
  assert.deepEqual(internalNextArgs(["dev", "-p", "3001"], 41234), [
    "dev",
    "--hostname",
    "127.0.0.1",
    "-p",
    "41234",
  ]);
});

test("rejects when the public port cannot be bound", async () => {
  const blocker = net.createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "0.0.0.0", resolve);
  });

  const address = blocker.address();
  assert.ok(address && typeof address === "object");

  const outer = net.createServer();
  try {
    await assert.rejects(
      listenOnAllInterfaces(outer, address.port),
      (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE",
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("stopChildProcess waits for the child to exit after kill", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30_000)"]);
  await stopChildProcess(child, { gracefulMs: 2000 });
  assert.ok(child.signalCode !== null || child.exitCode !== null);
});

test("stopChildProcess SIGKILLs a child that ignores SIGTERM", async () => {
  const child = spawn(process.execPath, [
    "-e",
    "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);",
  ]);
  await new Promise<void>((resolve, reject) => {
    assert.ok(child.stdout);
    child.stdout.once("data", () => resolve());
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      reject(new Error(`child exited before ready (${code}/${signal})`));
    });
  });
  await stopChildProcess(child, { gracefulMs: 200 });
  assert.equal(child.signalCode, "SIGKILL");
});
