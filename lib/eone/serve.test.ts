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

const { fileNotFoundBody, invalidIdHtml, missingPackageHtml } =
  await import("./html.ts");
const { servePackage } = await import("./serve.ts");

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eone-serve-"));
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "<p>one</p>");
  return root;
}

test("null id is 400 invalid html", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: null,
    pathname: "/",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body, invalidIdHtml());
  assert.equal(result.cacheControl, "no-store");
});

test("unknown package is 404 missing html", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: "eone-nope",
    pathname: "/",
  });
  assert.equal(result.status, 404);
  assert.equal(result.body, missingPackageHtml());
});

test("valid file returns bytes and html content type", () => {
  const storageRoot = makeRoot();
  const result = servePackage({
    storageRoot,
    id: "eone-1",
    pathname: "/",
  });
  assert.equal(result.status, 200);
  assert.equal(result.contentType, "text/html; charset=utf-8");
  assert.equal(result.body.toString(), "<p>one</p>");
});

test("missing file is 404 plain body", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: "eone-1",
    pathname: "/missing.js",
  });
  assert.equal(result.status, 404);
  assert.equal(result.body, fileNotFoundBody());
  assert.equal(result.contentType, "text/plain; charset=utf-8");
});

test("illegal id is 400", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: "eone-../x",
    pathname: "/",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body, invalidIdHtml());
});
