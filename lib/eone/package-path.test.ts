import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveUploadRelativePath } from "./package-path.ts";

test("strips the selected folder prefix", () => {
  assert.equal(resolveUploadRelativePath("mysite/index.html"), "index.html");
  assert.equal(
    resolveUploadRelativePath("mysite/assets/a.css"),
    "assets/a.css",
  );
});

test("normalizes backslashes then strips", () => {
  assert.equal(
    resolveUploadRelativePath("mysite\\assets\\a.css"),
    "assets/a.css",
  );
});

test("rejects a path that is already stripped (would become empty)", () => {
  assert.equal(resolveUploadRelativePath("index.html"), null);
});

test("rejects empty, dot, and parent segments after strip", () => {
  assert.equal(resolveUploadRelativePath(""), null);
  assert.equal(resolveUploadRelativePath("mysite/"), null);
  assert.equal(resolveUploadRelativePath("mysite/."), null);
  assert.equal(resolveUploadRelativePath("mysite/foo/../bar"), null);
  assert.equal(resolveUploadRelativePath("mysite/../outside.txt"), null);
});

test("rejects absolute paths", () => {
  assert.equal(resolveUploadRelativePath("/mysite/index.html"), null);
  assert.equal(resolveUploadRelativePath("C:\\mysite\\index.html"), null);
});
