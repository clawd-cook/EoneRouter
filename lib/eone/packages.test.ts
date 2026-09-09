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

const { createPackage, deletePackage, listPackages } = await import("./packages.ts");

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

test("createPackage writes zip-root relative paths", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-7", [
    { relativePath: "index.html", bytes: new TextEncoder().encode("hello") },
    {
      relativePath: "assets/a.css",
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
});

test("createPackage allows a tree without index.html", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-noindex", [
    { relativePath: "readme.txt", bytes: new TextEncoder().encode("x") },
  ]);
  assert.deepEqual(result, { ok: true, id: "eone-noindex" });
  assert.equal(fs.existsSync(path.join(root, "eone-noindex", "readme.txt")), true);
});

test("createPackage rejects illegal id without writing", () => {
  const root = makeRoot();
  const result = createPackage(root, "prod-1", [
    { relativePath: "index.html", bytes: new Uint8Array([1]) },
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
    { relativePath: "index.html", bytes: new TextEncoder().encode("new") },
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
      { relativePath: "index.html", bytes: new TextEncoder().encode("new") },
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

test("createPackage removes its empty destination claim when publication fails", () => {
  const root = makeRoot();
  const dest = path.join(root, "eone-failed");
  const sibling = path.join(root, "eone-sibling");
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(sibling, "index.html"), "keep");
  const originalRenameSync = fs.renameSync;
  fs.renameSync = function () {
    const error = new Error("forced rename failure") as NodeJS.ErrnoException;
    error.code = "EIO";
    throw error;
  } as typeof fs.renameSync;

  try {
    const result = createPackage(root, "eone-failed", [
      { relativePath: "index.html", bytes: new TextEncoder().encode("new") },
    ]);
    assert.deepEqual(result, { ok: false, code: "write-failed" });
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(
      fs.readdirSync(root).filter((name) => name.startsWith(".tmp-")),
      [],
    );
    assert.equal(
      fs.readFileSync(path.join(sibling, "index.html"), "utf8"),
      "keep",
    );
  } finally {
    fs.renameSync = originalRenameSync;
  }
});

test("createPackage returns write-failed when storage root is a file", () => {
  const parent = makeRoot();
  const root = path.join(parent, "storage-file");
  fs.writeFileSync(root, "occupied");

  assert.deepEqual(
    createPackage(root, "eone-10", [
      { relativePath: "index.html", bytes: new Uint8Array([1]) },
    ]),
    { ok: false, code: "write-failed" },
  );
  assert.equal(fs.readFileSync(root, "utf8"), "occupied");
});

test("createPackage rejects escape paths and does not create the target", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-9", [
    { relativePath: "foo/../../outside.txt", bytes: new Uint8Array([1]) },
  ]);
  assert.deepEqual(result, { ok: false, code: "path-escape" });
  assert.equal(fs.existsSync(path.join(root, "eone-9")), false);
  const leftovers = fs.readdirSync(root).filter((n) => n.startsWith(".tmp-"));
  assert.deepEqual(leftovers, []);
});

test("deletePackage removes only that directory", () => {
  const root = makeRoot();
  createPackage(root, "eone-a", [
    { relativePath: "index.html", bytes: new TextEncoder().encode("a") },
  ]);
  createPackage(root, "eone-b", [
    { relativePath: "index.html", bytes: new TextEncoder().encode("b") },
  ]);
  assert.deepEqual(deletePackage(root, "eone-a"), { ok: true, id: "eone-a" });
  assert.equal(fs.existsSync(path.join(root, "eone-a")), false);
  assert.equal(
    fs.readFileSync(path.join(root, "eone-b", "index.html"), "utf8"),
    "b",
  );
});

test("deletePackage rejects illegal id", () => {
  const root = makeRoot();
  assert.deepEqual(deletePackage(root, "prod-1"), {
    ok: false,
    code: "invalid-id",
  });
});

test("deletePackage returns not-found when missing", () => {
  const root = makeRoot();
  assert.deepEqual(deletePackage(root, "eone-missing"), {
    ok: false,
    code: "not-found",
  });
});
