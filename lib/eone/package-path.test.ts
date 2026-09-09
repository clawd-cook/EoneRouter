import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveUploadRelativePath } from "./package-path.ts";

test("keeps zip-root relative paths", () => {
  assert.equal(resolveUploadRelativePath("index.html"), "index.html");
  assert.equal(
    resolveUploadRelativePath("assets/a.css"),
    "assets/a.css",
  );
});

test("normalizes backslashes", () => {
  assert.equal(
    resolveUploadRelativePath("assets\\a.css"),
    "assets/a.css",
  );
});

test("rejects empty, dot, and parent segments", () => {
  assert.equal(resolveUploadRelativePath(""), null);
  assert.equal(resolveUploadRelativePath("mysite/"), null);
  assert.equal(resolveUploadRelativePath("mysite/."), null);
  assert.equal(resolveUploadRelativePath("mysite/foo/../bar"), null);
  assert.equal(resolveUploadRelativePath("../outside.txt"), null);
});

test("rejects absolute paths", () => {
  assert.equal(resolveUploadRelativePath("/mysite/index.html"), null);
  assert.equal(resolveUploadRelativePath("C:\\mysite\\index.html"), null);
});
