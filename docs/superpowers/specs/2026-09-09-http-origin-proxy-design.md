# HTTP origin proxy: serve storage packages on a real origin URL

Keep the address bar on a configured HTTP origin while every request to that origin is answered from `storage/<eone-id>/` on the local platform.

Date: 2026-09-09

This extends [EoneRouter v1](./2026-09-08-eone-router-design.md). Package layout, `X-Eone-Id`, classify/rewrite, `/__eone/files`, and the admin upload page stay as they are. v1 listed “hijacking third-party origins” as a non-goal; this spec adds that path for **local HTTP only**.

## Goal

An operator sets a **hijack origin** (for example `http://xxx.jd.com`) and an eone id in the Chrome extension, with the Next process running on this machine. Opening that origin keeps the address bar unchanged. Document, static, and same-origin API requests all come from `storage/<id>/`. A path with no file is a platform 404. Nothing is fetched from the real origin.

The platform itself is always local: `http://localhost:` plus `PORT` from `.env` (currently `3001`). The popup does not have a platform-origin field.

Without an id, PAC and DNR are off; visiting the hijack origin hits the real service again.

## Non-goals

- HTTPS origins, TLS interception, or custom certificates
- SPA fallback (`index.html` for unknown paths) — same as v1
- Overlay / fall-through to the real origin when a file is missing
- Storing packages inside the extension or `chrome.storage`
- Remote/JDOS as the PAC target (no platform-origin field)
- Multiple hijack origins at once
- WebSocket upgrade through the shim
- Composing with an existing corporate PAC beyond save/restore of the previous `chrome.proxy.settings` value
- Changing admin upload, classify rules, or file resolution

## Components

| Unit | Location | Responsibility |
|------|----------|----------------|
| Popup | `extension/popup.html` / `popup.js` | Hijack origin + identifier; Save / Clear |
| Background | `extension/background.js` | Rebuild DNR; set or clear PAC; restore previous proxy |
| PAC / DNR helpers | `extension/dnr.mjs` (and a small PAC helper next to it) | Header rules; PAC text; skip-PAC when hijack is the local platform |
| Start wrapper | `scripts/next-with-env.mjs` | Read `.env` `PORT`; start Next on loopback; listen on `PORT` as the outer server |
| Outer HTTP server | new helper under `lib/eone/` (or `scripts/`) | Distinguish forward-proxy vs origin requests; strip cookies; forward to Next |
| Existing Edge `proxy.ts` + `/__eone/files` | unchanged | Serve from `storage/` using `X-Eone-Id` |

New Manifest V3 permission: `proxy` as a **required** permission (in addition to today’s `storage` and `declarativeNetRequestWithHostAccess`). Do not make `proxy` optional.

## Identifier, storage, headers

Unchanged from v1:

- Id pattern: `^eone-[A-Za-z0-9_-]+$`
- Files: `<repoRoot>/storage/<id>/` (or `EONE_STORAGE_ROOT`)
- Request header `X-Eone-Id`; existing Swimlane header on XHR stays
- Query string does not affect file lookup; hash never reaches the server
- `/` → `index.html`; other paths are exact files; no directory index; no SPA fallback
- `Cache-Control: no-store`

## Two origins (only one is configurable)

| Role | Value |
|------|--------|
| Hijack origin | Popup field. Must be `http:`. Example `http://xxx.jd.com`. |
| Platform | Always `http://localhost:${PORT}` from `.env`. Current repo: `PORT=3001`. |

The extension cannot read `.env`. It uses a constant that matches this repo: **proxy and skip-PAC port `3001`**. If someone changes `.env` `PORT`, they must change that constant too (document in the popup guide text).

Skip PAC when the hijack origin is `http://localhost:3001` or `http://127.0.0.1:3001`. Then behavior is v1: DNR headers only, operator opens that URL directly.

## Request flow

Hijack origin is a real service (DNS unchanged):

1. Operator saves hijack origin `http://xxx.jd.com` and id `eone-1`.
2. Extension requests host access for that origin, then installs DNR (`X-Eone-Id` / Swimlane) and PAC.
3. PAC: URLs on that origin only → `PROXY 127.0.0.1:3001`; everything else `DIRECT`.
4. Browser keeps the address bar `http://xxx.jd.com/...` and sends a forward-proxy request to `127.0.0.1:3001`:
   `GET http://xxx.jd.com/path HTTP/1.1` plus `X-Eone-Id`.
5. Outer server turns that into `GET /path` to internal Next, **never** to `xxx.jd.com`.
6. `proxy.ts` rewrites to `/__eone/files/...`; the file handler reads `storage/eone-1/...`.
7. Clear id: remove DNR and PAC, restore the previous Chrome proxy setting; hijack origin may stay in `chrome.storage.local`.

Direct visit to `http://localhost:3001` (origin-form `GET /path`) still hits the guide, admin, and v1 header routing.

## Outer server protocol

`pnpm dev` / `pnpm start` already run `scripts/next-with-env.mjs`. That script must:

1. Load `.env`. Public listen port is `PORT` (today `3001`).
2. Start Next bound only to `127.0.0.1` on an **ephemeral** port (bind `0`, then read the assigned port). **Do not** pass `.env` `PORT` to Next (`-p` / `--port`). Next is only reachable through the outer server.
3. Listen on `0.0.0.0:${PORT}` as a tiny Node HTTP server.

For each incoming request:

| Incoming | Action |
|----------|--------|
| `CONNECT` | 405 or 501; close. No HTTPS tunnel. |
| URL starts with `https://` | 400 |
| URL starts with `http://` (absolute-form) | Parse URL. Forward **path + query** to internal Next as origin-form. Do not connect to the URL’s host. |
| URL starts with `/` (origin-form) | Forward as-is to internal Next. |

Forwarding rules:

- Preserve method and body.
- Preserve `X-Eone-Id`, `Swimlane`, `Accept`, `Accept-Language`, `User-Agent`, `Content-Type`.
- Drop `Cookie`, `Authorization`, `Proxy-Authorization`, and hop-by-hop headers (`Connection`, `Keep-Alive`, `Proxy-Authenticate`, `Proxy-Connection`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`).
- Set `Host` to the internal Next host:port (`127.0.0.1:<ephemeral>`).
- Copy status and response headers from Next except hop-by-hop; body streams through.
- Do not follow Next redirects as a client that would leak to the real origin; pass the redirect response through if Next issues one (v1 serving does not redirect for files).

The outer server is not a general internet proxy: the only upstream is local Next. It does not need to know the hijack origin.

WebSocket `Upgrade` is not implemented; the request may fail. Static packages do not need it.

Docker/nginx already reverse-proxies to `127.0.0.1:3001`. After this change that port is the outer server, so container HTTP still works. Operator PAC to `127.0.0.1:3001` only works when the browser and the Next process share that loopback (local preview). That matches “platform is always localhost”.

## Chrome extension

Popup fields (Chinese UI):

- Origin — hijack origin (`http` only)
- 标识 — eone id, may be empty
- 保存 / 清空

`Clear` empties the identifier, removes DNR, removes PAC, restores the previous proxy, and keeps the last hijack origin.

Persist `{ origin, id }` in `chrome.storage.local` (`origin` now means hijack origin). Persist the previous proxy config under a separate key (for example `previousProxy`) taken from `chrome.proxy.settings.get` **before** the first successful PAC apply in a session; do not overwrite `previousProxy` with our own PAC.

Save sequence (all or nothing after permissions):

1. `normalizeOrigin`; reject non-`http:`.
2. If id is non-empty, `permissions.request` for host access on the hijack origin (same optional host pattern as v1). `proxy` is already granted via the manifest.
3. `chrome.storage.local.set({ origin, id })`.
4. Rebuild DNR (existing `buildDnrRules`).
5. If id is non-empty and PAC should run, `chrome.proxy.settings.set` with `scope: "regular"` and PAC as below. If it should be skipped (local platform), `chrome.proxy.settings.set` restore `previousProxy` or leave system proxy if we never replaced it.
6. On any failure after a mutation: remove DNR rules, restore proxy, surface the error in the popup. Do not keep a PAC without DNR or DNR without a saved id.

PAC (`FindProxyForURL`): if `url` is exactly the hijack origin or starts with `hijackOrigin + "/"`, return `PROXY 127.0.0.1:3001`; else `DIRECT`. Compare against `normalizeOrigin` output (no path). Do not use `host ==` only: `http://xxx.jd.com:8080` must match port.

DNR URL filter stays on the hijack origin (existing regex), including `main_frame` and subresources as today.

Empty id: no DNR, PAC restored to `previousProxy` (or not applied).

## Error handling

| Situation | Result |
|-----------|--------|
| User denies host or proxy permission | Popup error; no new DNR; no PAC change |
| PAC `set` fails | Rollback DNR; restore proxy; popup error |
| Platform not listening on `3001` | Browser `ERR_PROXY_CONNECTION_FAILED` (or equivalent). Popup help text: start the local app (`pnpm dev` / `pnpm start`) so `.env` `PORT` is up. |
| Illegal id | Existing `/__eone/invalid` 400 HTML |
| Missing package | Existing missing-package 404 HTML |
| Missing file | Existing short 404 body |
| `https://` hijack origin typed in popup | Reject on save; do not apply |

Guide page (`/` without header) should mention: set the **site** origin to hijack, keep the platform at `http://localhost:3001`, and that the local process must be running for hijack to work.

## Security

- Outer server must not proxy to arbitrary hosts; upstream is only loopback Next.
- Cookies for the hijack origin are not forwarded to Next (avoids writing session cookies into logs or handlers).
- v1 trust model unchanged: anyone who can reach the local process and send `X-Eone-Id` can read packages.
- `proxy` permission replaces Chrome’s proxy settings for the profile while PAC is active. Clear must restore. Warn in the popup that other proxy extensions / corporate PAC are displaced until Clear.

## Testing

Pure helpers (no Chrome, no full Next) with `node:test`:

- Absolute `http://hijack.example/a.js?x=1` → forward path `/a.js?x=1` (file lookup still ignores query, as v1).
- Origin-form `/__eone/admin` → pass through path.
- Reject `CONNECT` and `https://` absolute URLs.
- Forwarded headers omit `Cookie` and keep `X-Eone-Id`.
- PAC: hijack origin and subpaths match `PROXY 127.0.0.1:3001`; other hosts `DIRECT`; `http://localhost:3001` skip-PAC is true; `http://xxx.jd.com` skip-PAC is false.
- Existing DNR, classify, serve, path tests still pass.

Outer server: start the helper against a stub upstream; assert one absolute-form GET and one origin-form GET.

Manual:

1. `pnpm dev` (Node 24.20.0). Reload unpacked extension.
2. Save hijack origin + `eone-1` (or a real snapshot id). Open the hijack URL: address bar unchanged, HTML/JS from `storage`.
3. A path not in the package → 404, not the live site.
4. Clear: live site returns; Chrome proxy back to what it was.
5. Direct `http://localhost:3001` still shows the guide without a header.

## Success criteria

1. With local platform on `.env` `PORT` and an HTTP hijack origin pointing at a real service, that origin’s traffic is answered from `storage/<id>/` and the address bar does not switch to localhost.
2. Missing files 404; no request is made to the real origin for hijacked URLs.
3. Clear restores the real origin and the previous browser proxy.
4. v1 localhost + header preview still works (PAC skipped).
5. Automated tests above pass.

## Data flow (summary)

```
Browser  --PAC-->  127.0.0.1:3001 outer  -->  127.0.0.1:<ephemeral> Next
                     |                         |
                     | origin-form /           | X-Eone-Id
                     v                         v
              localhost guide/admin      storage/<id>/ via proxy.ts
```
