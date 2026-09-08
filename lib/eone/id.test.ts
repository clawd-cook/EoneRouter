import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidEoneId } from "./id.ts";

test("accepts eone-1", () => {
  assert.equal(isValidEoneId("eone-1"), true);
});

test("accepts letters, digits, hyphen, underscore after prefix", () => {
  assert.equal(isValidEoneId("eone-AbC_09-x"), true);
});

test("rejects empty string", () => {
  assert.equal(isValidEoneId(""), false);
});

test("rejects eone- with nothing after the hyphen", () => {
  assert.equal(isValidEoneId("eone-"), false);
});

test("rejects path-escape ids", () => {
  assert.equal(isValidEoneId("eone-../etc"), false);
});

test("rejects ids without eone- prefix", () => {
  assert.equal(isValidEoneId("prod-1"), false);
});
