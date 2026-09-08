import assert from "node:assert/strict";
import { register } from "node:module";
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

const { contentTypeFor } = await import("./content-type.ts");

test("maps known extensions", () => {
  assert.equal(contentTypeFor("index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("app.js"), "text/javascript; charset=utf-8");
  assert.equal(contentTypeFor("a.css"), "text/css; charset=utf-8");
  assert.equal(contentTypeFor("x.png"), "image/png");
});

test("unknown extension is octet-stream", () => {
  assert.equal(contentTypeFor("file.bin"), "application/octet-stream");
});
