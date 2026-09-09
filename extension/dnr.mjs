export const DNR_RULE_ID = 1;
export const DNR_SWIMLANE_RULE_ID = 2;
export const EONE_HEADER_NAME = "X-Eone-Id";
export const SWIMLANE_HEADER_NAME = "Swimlane";
/** Outer listen port inside the container (nginx → this). Not a PAC target. */
export const LOCAL_PROXY_HOST = "127.0.0.1";
export const LOCAL_PROXY_PORT = 3001;
/** Fixed PAC target. Remote only — local loopback PAC is not supported. */
export const PLATFORM_PROXY = "eone-router.jdtest.net:80";
export const DEFAULT_ORIGIN = "http://localhost:3001";
export const EXTRA_HOST_PERMISSIONS = ["http://*/*", "https://*/*"];

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

export function normalizeHijackOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized.startsWith("http:")) {
    throw new Error("劫持 Origin 必须是 http");
  }
  return normalized;
}

function originHostPort(originUrl) {
  const u = new URL(normalizeOrigin(originUrl));
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  return `${u.hostname.toLowerCase()}:${port}`;
}

export function hijackCollidesWithPlatform(hijackOrigin) {
  return originHostPort(normalizeHijackOrigin(hijackOrigin)) === PLATFORM_PROXY;
}

/** Skip PAC when hijack origin is the platform itself (would loop). */
export function shouldSkipPac(origin) {
  try {
    return hijackCollidesWithPlatform(origin);
  } catch {
    return false;
  }
}

export function pacDecision(url, hijackOrigin) {
  const origin = normalizeHijackOrigin(hijackOrigin);
  if (url === origin || url.startsWith(`${origin}/`)) {
    return `PROXY ${PLATFORM_PROXY}`;
  }
  return "DIRECT";
}

export function buildPacScript(hijackOrigin) {
  const origin = normalizeHijackOrigin(hijackOrigin);
  const proxyReturn = JSON.stringify(`PROXY ${PLATFORM_PROXY}`);
  return `function FindProxyForURL(url, host) {
  var origin = ${JSON.stringify(origin)};
  if (url === origin || url.indexOf(origin + "/") === 0) {
    return ${proxyReturn};
  }
  return "DIRECT";
}
`;
}

export function hostPermissionPattern(origin) {
  return `${normalizeOrigin(origin)}/*`;
}

export function requiredHostPermissions(origin) {
  return [hostPermissionPattern(origin), ...EXTRA_HOST_PERMISSIONS];
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

export function buildDnrRules({ origin, id }) {
  const originRule = buildDnrRule({ origin, id });
  if (!originRule) {
    return [];
  }

  const hostname = new URL(normalizeOrigin(origin)).hostname;
  return [
    originRule,
    {
      id: DNR_SWIMLANE_RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: SWIMLANE_HEADER_NAME, operation: "set", value: id },
        ],
      },
      condition: {
        initiatorDomains: [hostname],
        resourceTypes: ["xmlhttprequest"],
      },
    },
  ];
}
