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

const { createPackage, listPackages } = await import("./packages.ts");

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

test("createPackage writes files with the folder prefix stripped", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-7", [
    { relativePath: "mysite/index.html", bytes: new TextEncoder().encode("hello") },
    {
      relativePath: "mysite/assets/a.css",
      bytes: new TextEncoder().encode("body{}"),
    },
  ]);
  assert.deepEqual(result, { ok: true, id: "eone-7" });
  assert.equal(
    fs.readFileSync(path.join(root, "eone-7", "index.html"), "utf8"),
    "hello",
  );
  assert.equal(
    fs.readFileSync(path.join(root, "eone-7", "assets", "a.css"), "utf8"),
    "body{}",
  );
  assert.equal(fs.existsSync(path.join(root, "eone-7", "mysite")), false);
});

test("createPackage allows a tree without index.html", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-noindex", [
    { relativePath: "site/readme.txt", bytes: new TextEncoder().encode("x") },
  ]);
  assert.deepEqual(result, { ok: true, id: "eone-noindex" });
  assert.equal(fs.existsSync(path.join(root, "eone-noindex", "readme.txt")), true);
});

test("createPackage rejects illegal id without writing", () => {
  const root = makeRoot();
  const result = createPackage(root, "prod-1", [
    { relativePath: "site/index.html", bytes: new Uint8Array([1]) },
  ]);
  assert.deepEqual(result, { ok: false, code: "invalid-id" });
  assert.deepEqual(fs.readdirSync(root), []);
});

test("createPackage rejects empty files", () => {
  const root = makeRoot();
  assert.deepEqual(createPackage(root, "eone-8", []), {
    ok: false,
    code: "empty-files",
  });
});

test("createPackage rejects occupied id and leaves original bytes", () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "keep");
  const result = createPackage(root, "eone-1", [
    { relativePath: "site/index.html", bytes: new TextEncoder().encode("new") },
  ]);
  assert.deepEqual(result, { ok: false, code: "package-exists" });
  assert.equal(
    fs.readFileSync(path.join(root, "eone-1", "index.html"), "utf8"),
    "keep",
  );
});

test("createPackage does not replace an empty destination created during staging", () => {
  const root = makeRoot();
  const dest = path.join(root, "eone-race");
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function (...args) {
    originalWriteFileSync(...args);
    if (String(args[0]).includes(`${path.sep}.tmp-`)) {
      fs.mkdirSync(dest);
    }
  } as typeof fs.writeFileSync;

  try {
    const result = createPackage(root, "eone-race", [
      { relativePath: "site/index.html", bytes: new TextEncoder().encode("new") },
    ]);
    assert.deepEqual(result, { ok: false, code: "package-exists" });
    assert.deepEqual(fs.readdirSync(dest), []);
    assert.deepEqual(
      fs.readdirSync(root).filter((name) => name.startsWith(".tmp-")),
      [],
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test("createPackage returns write-failed when storage root is a file", () => {
  const parent = makeRoot();
  const root = path.join(parent, "storage-file");
  fs.writeFileSync(root, "occupied");

  assert.deepEqual(
    createPackage(root, "eone-10", [
      { relativePath: "site/index.html", bytes: new Uint8Array([1]) },
    ]),
    { ok: false, code: "write-failed" },
  );
  assert.equal(fs.readFileSync(root, "utf8"), "occupied");
});

test("createPackage rejects escape paths and does not create the target", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-9", [
    { relativePath: "site/foo/../../outside.txt", bytes: new Uint8Array([1]) },
  ]);
  assert.deepEqual(result, { ok: false, code: "path-escape" });
  assert.equal(fs.existsSync(path.join(root, "eone-9")), false);
  const leftovers = fs.readdirSync(root).filter((n) => n.startsWith(".tmp-"));
  assert.deepEqual(leftovers, []);
});
