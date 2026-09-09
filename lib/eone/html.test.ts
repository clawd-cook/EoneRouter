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

const {
  fileNotFoundBody,
  invalidIdHtml,
  missingPackageHtml,
  platformErrorHtml,
} = await import("./html.ts");

test("invalid html mentions illegal identifier", () => {
  assert.match(invalidIdHtml(), /不合法/);
});

test("missing html mentions 找不到", () => {
  assert.match(missingPackageHtml(), /找不到/);
});

test("file not found is plain language", () => {
  assert.match(fileNotFoundBody(), /文件不存在/);
});

test("error documents share operator chrome", () => {
  for (const html of [invalidIdHtml(), missingPackageHtml()]) {
    assert.match(html, /EoneRouter/);
    assert.match(html, /引导/);
    assert.match(html, /管理/);
    assert.match(html, /去管理端/);
    assert.match(html, /#F5F5F5/);
    assert.match(html, /href="\/__eone\/admin"/);
  }
});

test("invalid html uses error kind, missing uses 404 mark", () => {
  assert.match(invalidIdHtml(), /#FF4D4F/);
  assert.match(missingPackageHtml(), />404</);
  assert.doesNotMatch(fileNotFoundBody(), /去管理端/);
});

test("platformErrorHtml interpolates title and description", () => {
  const html = platformErrorHtml({
    title: "标识不合法",
    description: "请使用 eone- 开头，且只包含字母、数字、连字符和下划线。",
    kind: "error",
  });
  assert.match(html, /标识不合法/);
  assert.match(html, /请使用 eone- 开头/);
});
