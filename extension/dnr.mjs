export const DNR_RULE_ID = 1;
export const DNR_SWIMLANE_RULE_ID = 2;
export const EONE_HEADER_NAME = "X-Eone-Id";
export const SWIMLANE_HEADER_NAME = "Swimlane";
export const LOCAL_PROXY_HOST = "127.0.0.1";
export const LOCAL_PROXY_PORT = 3001;
export const DEFAULT_PLATFORM_PROXY = `${LOCAL_PROXY_HOST}:${LOCAL_PROXY_PORT}`;
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

export function normalizePlatformProxy(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new Error("平台代理不能为空");
  }
  let hostPort = trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("平台代理不合法");
    }
    if (url.protocol !== "http:") {
      throw new Error("平台代理只支持 http");
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("平台代理不合法");
    }
    let port = url.port;
    if (!port) {
      const explicitPort = /^http:\/\/[^/]+:(\d+)/i.exec(trimmed);
      if (explicitPort) {
        port = explicitPort[1];
      }
    }
    if (!port) {
      throw new Error("平台代理必须包含端口");
    }
    hostPort = `${url.hostname}:${port}`;
  }
  const m = /^([^:\/\s]+):(\d+)$/.exec(hostPort);
  if (!m) {
    throw new Error("平台代理格式为 host:port");
  }
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("平台代理端口不合法");
  }
  return `${m[1]}:${port}`;
}

function splitPlatformProxy(platformProxy) {
  const normalized = normalizePlatformProxy(platformProxy);
  const idx = normalized.lastIndexOf(":");
  return {
    host: normalized.slice(0, idx),
    port: normalized.slice(idx + 1),
    value: normalized,
  };
}

function originHostPort(originUrl) {
  const u = new URL(normalizeOrigin(originUrl));
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  return `${u.hostname}:${port}`;
}

export function hijackCollidesWithPlatform(hijackOrigin, platformProxy) {
  const hijack = originHostPort(normalizeHijackOrigin(hijackOrigin));
  const platform = normalizePlatformProxy(platformProxy);
  return hijack === platform;
}

export function shouldSkipPac(origin, platformProxy = DEFAULT_PLATFORM_PROXY) {
  const { host, port } = splitPlatformProxy(platformProxy);
  if (host !== "127.0.0.1" && host !== "localhost") {
    return false;
  }
  const normalized = normalizeOrigin(origin);
  return (
    normalized === `http://localhost:${port}` ||
    normalized === `http://127.0.0.1:${port}`
  );
}

export function pacDecision(url, hijackOrigin, platformProxy = DEFAULT_PLATFORM_PROXY) {
  const origin = normalizeHijackOrigin(hijackOrigin);
  const { value } = splitPlatformProxy(platformProxy);
  if (url === origin || url.startsWith(`${origin}/`)) {
    return `PROXY ${value}`;
  }
  return "DIRECT";
}

export function buildPacScript(hijackOrigin, platformProxy = DEFAULT_PLATFORM_PROXY) {
  const origin = normalizeHijackOrigin(hijackOrigin);
  const { value } = splitPlatformProxy(platformProxy);
  return `function FindProxyForURL(url, host) {
  var origin = ${JSON.stringify(origin)};
  if (url === origin || url.indexOf(origin + "/") === 0) {
    return "PROXY ${value}";
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
