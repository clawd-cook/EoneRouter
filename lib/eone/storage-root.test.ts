import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { getStorageRoot } from "./storage-root.ts";

test("uses EONE_STORAGE_ROOT when configured", () => {
  assert.equal(
    getStorageRoot("/workspace", { EONE_STORAGE_ROOT: "/custom/storage" }),
    "/custom/storage",
  );
});

test("defaults to the storage directory under cwd", () => {
  assert.equal(getStorageRoot("/workspace", {}), path.join("/workspace", "storage"));
});
