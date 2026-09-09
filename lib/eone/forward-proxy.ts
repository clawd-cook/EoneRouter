import type { IncomingHttpHeaders } from "node:http";

export type ClassifyIncoming =
  | { action: "reject"; status: 400 | 405 }
  | { action: "forward"; pathAndQuery: string };

const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

export const DROP_REQUEST_HEADERS = new Set<string>([
  ...HOP_BY_HOP,
  "cookie",
  "authorization",
]);

const DROP_RESPONSE_HEADERS = new Set<string>(HOP_BY_HOP);

export function classifyIncoming(method: string, url: string): ClassifyIncoming {
  if (method.toUpperCase() === "CONNECT") {
    return { action: "reject", status: 405 };
  }
  if (url.startsWith("https://")) {
    return { action: "reject", status: 400 };
  }
  if (url.startsWith("http://")) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { action: "reject", status: 400 };
    }
    return {
      action: "forward",
      pathAndQuery: `${parsed.pathname}${parsed.search}` || "/",
    };
  }
  if (url.startsWith("/")) {
    return { action: "forward", pathAndQuery: url };
  }
  return { action: "reject", status: 400 };
}

function omitDropped(
  headers: IncomingHttpHeaders | NodeJS.Dict<string | string[] | undefined>,
  dropped: Set<string>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (dropped.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

export function filterRequestHeaders(
  headers: IncomingHttpHeaders | NodeJS.Dict<string | string[] | undefined>,
): Record<string, string | string[]> {
  return omitDropped(headers, DROP_REQUEST_HEADERS);
}

export function filterResponseHeaders(
  headers: IncomingHttpHeaders | NodeJS.Dict<string | string[] | undefined>,
): Record<string, string | string[]> {
  return omitDropped(headers, DROP_RESPONSE_HEADERS);
}
