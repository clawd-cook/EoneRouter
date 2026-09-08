import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DNR_RULE_ID,
  EONE_HEADER_NAME,
  RESOURCE_TYPES,
  buildDnrRule,
  hostPermissionPattern,
  normalizeOrigin,
  originToRegexFilter,
} from "./dnr.mjs";

test("normalizeOrigin strips path and trailing slash", () => {
  assert.equal(normalizeOrigin("http://localhost:3000/foo"), "http://localhost:3000");
});

test("normalizeOrigin rejects non-http", () => {
  assert.throws(() => normalizeOrigin("ftp://localhost"));
});

test("empty id yields null rule", () => {
  assert.equal(buildDnrRule({ origin: "http://localhost:3000", id: "" }), null);
});

test("builds a single modifyHeaders rule", () => {
  const rule = buildDnrRule({ origin: "http://localhost:3000", id: "eone-1" });
  assert.equal(rule.id, DNR_RULE_ID);
  assert.equal(rule.action.type, "modifyHeaders");
  assert.deepEqual(rule.action.requestHeaders, [
    { header: EONE_HEADER_NAME, operation: "set", value: "eone-1" },
  ]);
  assert.equal(rule.condition.regexFilter, originToRegexFilter("http://localhost:3000"));
  assert.deepEqual(rule.condition.resourceTypes, RESOURCE_TYPES);
});

test("regex does not match a longer port", () => {
  const filter = originToRegexFilter("http://localhost:3000");
  const re = new RegExp(filter);
  assert.equal(re.test("http://localhost:3000"), true);
  assert.equal(re.test("http://localhost:3000/"), true);
  assert.equal(re.test("http://localhost:3000/index.js"), true);
  assert.equal(re.test("http://localhost:30000/"), false);
});

test("host permission pattern", () => {
  assert.equal(
    hostPermissionPattern("http://localhost:3000"),
    "http://localhost:3000/*",
  );
});
