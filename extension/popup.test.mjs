import assert from "node:assert/strict";
import { test } from "node:test";

const elements = new Map(
  ["#origin", "#id", "#save", "#clear", "#status"].map((selector) => [
    selector,
    {
      dataset: {},
      listeners: {},
      textContent: "",
      value: "",
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
    },
  ]),
);
const calls = [];
let permissionGranted = false;

globalThis.document = {
  querySelector(selector) {
    return elements.get(selector);
  },
};
globalThis.chrome = {
  storage: {
    local: {
      async get(defaults) {
        return defaults;
      },
      async set(value) {
        calls.push(["storage.set", value]);
      },
    },
  },
  permissions: {
    async request(value) {
      calls.push(["permissions.request", value]);
      return permissionGranted;
    },
  },
  runtime: {
    async sendMessage(value) {
      calls.push(["runtime.sendMessage", value]);
      return { ok: true };
    },
  },
};

await import("./popup.js");

test("save persists the normalized origin and id before requesting permission", async () => {
  calls.length = 0;
  permissionGranted = true;
  elements.get("#origin").value = "http://localhost:3000/guide";
  elements.get("#id").value = " eone-1 ";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, [
    [
      "storage.set",
      { origin: "http://localhost:3000", id: "eone-1" },
    ],
    [
      "permissions.request",
      { origins: ["http://localhost:3000/*"] },
    ],
    ["runtime.sendMessage", { type: "eone-apply" }],
  ]);
});

test("denied permission leaves saved state but does not request a rebuild", async () => {
  calls.length = 0;
  permissionGranted = false;
  elements.get("#origin").value = "http://localhost:3000";
  elements.get("#id").value = "eone-2";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, [
    [
      "storage.set",
      { origin: "http://localhost:3000", id: "eone-2" },
    ],
    [
      "permissions.request",
      { origins: ["http://localhost:3000/*"] },
    ],
  ]);
  assert.equal(elements.get("#status").textContent, "未授予站点权限");
});

test("invalid origin fails before storage is written", async () => {
  calls.length = 0;
  elements.get("#origin").value = "ftp://localhost";
  elements.get("#id").value = "eone-1";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, []);
});
