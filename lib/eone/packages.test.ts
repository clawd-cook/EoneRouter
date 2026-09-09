import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

register(
  `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\\.(ts|tsx|js|mjs|cjs|json)$/.test(specifier)
  ) {
    try {
      return await nextResolve(specifier + ".ts", context);
    } catch {
      // fall through
    }
  }
  return nextResolve(specifier, context);
}
`)}`,
  import.meta.url,
);

const { listPackages } = await import("./packages.ts");

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eone-pkg-"));
}

test("lists only valid eone directories, sorted", () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, "eone-2"));
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "ok");
  fs.writeFileSync(path.join(root, "not-a-package"), "x");
  fs.mkdirSync(path.join(root, "prod-1"));
  fs.mkdirSync(path.join(root, ".tmp-abc"));
  fs.writeFileSync(path.join(root, "eone-file"), "nope");

  assert.deepEqual(listPackages(root), ["eone-1", "eone-2"]);
});

test("returns empty when storage root is missing", () => {
  const root = path.join(makeRoot(), "missing");
  assert.deepEqual(listPackages(root), []);
});
