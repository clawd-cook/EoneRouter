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

const { resolvePackageFile } = await import("./path.ts");

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eone-"));
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "one");
  fs.writeFileSync(path.join(root, "eone-1", "index.js"), "js");
  fs.mkdirSync(path.join(root, "eone-1", "assets"));
  fs.writeFileSync(path.join(root, "eone-1", "assets", "a.css"), "css");
  return root;
}

test("maps / to index.html", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.absolutePath, path.join(storageRoot, "eone-1", "index.html"));
  }
});

test("maps /index.js to that file", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/index.js",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.absolutePath, path.join(storageRoot, "eone-1", "index.js"));
  }
});

test("strips query string", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/index.js?cache=1",
  });
  assert.equal(result.ok, true);
});

test("rejects .. escape", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/../eone-1/index.html",
  });
  assert.deepEqual(result, { ok: false, reason: "escape" });
});

test("rejects invalid id before joining", () => {
  const result = resolvePackageFile({
    storageRoot: "/tmp",
    id: "eone-../etc",
    pathname: "/",
  });
  assert.deepEqual(result, { ok: false, reason: "invalid-id" });
});

test("missing package directory", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-missing",
    pathname: "/",
  });
  assert.deepEqual(result, { ok: false, reason: "missing-package" });
});

test("missing file is not-a-file", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/nope.js",
  });
  assert.deepEqual(result, { ok: false, reason: "not-a-file" });
});

test("directory is not-a-file", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/assets",
  });
  assert.deepEqual(result, { ok: false, reason: "not-a-file" });
});

test("symlink escape is rejected", () => {
  const storageRoot = makeRoot();
  const outside = path.join(storageRoot, "secret.txt");
  fs.writeFileSync(outside, "nope");
  fs.symlinkSync(outside, path.join(storageRoot, "eone-1", "link.txt"));
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/link.txt",
  });
  assert.deepEqual(result, { ok: false, reason: "escape" });
});
