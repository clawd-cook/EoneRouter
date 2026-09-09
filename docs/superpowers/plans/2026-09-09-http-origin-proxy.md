# HTTP Origin Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the browser address bar on a configured HTTP origin while every request to that origin is answered from `storage/<eone-id>/` on the local platform.

**Architecture:** The MV3 extension PAC-proxies only the hijack origin to `127.0.0.1:3001`. `scripts/next-with-env.mjs` binds Next on loopback (ephemeral port) and an outer Node HTTP server on `.env` `PORT` that translates forward-proxy absolute-form requests into origin-form requests to Next. Existing `X-Eone-Id` DNR + `proxy.ts` serving is unchanged. PAC is skipped when the hijack origin is `http://localhost:3001` or `http://127.0.0.1:3001`.

**Tech Stack:** Next.js 16.2.9, Node 24.20.0 `node:http` / `node:test`, Chrome MV3 `proxy` + `declarativeNetRequestWithHostAccess`. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-http-origin-proxy-design.md`

## Global Constraints

- Runtime: nvm Node **v24.20.0** only; `which node` must be `$HOME/.nvm/versions/node/v24.20.0/bin/node`. Activate with `nvm use 24.20.0` in the current shell before every command.
- Package manager: **pnpm** only for local install/dev/test (`pnpm test`, `pnpm dev`). Do not switch the repo to npm.
- Do not add Jest, Vitest, Playwright, http-proxy, or tsx. Tests use `node --test --experimental-strip-types`.
- Do not change `lib/eone/classify.ts`, `proxy.ts` rewrite rules, `/__eone/files`, or admin upload.
- Do not implement HTTPS MITM, SPA fallback, or fall-through to the real origin.
- Hijack origin is `http:` only. Platform listen port matches `.env` `PORT` (currently `3001`). Extension PAC target is hardcoded `127.0.0.1:3001`.
- Chrome: Manifest V3. Add required permission `proxy`. No content scripts. Read `.agents/skills/chrome-extensions/SKILL.md` and `references/extensions/permissions.md` before editing `extension/`.
- Next.js/React: read `.agents/skills/next-best-practices/SKILL.md` and `.agents/skills/vercel-react-best-practices/SKILL.md` before editing `app/page.tsx`.
- Outer server upstream is **only** loopback Next. Never `http.request` the hijack host.
- Every `Run:` below assumes nvm 24.20.0 is already active in that shell.

---

## File structure

| File | Responsibility |
|------|----------------|
| `lib/eone/forward-proxy.ts` | Classify incoming URL/method; filter hop-by-hop / cookie headers; `createOuterServer` |
| `lib/eone/forward-proxy.test.ts` | Unit tests for classify + header filter |
| `lib/eone/outer-server.test.ts` | Stub-upstream tests for absolute-form vs origin-form |
| `lib/eone/next-listen.ts` | Strip `-p`/`--port` from Next argv; force `--hostname 127.0.0.1 -p <internal>` |
| `lib/eone/next-listen.test.ts` | Arg builder tests |
| `scripts/next-with-env.mjs` | Load `.env`; spawn Next on internal port; listen outer server on `PORT` |
| `extension/dnr.mjs` | `LOCAL_PROXY_PORT`, `shouldSkipPac`, `pacDecision`, `buildPacScript`, `normalizeHijackOrigin`; `DEFAULT_ORIGIN` → `http://localhost:3001` |
| `extension/dnr.test.mjs` | PAC / skip-PAC / http-only hijack tests |
| `extension/background.js` | After DNR rebuild, apply or restore `chrome.proxy.settings`; save `previousProxy` once |
| `extension/background.test.mjs` | Mock `chrome.proxy`; PAC vs skip vs clear |
| `extension/manifest.json` | Add `"proxy"` to `permissions` |
| `extension/popup.js` / `popup.html` / `popup.test.mjs` | Reject `https:` hijack origin; hint copy |
| `app/page.tsx` | Guide copy: hijack origin vs `http://localhost:3001` |

Do not edit `proxy.ts`, `lib/eone/classify.ts`, or admin routes.

---

### Task 1: Classify forward-proxy requests and filter headers

**Files:**
- Create: `lib/eone/forward-proxy.ts`
- Create: `lib/eone/forward-proxy.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type ClassifyIncoming = { action: "reject"; status: 400 | 405 } | { action: "forward"; pathAndQuery: string }`
  - `export function classifyIncoming(method: string, url: string): ClassifyIncoming`
  - `export function filterRequestHeaders(headers: NodeJS.Dict<string | string[] | undefined>): Record<string, string | string[]>`
  - `export function filterResponseHeaders(headers: NodeJS.Dict<string | string[] | undefined>): Record<string, string | string[]>`
  - `export const DROP_REQUEST_HEADERS: Set<string>` (lowercase names)

- [ ] **Step 1: Write the failing test**

Create `lib/eone/forward-proxy.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyIncoming,
  filterRequestHeaders,
  filterResponseHeaders,
} from "./forward-proxy.ts";

test("absolute http URL forwards path and query", () => {
  assert.deepEqual(
    classifyIncoming("GET", "http://hijack.example/a.js?x=1"),
    { action: "forward", pathAndQuery: "/a.js?x=1" },
  );
});

test("absolute http origin with no path forwards slash", () => {
  assert.deepEqual(classifyIncoming("GET", "http://hijack.example"), {
    action: "forward",
    pathAndQuery: "/",
  });
});

test("origin-form passes through", () => {
  assert.deepEqual(classifyIncoming("GET", "/__eone/admin"), {
    action: "forward",
    pathAndQuery: "/__eone/admin",
  });
});

test("CONNECT is rejected", () => {
  assert.deepEqual(classifyIncoming("CONNECT", "hijack.example:443"), {
    action: "reject",
    status: 405,
  });
});

test("https absolute URL is rejected", () => {
  assert.deepEqual(classifyIncoming("GET", "https://hijack.example/x"), {
    action: "reject",
    status: 400,
  });
});

test("drops cookie and hop-by-hop, keeps X-Eone-Id", () => {
  const out = filterRequestHeaders({
    cookie: "sid=1",
    authorization: "Bearer x",
    "proxy-authorization": "Basic x",
    connection: "keep-alive",
    "x-eone-id": "eone-1",
    swimlane: "eone-1",
    accept: "*/*",
  });
  assert.equal(out.cookie, undefined);
  assert.equal(out.authorization, undefined);
  assert.equal(out["proxy-authorization"], undefined);
  assert.equal(out.connection, undefined);
  assert.equal(out["x-eone-id"], "eone-1");
  assert.equal(out.swimlane, "eone-1");
  assert.equal(out.accept, "*/*");
});

test("response filter drops hop-by-hop", () => {
  const out = filterResponseHeaders({
    "content-type": "text/plain",
    connection: "close",
    "transfer-encoding": "chunked",
  });
  assert.equal(out["content-type"], "text/plain");
  assert.equal(out.connection, undefined);
  assert.equal(out["transfer-encoding"], undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-strip-types --experimental-default-type=module lib/eone/forward-proxy.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/eone/forward-proxy.ts`:

```ts
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
```

If `parsed.pathname` is empty, use `"/"`. `http://hijack.example` → pathname `""` or `"/"` depending on `URL`; if tests fail on `"http://hijack.example"`, set `pathAndQuery` to `(parsed.pathname || "/") + parsed.search`.

- [ ] **Step 4: Run tests and make sure they pass**

Run:

```bash
node --test --experimental-strip-types --experimental-default-type=module lib/eone/forward-proxy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/eone/forward-proxy.ts lib/eone/forward-proxy.test.ts
git commit -m "Add forward-proxy request classification and header filters."
```

---

### Task 2: Outer HTTP server against a stub upstream

**Files:**
- Modify: `lib/eone/forward-proxy.ts` (add `createOuterServer`)
- Create: `lib/eone/outer-server.test.ts`

**Interfaces:**
- Consumes: `classifyIncoming`, `filterRequestHeaders`, `filterResponseHeaders` from Task 1
- Produces:
  - `export function createOuterServer(input: { upstreamHost: string; upstreamPort: number }): import("node:http").Server`
  - Server handles `request` and `connect`. Upstream is `http.request` to `upstreamHost:upstreamPort` only. Sets `Host` to `upstreamHost:upstreamPort`. Does not follow redirects (`http.request` default). CONNECT: write `405` and destroy the socket.

- [ ] **Step 1: Write the failing test**

Create `lib/eone/outer-server.test.ts`:

```ts
import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createOuterServer } from "./forward-proxy.ts";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else reject(new Error("no port"));
    });
    server.on("error", reject);
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function request(
  port: number,
  options: http.RequestOptions,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, ...options }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

test("absolute-form GET forwards path without cookie", async () => {
  const seen: { url?: string; cookie?: string; eone?: string; host?: string }[] =
    [];
  const upstream = http.createServer((req, res) => {
    seen.push({
      url: req.url,
      cookie: req.headers.cookie,
      eone: req.headers["x-eone-id"],
      host: req.headers.host,
    });
    res.setHeader("Content-Type", "text/plain");
    res.end("ok");
  });
  const upPort = await listen(upstream);
  const outer = createOuterServer({
    upstreamHost: "127.0.0.1",
    upstreamPort: upPort,
  });
  const outerPort = await listen(outer);
  try {
    const res = await request(outerPort, {
      method: "GET",
      path: "http://hijack.example/a.js?x=1",
      headers: {
        Host: "hijack.example",
        Cookie: "sid=1",
        "X-Eone-Id": "eone-1",
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, "ok");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.url, "/a.js?x=1");
    assert.equal(seen[0]?.cookie, undefined);
    assert.equal(seen[0]?.eone, "eone-1");
    assert.equal(seen[0]?.host, `127.0.0.1:${upPort}`);
  } finally {
    await close(outer);
    await close(upstream);
  }
});

test("origin-form GET passes path through", async () => {
  const seen: string[] = [];
  const upstream = http.createServer((req, res) => {
    seen.push(req.url ?? "");
    res.end("guide");
  });
  const upPort = await listen(upstream);
  const outer = createOuterServer({
    upstreamHost: "127.0.0.1",
    upstreamPort: upPort,
  });
  const outerPort = await listen(outer);
  try {
    const res = await request(outerPort, { method: "GET", path: "/" });
    assert.equal(res.status, 200);
    assert.equal(res.body, "guide");
    assert.deepEqual(seen, ["/"]);
  } finally {
    await close(outer);
    await close(upstream);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-strip-types --experimental-default-type=module lib/eone/outer-server.test.ts
```

Expected: FAIL (`createOuterServer` is not exported).

- [ ] **Step 3: Implement `createOuterServer`**

Append to `lib/eone/forward-proxy.ts`:

```ts
import http from "node:http";

export function createOuterServer(input: {
  upstreamHost: string;
  upstreamPort: number;
}): http.Server {
  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const classified = classifyIncoming(method, url);
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
        const outHeaders = filterResponseHeaders(proxyRes.headers);
        res.writeHead(proxyRes.statusCode ?? 502, outHeaders);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end();
      }
    });
    req.pipe(proxyReq);
  });

  server.on("connect", (_req, socket) => {
    socket.write("HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n");
    socket.destroy();
  });

  return server;
}
```

Keep Node's `http` import at the top of the file (merge with the existing `IncomingHttpHeaders` import).

- [ ] **Step 4: Run tests**

Run:

```bash
node --test --experimental-strip-types --experimental-default-type=module lib/eone/forward-proxy.test.ts lib/eone/outer-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/eone/forward-proxy.ts lib/eone/outer-server.test.ts
git commit -m "Add outer HTTP server that forwards only to loopback Next."
```

---

### Task 3: Bind Next internally and put the outer server on `PORT`

**Files:**
- Create: `lib/eone/next-listen.ts`
- Create: `lib/eone/next-listen.test.ts`
- Modify: `scripts/next-with-env.mjs`
- Modify: `package.json` (`dev` / `start` must run next-with-env with `--experimental-strip-types` so it can import `../lib/eone/forward-proxy.ts` and `../lib/eone/next-listen.ts`)

**Interfaces:**
- Consumes: `createOuterServer` from Task 2
- Produces:
  - `export function stripPortFlags(args: string[]): string[]` — remove `-p` / `--port` and the following value
  - `export function internalNextArgs(args: string[], internalPort: number): string[]` — `stripPortFlags(args)` then append `--hostname`, `127.0.0.1`, `-p`, `String(internalPort)`
  - Do **not** pass `.env` `PORT` to Next

- [ ] **Step 1: Write the failing test**

Create `lib/eone/next-listen.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { internalNextArgs, stripPortFlags } from "./next-listen.ts";

test("strips -p and --port", () => {
  assert.deepEqual(stripPortFlags(["dev", "-p", "3001"]), ["dev"]);
  assert.deepEqual(stripPortFlags(["start", "--port", "3001"]), ["start"]);
});

test("forces loopback hostname and internal port", () => {
  assert.deepEqual(internalNextArgs(["dev", "-p", "3001"], 41234), [
    "dev",
    "--hostname",
    "127.0.0.1",
    "-p",
    "41234",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-strip-types --experimental-default-type=module lib/eone/next-listen.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `next-listen.ts`**

```ts
export function stripPortFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-p" || arg === "--port") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--port=")) continue;
    out.push(arg);
  }
  return out;
}

export function internalNextArgs(args: string[], internalPort: number): string[] {
  return [
    ...stripPortFlags(args),
    "--hostname",
    "127.0.0.1",
    "-p",
    String(internalPort),
  ];
}
```

- [ ] **Step 4: Run next-listen tests**

Run:

```bash
node --test --experimental-strip-types --experimental-default-type=module lib/eone/next-listen.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rewrite `scripts/next-with-env.mjs`**

Replace the file so it:

1. Loads `.env` as today (`process.env[key] ??= value`).
2. Reads public port: `Number(process.env.PORT || 3001)`.
3. Allocates an internal port:

```js
import net from "node:net";

function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const tmp = net.createServer();
    tmp.listen(0, "127.0.0.1", () => {
      const addr = tmp.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      tmp.close((err) => (err ? reject(err) : resolve(port)));
    });
    tmp.on("error", reject);
  });
}
```

4. Spawns Next with `internalNextArgs(process.argv.slice(2), internalPort)` — **never** append `.env` `PORT`.
5. Polls `http://127.0.0.1:${internalPort}/` until it connects (treat any HTTP response as ready, including 404). Timeout 60s for `dev`, 120s for `start`. Use `http.get` and ignore response body.
6. `import { createOuterServer } from "../lib/eone/forward-proxy.ts"` and `import { internalNextArgs } from "../lib/eone/next-listen.ts"`.
7. `const outer = createOuterServer({ upstreamHost: "127.0.0.1", upstreamPort: internalPort }); outer.listen(publicPort, "0.0.0.0")`.
8. On Next exit, `outer.close()` then exit with the same code. On SIGINT/SIGTERM, kill the Next child and close the outer server.

`stdio: "inherit"` for Next so Turbo logs still show.

Because this file imports `.ts`, change `package.json` scripts:

```json
"dev": "node --experimental-strip-types --experimental-default-type=module ./scripts/next-with-env.mjs dev",
"start": "node --experimental-strip-types --experimental-default-type=module ./scripts/next-with-env.mjs start",
```

Remove the old logic that pushed `-p` from `process.env.PORT` onto Next.

- [ ] **Step 6: Run unit tests**

Run:

```bash
pnpm test
```

Expected: PASS (existing + new).

- [ ] **Step 7: Smoke the wrapper (no extension)**

Run:

```bash
pnpm dev
```

In another shell:

```bash
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/
```

Expected: `200` (guide). Ctrl-C the dev server.

If `pnpm dev` fails on TS import from `.mjs`, keep `package.json` flags and add `assert { type: "module" }` is already implied by `"type"` — this repo has no `"type": "module"` in package.json; `.mjs` is ESM. If import still fails, rename the starter to `scripts/next-with-env.ts` and point `dev`/`start` at that file with the same node flags. Do not add tsx.

- [ ] **Step 8: Commit**

```bash
git add lib/eone/next-listen.ts lib/eone/next-listen.test.ts scripts/next-with-env.mjs package.json
git commit -m "Serve Next behind a loopback outer HTTP listener on PORT."
```

---

### Task 4: PAC helpers (skip local platform, http-only hijack)

**Files:**
- Modify: `extension/dnr.mjs`
- Modify: `extension/dnr.test.mjs`

**Interfaces:**
- Consumes: existing `normalizeOrigin`
- Produces:
  - `export const LOCAL_PROXY_HOST = "127.0.0.1"`
  - `export const LOCAL_PROXY_PORT = 3001`
  - `export const DEFAULT_ORIGIN = "http://localhost:3001"` (replace `3000`)
  - `export function normalizeHijackOrigin(origin: string): string` — `normalizeOrigin` then throw if protocol is not `http:`
  - `export function shouldSkipPac(origin: string): boolean` — true iff `normalizeOrigin(origin)` is `http://localhost:3001` or `http://127.0.0.1:3001`
  - `export function pacDecision(url: string, hijackOrigin: string): "DIRECT" | \`PROXY 127.0.0.1:3001\`` — after `normalizeHijackOrigin(hijackOrigin)`, if `url === origin || url.startsWith(origin + "/")` return proxy string else `DIRECT`
  - `export function buildPacScript(hijackOrigin: string): string` — PAC whose `FindProxyForURL` matches `pacDecision` (embed origin via `JSON.stringify`)

- [ ] **Step 1: Write failing tests at the end of `extension/dnr.test.mjs`**

```js
import {
  DEFAULT_ORIGIN,
  LOCAL_PROXY_PORT,
  buildPacScript,
  normalizeHijackOrigin,
  pacDecision,
  shouldSkipPac,
} from "./dnr.mjs";

test("default origin is local platform 3001", () => {
  assert.equal(DEFAULT_ORIGIN, "http://localhost:3001");
  assert.equal(LOCAL_PROXY_PORT, 3001);
});

test("normalizeHijackOrigin rejects https", () => {
  assert.throws(() => normalizeHijackOrigin("https://xxx.jd.com"));
});

test("shouldSkipPac for platform loopback only", () => {
  assert.equal(shouldSkipPac("http://localhost:3001"), true);
  assert.equal(shouldSkipPac("http://127.0.0.1:3001/"), true);
  assert.equal(shouldSkipPac("http://xxx.jd.com"), false);
  assert.equal(shouldSkipPac("http://localhost:3000"), false);
});

test("pacDecision matches origin and subpaths including port", () => {
  const origin = "http://xxx.jd.com:8080";
  assert.equal(pacDecision("http://xxx.jd.com:8080", origin), "PROXY 127.0.0.1:3001");
  assert.equal(
    pacDecision("http://xxx.jd.com:8080/app.js", origin),
    "PROXY 127.0.0.1:3001",
  );
  assert.equal(pacDecision("http://other.example/", origin), "DIRECT");
});

test("buildPacScript is evaluable and matches pacDecision", () => {
  const origin = "http://xxx.jd.com";
  const script = buildPacScript(origin);
  const fn = new Function(`${script}; return FindProxyForURL;`)();
  assert.equal(fn("http://xxx.jd.com/a", "xxx.jd.com"), "PROXY 127.0.0.1:3001");
  assert.equal(fn("http://other.example/", "other.example"), "DIRECT");
});
```

Merge imports into the existing import from `./dnr.mjs` instead of a second import block.

Keep existing tests that use `http://localhost:3000` as a generic origin — that origin must **not** skip PAC.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test extension/dnr.test.mjs
```

Expected: FAIL on missing exports / `DEFAULT_ORIGIN`.

- [ ] **Step 3: Implement in `extension/dnr.mjs`**

Change `DEFAULT_ORIGIN` to `"http://localhost:3001"`.

Add:

```js
export const LOCAL_PROXY_HOST = "127.0.0.1";
export const LOCAL_PROXY_PORT = 3001;

export function normalizeHijackOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized.startsWith("http:")) {
    throw new Error("劫持 Origin 必须是 http");
  }
  return normalized;
}

export function shouldSkipPac(origin) {
  const normalized = normalizeOrigin(origin);
  return (
    normalized === "http://localhost:3001" ||
    normalized === "http://127.0.0.1:3001"
  );
}

export function pacDecision(url, hijackOrigin) {
  const origin = normalizeHijackOrigin(hijackOrigin);
  if (url === origin || url.startsWith(`${origin}/`)) {
    return `PROXY ${LOCAL_PROXY_HOST}:${LOCAL_PROXY_PORT}`;
  }
  return "DIRECT";
}

export function buildPacScript(hijackOrigin) {
  const origin = normalizeHijackOrigin(hijackOrigin);
  return `function FindProxyForURL(url, host) {
  var origin = ${JSON.stringify(origin)};
  if (url === origin || url.indexOf(origin + "/") === 0) {
    return "PROXY ${LOCAL_PROXY_HOST}:${LOCAL_PROXY_PORT}";
  }
  return "DIRECT";
}
`;
}
```

Leave `normalizeOrigin` accepting `https:` so DNR unit tests stay valid; popup uses `normalizeHijackOrigin`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test extension/dnr.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/dnr.mjs extension/dnr.test.mjs
git commit -m "Add PAC builder and skip-PAC for local platform origin."
```

---

### Task 5: Background applies and restores Chrome proxy settings

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/background.js`
- Modify: `extension/background.test.mjs`

**Interfaces:**
- Consumes: `buildDnrRules`, `shouldSkipPac`, `buildPacScript`, `hostPermissionPattern`, `DNR_RULE_ID`, `DNR_SWIMLANE_RULE_ID`, `DEFAULT_ORIGIN` from `dnr.mjs`
- Produces: same `eone-apply` message. Rebuild sequence: DNR first, then PAC. Storage keys: `previousProxy` (Chrome `ProxyConfig` object), `pacActive` (boolean). Capture `previousProxy` from `chrome.proxy.settings.get` only when `pacActive` is not true. Restore via `chrome.proxy.settings.set({ value: previousProxy, scope: "regular" })` if `previousProxy` is set, else `chrome.proxy.settings.clear({ scope: "regular" })`. On PAC `set` failure: `updateDynamicRules` with `addRules: []` and restore proxy, then throw.

- [ ] **Step 1: Add `"proxy"` to `extension/manifest.json` `permissions`**

```json
"permissions": ["storage", "declarativeNetRequestWithHostAccess", "proxy"],
```

Read `.agents/skills/chrome-extensions/SKILL.md` first. Do not add `proxy` as optional.

- [ ] **Step 2: Rewrite `extension/background.test.mjs`**

Replace the whole file with:

```js
import assert from "node:assert/strict";
import { test } from "node:test";

const listeners = {};
const dnrUpdates = [];
const proxySets = [];
const proxyClears = [];
let granted = false;
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
        return { value: { mode: "system" } };
      },
      async set(update) {
        proxySets.push(update);
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

test("rebuild adds DNR and PAC when hijacking a real origin", async () => {
  granted = true;
  state.origin = "http://xxx.jd.com";
  state.id = "eone-1";
  state.pacActive = false;
  dnrUpdates.length = 0;
  proxySets.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.equal(dnrUpdates.at(-1).addRules.length, 2);
  assert.equal(proxySets.length, 1);
  assert.equal(proxySets[0].scope, "regular");
  assert.equal(proxySets[0].value.mode, "pac_script");
  assert.match(proxySets[0].value.pacScript.data, /xxx\.jd\.com/);
  assert.match(proxySets[0].value.pacScript.data, /PROXY 127\.0\.0\.1:3001/);
  assert.equal(state.pacActive, true);
  assert.deepEqual(state.previousProxy, { mode: "system" });
});

test("skip PAC for local platform origin", async () => {
  granted = true;
  state.origin = "http://localhost:3001";
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
```

`permissions.contains` still checks `hostPermissionPattern(origin)` only. Do not also require `proxy` in `contains`.

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node --test extension/background.test.mjs
```

Expected: FAIL (no `chrome.proxy` usage / default origin still 3000 in storage mock — update the mock `state.origin` to `http://xxx.jd.com` for the PAC-on test; keep a dedicated localhost:3001 test).

- [ ] **Step 4: Implement `extension/background.js`**

Replace with:

```js
import {
  buildDnrRules,
  buildPacScript,
  DNR_RULE_ID,
  DNR_SWIMLANE_RULE_ID,
  DEFAULT_ORIGIN,
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

async function applyPac(origin) {
  if (shouldSkipPac(origin)) {
    await restoreBrowserProxy();
    return;
  }
  const { pacActive } = await chrome.storage.local.get({ pacActive: false });
  if (!pacActive) {
    const current = await chrome.proxy.settings.get({});
    await chrome.storage.local.set({ previousProxy: current.value });
  }
  await chrome.proxy.settings.set({
    value: {
      mode: "pac_script",
      pacScript: { data: buildPacScript(origin) },
    },
    scope: "regular",
  });
  await chrome.storage.local.set({ pacActive: true });
}

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
  try {
    if (hasPermission) {
      await applyPac(origin);
    } else {
      await restoreBrowserProxy();
    }
  } catch (error) {
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
```

- [ ] **Step 5: Run background + dnr tests**

Run:

```bash
node --test extension/background.test.mjs extension/dnr.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/manifest.json extension/background.js extension/background.test.mjs
git commit -m "Apply a host-scoped PAC from the extension and restore it on clear."
```

---

### Task 6: Popup rejects https and explains PAC

**Files:**
- Modify: `extension/popup.js`
- Modify: `extension/popup.html`
- Modify: `extension/popup.test.mjs`

**Interfaces:**
- Consumes: `normalizeHijackOrigin`, `requiredHostPermissions` from `dnr.mjs` (stop using `normalizeOrigin` for save)
- Produces: same save/clear flow. Save uses `normalizeHijackOrigin`. Status / hint warn that PAC replaces the browser proxy until 清空, and that `pnpm dev` must be listening on `http://localhost:3001`.

- [ ] **Step 1: Write failing popup tests**

Add to `extension/popup.test.mjs`:

```js
test("https hijack origin is rejected before storage", async () => {
  calls.length = 0;
  elements.get("#origin").value = "https://xxx.jd.com";
  elements.get("#id").value = "eone-1";

  await elements.get("#save").listeners.click();

  assert.deepEqual(calls, []);
  assert.equal(elements.get("#status").textContent, "劫持 Origin 必须是 http");
});
```

Existing save tests using `http://localhost:3000` remain valid (that is a hijack origin, not skip-PAC).

- [ ] **Step 2: Run popup tests to verify fail**

Run:

```bash
node --test extension/popup.test.mjs
```

Expected: FAIL (`normalizeOrigin` still allows https, status is `Origin must be http or https` or similar).

- [ ] **Step 3: Update popup.js and popup.html**

In `popup.js`, import `normalizeHijackOrigin` instead of `normalizeOrigin` for save and clear (clear catch still falls back to `DEFAULT_ORIGIN`).

In `popup.html`, change the Origin label to `劫持 Origin`, add after the form (before `#status`):

```html
<p id="hint">
  只支持 http。保存后该站点流量会转到本机
  <code>http://localhost:3001</code>
  （先运行 pnpm dev）。会暂时替换浏览器代理，清空后恢复。
</p>
```

Style `#hint` at 12px, color `#5b6573`, margin-top 8px.

- [ ] **Step 4: Run popup tests**

Run:

```bash
node --test extension/popup.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/popup.js extension/popup.html extension/popup.test.mjs
git commit -m "Reject https hijack origins and document local PAC in the popup."
```

---

### Task 7: Guide page copy

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: none
- Produces: Chinese guide that distinguishes hijack Origin (the real site) from the platform `http://localhost:3001`, and says the local process must be running.

- [ ] **Step 1: Read Next/React skills, then edit `app/page.tsx`**

Keep the existing layout/classes. Replace the second list item and add a fifth item. Target copy:

```tsx
<li>
  填写要劫持的站点 Origin（http，例如{" "}
  <code className="font-mono">http://xxx.jd.com</code>
  ）和 <code className="font-mono">eone-xxxx</code>
  。本机平台固定为{" "}
  <code className="font-mono">http://localhost:3001</code>
</li>
```

And after the current last item:

```tsx
<li>
  劫持真实站点时请先保持本页对应的本地进程在跑；清空插件标识后浏览器会重新访问真实站点
</li>
```

Keep the admin upload bullet. Keep “打开当前这个地址” for the v1 (PAC skipped) path.

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Targeted eslint**

Run:

```bash
pnpm exec eslint app/page.tsx
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "Explain HTTP origin hijack and the local platform port on the guide page."
```

---

### Task 8: Full regression + manual checklist

**Files:** none required unless a test glob missed a file

- [ ] **Step 1: Run the full unit suite**

Run:

```bash
pnpm test
```

Expected: all tests PASS, including previous DNR/classify/serve tests.

- [ ] **Step 2: Manual (operator)**

1. `nvm use 24.20.0` then `pnpm dev`. Confirm `curl http://127.0.0.1:3001/` is the guide.
2. Reload unpacked `extension/`.
3. Save Origin `http://localhost:3001` + a real package id → open that URL → v1 header preview, PAC skipped.
4. Save a real HTTP hijack origin + the same id → address bar stays on that origin, assets come from `storage`. A missing path is platform 404, not the live site.
5. 清空 → live site and previous Chrome proxy return.

- [ ] **Step 3: Commit only if Step 1–2 caused fixes**

If you had to fix code, commit those fixes with a message that states the bug. If nothing changed, do not create an empty commit.

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| PAC only for hijack HTTP origin → `127.0.0.1:3001` | 4, 5 |
| Skip PAC on `localhost:3001` / `127.0.0.1:3001` | 4, 5 |
| No platform-origin popup field | 6 (unchanged field count) |
| Outer server absolute-form vs origin-form; never fetch hijack host | 1, 2, 3 |
| Next not bound to `.env` PORT; outer is | 3 |
| Drop Cookie / hop-by-hop; keep `X-Eone-Id` | 1, 2 |
| CONNECT / https rejected | 1, 2, 4, 6 |
| Restore previous Chrome proxy; `previousProxy` not overwritten by our PAC | 5 |
| DNR rollback if PAC fails | 5 |
| `proxy` required permission | 5 |
| Guide copy | 7 |
| Existing classify/files/admin untouched | Global constraint |
| Tests listed in spec | 1, 2, 4, 5, 8 |
