import http, { type IncomingHttpHeaders } from "node:http";

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

export function createOuterServer(input: {
  upstreamHost: string;
  upstreamPort: number;
}): http.Server {
  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const eoneId = req.headers["x-eone-id"];
    const classified = classifyIncoming(method, url);
    console.info("[eone] outer", {
      method,
      url: url.length > 200 ? `${url.slice(0, 200)}…` : url,
      action: classified.action,
      status: classified.action === "reject" ? classified.status : undefined,
      path:
        classified.action === "forward" ? classified.pathAndQuery : undefined,
      eoneId: typeof eoneId === "string" ? eoneId : eoneId?.[0] ?? null,
    });
    if (classified.action === "reject") {
      res.statusCode = classified.status;
      res.end();
      return;
    }
    const headers = filterRequestHeaders(req.headers);
    headers.host = `${input.upstreamHost}:${input.upstreamPort}`;
    const proxyReq = http.request(
      {
        hostname: input.upstreamHost,
        port: input.upstreamPort,
        method,
        path: classified.pathAndQuery,
        headers,
      },
      (proxyRes) => {
        console.info("[eone] outer←next", {
          method,
          path: classified.pathAndQuery,
          status: proxyRes.statusCode ?? 502,
        });
        const outHeaders = filterResponseHeaders(proxyRes.headers);
        res.writeHead(proxyRes.statusCode ?? 502, outHeaders);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", (err) => {
      console.error("[eone] outer→next failed", {
        method,
        path: classified.pathAndQuery,
        message: err.message,
      });
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end();
      }
    });
    req.pipe(proxyReq);
  });

  server.on("connect", (_req, socket) => {
    console.warn("[eone] outer rejected CONNECT");
    socket.write("HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n");
    socket.destroy();
  });

  return server;
}
