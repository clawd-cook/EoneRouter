import assert from "node:assert/strict";
import { test } from "node:test";

const listeners = {};
const dnrUpdates = [];
const proxySets = [];
const proxyClears = [];
let granted = false;
let proxySettingsValue = { mode: "system" };
const state = {
  origin: "http://xxx.jd.com",
  id: "eone-1",
  previousProxy: { mode: "system" },
  pacActive: false,
};

globalThis.chrome = {
  storage: {
    local: {
      async get(defaults = {}) {
        return { ...defaults, ...state };
      },
      async set(value) {
        Object.assign(state, value);
      },
    },
  },
  permissions: {
    async contains(details) {
      assert.deepEqual(details, { origins: [`${state.origin}/*`] });
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
      dnrUpdates.push(update);
    },
  },
  proxy: {
    settings: {
      async get() {
        return { value: proxySettingsValue };
      },
      async set(update) {
        proxySets.push(update);
        proxySettingsValue = update.value;
      },
      async clear(update) {
        proxyClears.push(update);
      },
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
  dnrUpdates.length = 0;
  proxySets.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.deepEqual(dnrUpdates, [
    { removeRuleIds: [1, 2], addRules: [] },
  ]);
  assert.equal(proxySets.length, 0);
});

test("rebuild PAC always targets eone-router.jdtest.net:80", async () => {
  granted = true;
  state.origin = "http://xxx.jd.com";
  state.id = "eone-1";
  state.pacActive = false;
  proxySettingsValue = { mode: "system" };
  dnrUpdates.length = 0;
  proxySets.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.equal(dnrUpdates.at(-1).addRules.length, 2);
  assert.equal(proxySets.length, 1);
  assert.equal(proxySets[0].scope, "regular");
  assert.equal(proxySets[0].value.mode, "pac_script");
  assert.match(proxySets[0].value.pacScript.data, /xxx\.jd\.com/);
  assert.match(
    proxySets[0].value.pacScript.data,
    /PROXY eone-router\.jdtest\.net:80/,
  );
  assert.doesNotMatch(
    proxySets[0].value.pacScript.data,
    /PROXY 127\.0\.0\.1:3001/,
  );
  assert.equal(state.pacActive, true);
  assert.deepEqual(state.previousProxy, { mode: "system" });
});

test("skip PAC when hijack origin is the platform", async () => {
  granted = true;
  state.origin = "http://eone-router.jdtest.net";
  state.id = "eone-1";
  state.pacActive = false;
  dnrUpdates.length = 0;
  proxySets.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.equal(dnrUpdates.at(-1).addRules.length, 2);
  assert.equal(
    proxySets.some((s) => s.value?.mode === "pac_script"),
    false,
  );
});

test("empty id restores previous proxy", async () => {
  granted = false;
  state.origin = "http://xxx.jd.com";
  state.id = "";
  state.pacActive = true;
  state.previousProxy = { mode: "system" };
  dnrUpdates.length = 0;
  proxySets.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.deepEqual(dnrUpdates.at(-1).addRules, []);
  assert.equal(proxySets.length, 1);
  assert.deepEqual(proxySets[0].value, { mode: "system" });
  assert.equal(state.pacActive, false);
});

test("PAC get() does not overwrite a captured system previousProxy", async () => {
  granted = true;
  state.origin = "http://xxx.jd.com";
  state.id = "eone-1";
  state.pacActive = false;
  state.previousProxy = { mode: "system" };
  proxySettingsValue = {
    mode: "pac_script",
    pacScript: { data: "function FindProxyForURL() { return 'DIRECT'; }" },
  };
  dnrUpdates.length = 0;
  proxySets.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.deepEqual(state.previousProxy, { mode: "system" });
});

test("overlapping applies leave previousProxy as system", async () => {
  granted = true;
  state.origin = "http://xxx.jd.com";
  state.id = "eone-1";
  state.pacActive = false;
  state.previousProxy = { mode: "system" };
  proxySettingsValue = { mode: "system" };
  dnrUpdates.length = 0;
  proxySets.length = 0;

  const originalGet = chrome.proxy.settings.get;
  let getCalls = 0;
  chrome.proxy.settings.get = async () => {
    getCalls += 1;
    if (getCalls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return { value: proxySettingsValue };
  };

  try {
    const first = apply();
    listeners.onAdded();
    const second = apply();
    await Promise.all([first, second]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(state.previousProxy, { mode: "system" });
  } finally {
    chrome.proxy.settings.get = originalGet;
  }
});
