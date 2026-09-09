import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBodyTooLarge,
  MAX_PACKAGE_BODY_BYTES,
  packageErrorBody,
} from "./package-http.ts";

test("maps codes to the spec statuses and Chinese messages", () => {
  assert.deepEqual(packageErrorBody("invalid-id"), {
    status: 400,
    error: "标识不合法",
  });
  assert.deepEqual(packageErrorBody("empty-files"), {
    status: 400,
    error: "未选择文件",
  });
  assert.deepEqual(packageErrorBody("path-escape"), {
    status: 400,
    error: "相对路径不合法",
  });
  assert.deepEqual(packageErrorBody("package-exists"), {
    status: 409,
    error: "标识已被占用",
  });
  assert.deepEqual(packageErrorBody("not-found"), {
    status: 404,
    error: "找不到该标识",
  });
  assert.deepEqual(packageErrorBody("write-failed"), {
    status: 500,
    error: "写入失败",
  });
});

test("isBodyTooLarge uses the 100 MiB ceiling", () => {
  assert.equal(MAX_PACKAGE_BODY_BYTES, 100 * 1024 * 1024);
  assert.equal(isBodyTooLarge(null), false);
  assert.equal(isBodyTooLarge(""), false);
  assert.equal(isBodyTooLarge(String(MAX_PACKAGE_BODY_BYTES)), false);
  assert.equal(isBodyTooLarge(String(MAX_PACKAGE_BODY_BYTES + 1)), true);
});
