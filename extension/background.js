import {
  buildDnrRules,
  DNR_RULE_ID,
  DNR_SWIMLANE_RULE_ID,
  DEFAULT_ORIGIN,
  hostPermissionPattern,
} from "./dnr.mjs";

async function rebuild() {
  const { origin, id } = await chrome.storage.local.get({
    origin: DEFAULT_ORIGIN,
    id: "",
  });
  const hasPermission =
    id &&
    (await chrome.permissions.contains({
      origins: [hostPermissionPattern(origin)],
    }));
  const rules = hasPermission ? buildDnrRules({ origin, id }) : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [DNR_RULE_ID, DNR_SWIMLANE_RULE_ID],
    addRules: rules,
  });
}

async function rebuildSafely() {
  try {
    await rebuild();
  } catch (error) {
    console.error("Failed to rebuild EoneRouter rule:", error);
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
