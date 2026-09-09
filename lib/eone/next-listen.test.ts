import assert from "node:assert/strict";
import { test } from "node:test";
import { internalNextArgs, stripPortFlags } from "./next-listen.ts";

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
