import assert from "node:assert/strict";
import { test } from "node:test";

const listeners = {};
const updates = [];
let granted = false;
const state = { origin: "http://localhost:3000", id: "eone-1" };

globalThis.chrome = {
  storage: {
    local: {
      async get() {
        return { ...state };
      },
    },
  },
  permissions: {
    async contains(details) {
      assert.deepEqual(details, { origins: ["http://localhost:3000/*"] });
      return granted;
    },
    onAdded: {
      addListener(listener) {
        listeners.onAdded = listener;
      },
    },
  },
  declarativeNetRequest: {
    async updateDynamicRules(update) {
      updates.push(update);
    },
  },
  runtime: {
    onInstalled: {
      addListener(listener) {
        listeners.onInstalled = listener;
      },
    },
    onStartup: {
      addListener(listener) {
        listeners.onStartup = listener;
      },
    },
    onMessage: {
      addListener(listener) {
        listeners.onMessage = listener;
      },
    },
  },
};

await import("./background.js");

async function apply() {
  return new Promise((resolve) => {
    listeners.onMessage({ type: "eone-apply" }, {}, resolve);
  });
}

test("rebuild removes the rule but does not add it without host permission", async () => {
  granted = false;
  updates.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.deepEqual(updates, [
    { removeRuleIds: [1], addRules: [] },
  ]);
});

test("rebuild adds the rule when host permission is granted", async () => {
  granted = true;
  updates.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].removeRuleIds, [1]);
  assert.equal(updates[0].addRules.length, 1);
  assert.equal(
    updates[0].addRules[0].action.requestHeaders[0].value,
    "eone-1",
  );
});

test("permission additions trigger the same rebuild", async () => {
  granted = true;
  updates.length = 0;

  listeners.onAdded({ origins: ["http://localhost:3000/*"] });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(updates.length, 1);
  assert.equal(updates[0].addRules.length, 1);
});
