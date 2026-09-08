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

const { fileNotFoundBody, invalidIdHtml, missingPackageHtml } =
  await import("./html.ts");

test("invalid html mentions illegal identifier", () => {
  assert.match(invalidIdHtml(), /不合法/);
});

test("missing html mentions 找不到", () => {
  assert.match(missingPackageHtml(), /找不到/);
});

test("file not found is plain language", () => {
  assert.match(fileNotFoundBody(), /文件不存在/);
});
