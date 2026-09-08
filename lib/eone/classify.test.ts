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

const { classifyRequest } = await import("./classify.ts");

test("skips _next and __eone prefixes", () => {
  assert.deepEqual(classifyRequest("/_next/static/x.js", "eone-1"), {
    action: "skip",
  });
  assert.deepEqual(classifyRequest("/__eone/files/", "eone-1"), {
    action: "skip",
  });
  assert.deepEqual(classifyRequest("/__eone/invalid", null), {
    action: "skip",
  });
});

test("passes through when header is missing or empty", () => {
  assert.deepEqual(classifyRequest("/", null), { action: "pass" });
  assert.deepEqual(classifyRequest("/", ""), { action: "pass" });
  assert.deepEqual(classifyRequest("/index.js", "   "), { action: "pass" });
});

test("rewrites illegal id to invalid page", () => {
  assert.deepEqual(classifyRequest("/", "eone-../x"), {
    action: "rewrite",
    target: "/__eone/invalid",
  });
  assert.deepEqual(classifyRequest("/", "prod-1"), {
    action: "rewrite",
    target: "/__eone/invalid",
  });
});

test("rewrites valid id to files handler preserving path", () => {
  assert.deepEqual(classifyRequest("/", "eone-1"), {
    action: "rewrite",
    target: "/__eone/files/",
  });
  assert.deepEqual(classifyRequest("/index.js", "eone-1"), {
    action: "rewrite",
    target: "/__eone/files/index.js",
  });
  assert.deepEqual(classifyRequest("/assets/a.css", "eone-2"), {
    action: "rewrite",
    target: "/__eone/files/assets/a.css",
  });
});
