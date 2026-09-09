import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { zipSync } from "fflate";

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

const { extractZipFiles } = await import("./extract-zip.ts");

function zipBytes(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files);
}

test("extractZipFiles maps zip root entries to package files", () => {
  const bytes = zipBytes({
    "index.html": new TextEncoder().encode("hello"),
    "assets/a.css": new TextEncoder().encode("body{}"),
  });
  const result = extractZipFiles(bytes, 1024 * 1024);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const byPath = new Map(
    result.files.map((f) => [f.relativePath, new TextDecoder().decode(f.bytes)]),
  );
  assert.equal(byPath.get("index.html"), "hello");
  assert.equal(byPath.get("assets/a.css"), "body{}");
  assert.equal(byPath.has("assets/"), false);
});

test("extractZipFiles rejects empty archives", () => {
  const bytes = zipBytes({});
  assert.deepEqual(extractZipFiles(bytes, 1024), {
    ok: false,
    code: "empty-files",
  });
});

test("extractZipFiles rejects path escape entries", () => {
  const bytes = zipBytes({
    "../outside.txt": new TextEncoder().encode("x"),
  });
  assert.deepEqual(extractZipFiles(bytes, 1024), {
    ok: false,
    code: "path-escape",
  });
});

test("extractZipFiles rejects absolute-looking entries", () => {
  const bytes = zipBytes({
    "/etc/passwd": new TextEncoder().encode("x"),
  });
  assert.deepEqual(extractZipFiles(bytes, 1024), {
    ok: false,
    code: "path-escape",
  });
});

test("extractZipFiles rejects uncompressed totals over the ceiling", () => {
  const payload = new Uint8Array(64);
  payload.fill(1);
  const bytes = zipBytes({
    "a.bin": payload,
    "b.bin": payload,
  });
  assert.deepEqual(extractZipFiles(bytes, 100), {
    ok: false,
    code: "too-large",
  });
});

test("extractZipFiles rejects corrupt input", () => {
  assert.deepEqual(extractZipFiles(new Uint8Array([1, 2, 3, 4]), 1024), {
    ok: false,
    code: "invalid-zip",
  });
});
