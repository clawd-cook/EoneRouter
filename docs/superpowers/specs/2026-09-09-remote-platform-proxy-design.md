# Remote platform proxy: PAC targets deploy host via :80

Date: 2026-09-09

This extends [HTTP origin proxy](./2026-09-09-http-origin-proxy-design.md). Package layout, `X-Eone-Id`, classify/rewrite, `/__eone/files`, zip admin upload, and the outer Node server stay as they are. The previous design’s non-goal “Remote/JDOS as the PAC target” is **replaced** by this document for jdtest-style deploys where only port 80 is reachable.

## Goal

An operator uploads packages on a remote EoneRouter (for example `http://eone-router.jdtest.net`). They configure the Chrome extension so that traffic for a hijack HTTP origin is PAC-proxied to **that remote host’s port 80** (nginx → outer on container `3001`), not to the operator’s laptop `127.0.0.1:3001`.

Local development keeps working: the default platform proxy remains `127.0.0.1:3001`.

## Non-goals

- Exposing container port 3001 on the public / test VIP
- HTTPS hijack origins or TLS interception
- Using the remote host as a general internet forward proxy (upstream remains local Next / `storage/` only)
- Multiple platform proxies or multiple hijack origins at once
- Changing zip upload, admin UI contracts, or Next internal ephemeral ports

## Why not PAC → remote:3001

Operators verified:

```text
curl --proxy http://eone-router.jdtest.net:3001 http://example.com/
→ Connection refused
```

Nginx on **80** reverse-proxies to `127.0.0.1:3001` inside the container. External clients can reach admin/upload on `:80`, but not `:3001`. Therefore the PAC target for remote use must be **`host:80`**.

## Components

| Unit | Change |
|------|--------|
| Extension popup | New field **平台代理** (`host:port`); hint text updated |
| `extension/dnr.mjs` | PAC builder takes platform proxy host/port; skip-PAC compares hijack origin to the configured platform |
| `extension/background.js` | Read `platformProxy` from storage when applying PAC |
| `docker/nginx.conf` | Document / ensure absolute-form (PAC-style) requests on `:80` are passed to outer `:3001` without contacting the hijack host |
| README | Remote hijack uses `:80`; do not set platform proxy to `:3001` on jdtest |

## Storage and defaults

`chrome.storage.local`:

| Key | Meaning | Default |
|-----|---------|---------|
| `origin` | Hijack origin (`http:` only) | `http://localhost:3001` (unchanged) |
| `id` | Eone id | `""` |
| `platformProxy` | PAC `PROXY` target as `host:port` | `127.0.0.1:3001` |

Validation for `platformProxy`:

- Accept `host:port` (IPv4 or hostname)
- Optionally accept `http://host:port` and normalize to `host:port` (strip scheme and path)
- Reject empty host, missing port, non-numeric port, HTTPS scheme, or path/query/hash
- Default constant: `DEFAULT_PLATFORM_PROXY = "127.0.0.1:3001"` (same host/port as today’s `LOCAL_PROXY_*`)

Clear id: empties `id`, removes DNR/PAC, restores previous browser proxy; **keeps** `origin` and `platformProxy`.

## PAC behavior

`buildPacScript(hijackOrigin, platformProxy)`:

- Normalize hijack origin as today (`http:` only)
- Parse `platformProxy` to `host` and `port`
- For URLs equal to the hijack origin or under `hijackOrigin + "/"`: return `PROXY host:port`
- Else: `DIRECT`

`shouldSkipPac(hijackOrigin, platformProxy)`:

- True when the hijack origin’s host:port is the same endpoint as `platformProxy` **and** the hijack origin is loopback (`localhost` / `127.0.0.1`) with that port — i.e. operator is previewing the platform URL itself without needing PAC
- Simpler rule that matches today’s intent: skip PAC only when hijack origin is `http://127.0.0.1:<platformPort>` or `http://localhost:<platformPort>` **and** `platformProxy` host is loopback with that same port
- When `platformProxy` is a remote host (for example `eone-router.jdtest.net:80`), never skip PAC for that remote admin origin solely because someone typed it as hijack — if they set hijack to the platform URL on a remote host, PAC would loop; **reject save** if `normalizeHijackOrigin(origin)` host:port equals `platformProxy` (hijack origin must not be the platform proxy endpoint)

## Request flow (remote)

1. Package exists on remote `storage/<id>/` (uploaded via admin on `:80`).
2. Extension: hijack origin `http://jdcleaning-man-web-test.web.jdtest.net`, id `eone-…`, platform proxy `eone-router.jdtest.net:80`.
3. DNR adds `X-Eone-Id` (and Swimlane) on that origin.
4. PAC sends only that origin’s requests to `PROXY eone-router.jdtest.net:80`.
5. Browser issues an HTTP proxy-style request to nginx (absolute-form URI or equivalent). Nginx **must not** open a connection to the hijack hostname; it forwards to `127.0.0.1:3001`.
6. Outer → Next → existing rewrite serves `storage/<id>/`. Address bar stays on the hijack origin.

## Nginx requirements

Existing:

```nginx
client_max_body_size 100m;
location / {
  proxy_pass http://127.0.0.1:3001;
  ...
}
```

Required behavior for PAC clients:

- Accept requests whose request-target is an absolute URI (`http://hijack-host/path`) aimed at this server as an HTTP proxy hop
- Forward to outer on `127.0.0.1:3001` using a form outer already understands (absolute-form preserved **or** origin-form path + headers). Prefer preserving enough information that outer/Next still see path + `X-Eone-Id`
- Do **not** use variables that would make nginx proxy to `$host` of the hijack site
- Keep `Host` rewrite safe: outer already sets `Host` to the Next upstream; nginx may set `Host` to the upstream address when proxying to `3001`

If a stock `proxy_pass http://127.0.0.1:3001;` already strips absolute-form to origin-form path before outer, that is acceptable: DNR + path + Next rewrite still serve the package. Document the chosen behavior in comments in `docker/nginx.conf`.

Reload nginx after config changes on jdtest.

## Extension UI (Chinese)

- Label: 平台代理  
- Placeholder: `127.0.0.1:3001`  
- Hint: 劫持流量发往该 `host:port`。远程部署填 `eone-router.jdtest.net:80`（不要填 3001，外网不通）。本地开发保持默认。保存后会暂时替换浏览器代理，清空标识后恢复。

## Error / failure modes

| Case | Expected |
|------|----------|
| Platform proxy still `127.0.0.1:3001` but only remote has the package | Hijack fails or shows empty/missing locally — operator must set remote `:80` |
| Platform proxy `host:3001` on jdtest | Connection refused (known); UI/README warn against it |
| Hijack origin equals platform proxy endpoint | Save rejected with a clear Chinese error |
| nginx not updated / misconfigured to follow hijack host | Wrong content or errors; logs show upstream to hijack host — treat as deploy bug |

## Testing

Automated (`node:test` / extension tests):

- `buildPacScript` / `pacDecision` use configured `platformProxy`
- Default remains `127.0.0.1:3001`
- Normalize / reject bad `platformProxy` values
- Reject hijack origin that collides with platform proxy
- Background rebuild reads `platformProxy` into PAC data
- Existing skip-PAC / restore-proxy tests updated for the new signature

Manual:

1. Remote: platform proxy `eone-router.jdtest.net:80` + real id → open hijack HTTP origin → content from remote package  
2. `curl -v --proxy http://eone-router.jdtest.net:80 http://<hijack-host>/` with `X-Eone-Id` → not connection refused; body from package or known platform response  
3. Local default platform proxy + local `pnpm start` → previous local hijack behavior still works  

## Success criteria

1. Remote upload/list remain on `:80`; hijack PAC can target the same host `:80` and receive package bytes from remote storage.  
2. Default local PAC target unchanged for developers who never touch the new field.  
3. README and popup state that jdtest must use `:80`, not `:3001`.  
4. Spec and nginx comments no longer claim “PAC is always loopback only.”
