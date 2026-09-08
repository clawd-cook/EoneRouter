import {
  DEFAULT_ORIGIN,
  hostPermissionPattern,
  normalizeOrigin,
} from "./dnr.mjs";

const originInput = document.querySelector("#origin");
const idInput = document.querySelector("#id");
const saveButton = document.querySelector("#save");
const clearButton = document.querySelector("#clear");
const status = document.querySelector("#status");

function setStatus(message, ok = false) {
  status.textContent = message;
  status.dataset.ok = String(ok);
}

async function applyRule() {
  const response = await chrome.runtime.sendMessage({ type: "eone-apply" });
  if (!response?.ok) {
    throw new Error(response?.error || "应用规则失败");
  }
}

async function restore() {
  const { origin, id } = await chrome.storage.local.get({
    origin: DEFAULT_ORIGIN,
    id: "",
  });
  originInput.value = origin;
  idInput.value = id;
}

saveButton.addEventListener("click", async () => {
  const originValue = originInput.value;
  const id = idInput.value.trim();
  let origin;

  try {
    origin = normalizeOrigin(originValue);
  } catch (error) {
    setStatus(String(error));
    return;
  }

  try {
    if (id) {
      await chrome.storage.local.set({ origin, id });
      const granted = await chrome.permissions.request({
        origins: [hostPermissionPattern(origin)],
      });
      if (!granted) {
        setStatus("未授予站点权限");
        return;
      }
    }

    if (!id) {
      await chrome.storage.local.set({ origin, id });
    }
    await applyRule();
    originInput.value = origin;
    setStatus("已保存", true);
  } catch (error) {
    setStatus(String(error));
  }
});

clearButton.addEventListener("click", async () => {
  let origin;

  try {
    origin = normalizeOrigin(originInput.value);
  } catch {
    origin = DEFAULT_ORIGIN;
  }

  try {
    await chrome.storage.local.set({ origin, id: "" });
    await applyRule();
    originInput.value = origin;
    idInput.value = "";
    setStatus("已清空", true);
  } catch (error) {
    setStatus(String(error));
  }
});

try {
  await restore();
} catch (error) {
  setStatus(String(error));
}
