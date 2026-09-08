import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const rootUrl = pathToFileURL(`${process.cwd()}/`).href;

register(
  `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  if (specifier.startsWith("@/")) {
    return nextResolve(${JSON.stringify(rootUrl)} + specifier.slice(2) + ".ts", context);
  }
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

const [{ NextRequest }, { proxy }] = await Promise.all([
  import("next/server.js"),
  import("./proxy.ts"),
]);

test("pass response varies on X-Eone-Id", () => {
  const response = proxy(new NextRequest("http://localhost:3000/guide"));

  assert.equal(response.headers.get("vary"), "X-Eone-Id");
});

test("rewrite response varies on X-Eone-Id", () => {
  const response = proxy(
    new NextRequest("http://localhost:3000/guide", {
      headers: { "X-Eone-Id": "eone-1" },
    }),
  );

  assert.equal(response.headers.get("vary"), "X-Eone-Id");
  assert.equal(
    response.headers.get("x-middleware-rewrite"),
    "http://localhost:3000/__eone/files/guide",
  );
});
