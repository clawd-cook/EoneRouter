import {
  buildDnrRules,
  buildPacScript,
  DNR_RULE_ID,
  DNR_SWIMLANE_RULE_ID,
  DEFAULT_ORIGIN,
  DEFAULT_PLATFORM_PROXY,
  hostPermissionPattern,
  shouldSkipPac,
} from "./dnr.mjs";

async function restoreBrowserProxy() {
  const { pacActive, previousProxy } = await chrome.storage.local.get({
    pacActive: false,
    previousProxy: null,
  });
  if (!pacActive) {
    return;
  }
  if (previousProxy) {
    await chrome.proxy.settings.set({
      value: previousProxy,
      scope: "regular",
    });
  } else {
    await chrome.proxy.settings.clear({ scope: "regular" });
  }
  await chrome.storage.local.set({ pacActive: false });
}

async function applyPac(origin, platformProxy) {
  if (shouldSkipPac(origin, platformProxy)) {
    await restoreBrowserProxy();
    return;
  }
  const { pacActive } = await chrome.storage.local.get({ pacActive: false });
  if (!pacActive) {
    const current = await chrome.proxy.settings.get({});
    if (current?.value?.mode !== "pac_script") {
      await chrome.storage.local.set({ previousProxy: current.value });
    }
  }
  await chrome.proxy.settings.set({
    value: {
      mode: "pac_script",
      pacScript: { data: buildPacScript(origin, platformProxy) },
    },
    scope: "regular",
  });
  await chrome.storage.local.set({ pacActive: true });
}

let rebuildMutex = Promise.resolve();

async function rebuild() {
  const previous = rebuildMutex;
  let release;
  rebuildMutex = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    await rebuildOnce();
  } finally {
    release();
  }
}

async function rebuildOnce() {
  const { origin, id, platformProxy } = await chrome.storage.local.get({
    origin: DEFAULT_ORIGIN,
    id: "",
    platformProxy: DEFAULT_PLATFORM_PROXY,
  });
  const hasPermission =
    id &&
    (await chrome.permissions.contains({
      origins: [hostPermissionPattern(origin)],
    }));
  console.info("[eone] rebuild", {
    origin,
    id: id || "(empty)",
    hasPermission: Boolean(hasPermission),
    skipPac: shouldSkipPac(origin, platformProxy),
    pacTarget: platformProxy,
  });
  const rules = hasPermission ? buildDnrRules({ origin, id }) : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [DNR_RULE_ID, DNR_SWIMLANE_RULE_ID],
    addRules: rules,
  });
  try {
    if (hasPermission) {
      await applyPac(origin, platformProxy);
      console.info("[eone] pac applied or skipped", {
        origin,
        skipPac: shouldSkipPac(origin, platformProxy),
      });
    } else {
      await restoreBrowserProxy();
      console.info("[eone] pac restored (no id or no host permission)");
    }
  } catch (error) {
    console.error("[eone] pac apply failed; rolling back DNR", error);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID, DNR_SWIMLANE_RULE_ID],
      addRules: [],
    });
    await restoreBrowserProxy();
    throw error;
  }
}

async function rebuildSafely() {
  try {
    await rebuild();
  } catch (error) {
    console.error("[eone] Failed to rebuild EoneRouter rule:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void rebuildSafely();
});

chrome.runtime.onStartup.addListener(() => {
  void rebuildSafely();
});

chrome.permissions.onAdded.addListener(() => {
  void rebuildSafely();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "eone-apply") {
    return;
  }
  void (async () => {
    try {
      await rebuild();
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();
  return true;
});
