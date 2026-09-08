export const DNR_RULE_ID = 1;
export const EONE_HEADER_NAME = "X-Eone-Id";
export const DEFAULT_ORIGIN = "http://localhost:3000";

export const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "media",
  "xmlhttprequest",
  "websocket",
  "other",
];

export function normalizeOrigin(origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Origin must be http or https");
  }
  return url.origin;
}

export function hostPermissionPattern(origin) {
  return `${normalizeOrigin(origin)}/*`;
}

export function originToRegexFilter(origin) {
  const normalized = normalizeOrigin(origin);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^${escaped}(/|$)`;
}

export function buildDnrRule({ origin, id }) {
  if (!id) {
    return null;
  }
  const normalized = normalizeOrigin(origin);
  return {
    id: DNR_RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: EONE_HEADER_NAME, operation: "set", value: id },
      ],
    },
    condition: {
      regexFilter: originToRegexFilter(normalized),
      resourceTypes: RESOURCE_TYPES,
    },
  };
}
