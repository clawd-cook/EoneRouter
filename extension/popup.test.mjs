import assert from "node:assert/strict";
import { test } from "node:test";

const elements = new Map(
  ["#origin", "#id", "#platformProxy", "#save", "#clear", "#status"].map(
    (selector) => [
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
    ],
  ),
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

test("save requests host permission before persisting origin and id", async () => {
  calls.length = 0;
  permissionGranted = true;
  elements.get("#origin").value = "http://localhost:3000/guide";
  elements.get("#id").value = " eone-1 ";
  elements.get("#platformProxy").value = "127.0.0.1:3001";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, [
    [
      "permissions.request",
      { origins: ["http://localhost:3000/*", "http://*/*", "https://*/*"] },
    ],
    [
      "storage.set",
      {
        origin: "http://localhost:3000",
        id: "eone-1",
        platformProxy: "127.0.0.1:3001",
      },
    ],
    ["runtime.sendMessage", { type: "eone-apply" }],
  ]);
});

test("denied permission does not persist a new id or rebuild", async () => {
  calls.length = 0;
  permissionGranted = false;
  elements.get("#origin").value = "http://localhost:3000";
  elements.get("#id").value = "eone-2";
  elements.get("#platformProxy").value = "127.0.0.1:3001";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, [
    [
      "permissions.request",
      { origins: ["http://localhost:3000/*", "http://*/*", "https://*/*"] },
    ],
  ]);
  assert.equal(elements.get("#status").textContent, "未授予站点权限");
});

test("invalid origin fails before storage is written", async () => {
  calls.length = 0;
  elements.get("#origin").value = "ftp://localhost";
  elements.get("#id").value = "eone-1";
  elements.get("#platformProxy").value = "127.0.0.1:3001";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, []);
});

test("https hijack origin is rejected before storage", async () => {
  calls.length = 0;
  elements.get("#origin").value = "https://xxx.jd.com";
  elements.get("#id").value = "eone-1";
  elements.get("#platformProxy").value = "127.0.0.1:3001";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, []);
  assert.equal(elements.get("#status").textContent, "劫持 Origin 必须是 http");
});

test("invalid platform proxy surfaces normalize error", async () => {
  calls.length = 0;
  elements.get("#origin").value = "http://localhost:3000";
  elements.get("#id").value = "eone-1";
  elements.get("#platformProxy").value = "";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, []);
  assert.equal(elements.get("#status").textContent, "平台代理不能为空");
});

test("collision is rejected without storage write", async () => {
  calls.length = 0;
  elements.get("#origin").value = "http://127.0.0.1:3001";
  elements.get("#id").value = "eone-1";
  elements.get("#platformProxy").value = "127.0.0.1:3001";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, []);
  assert.equal(
    elements.get("#status").textContent,
    "劫持 Origin 不能与平台代理相同",
  );
});

test("successful save writes platformProxy", async () => {
  calls.length = 0;
  permissionGranted = true;
  elements.get("#origin").value = "http://localhost:3000";
  elements.get("#id").value = "eone-1";
  elements.get("#platformProxy").value = "eone-router.jdtest.net:80";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls[1], [
    "storage.set",
    {
      origin: "http://localhost:3000",
      id: "eone-1",
      platformProxy: "eone-router.jdtest.net:80",
    },
  ]);
  assert.equal(
    elements.get("#platformProxy").value,
    "eone-router.jdtest.net:80",
  );
});

test("clear keeps platformProxy in storage", async () => {
  calls.length = 0;
  elements.get("#origin").value = "http://localhost:3000";
  elements.get("#id").value = "eone-1";
  elements.get("#platformProxy").value = "eone-router.jdtest.net:80";

  await elements.get("#clear").listeners.click();

  assert.deepEqual(calls, [
    ["storage.set", { origin: "http://localhost:3000", id: "" }],
    ["runtime.sendMessage", { type: "eone-apply" }],
  ]);
  assert.equal(
    elements.get("#platformProxy").value,
    "eone-router.jdtest.net:80",
  );
});
