import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";
import {
  internalNextArgs,
  listenOnAllInterfaces,
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
