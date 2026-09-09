# Remote Platform Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Chrome extension PAC-proxy hijack-origin traffic to a configurable `host:port` (remote `eone-router.jdtest.net:80` via nginx), while keeping the default `127.0.0.1:3001` for local development.

**Architecture:** Add `platformProxy` to extension storage and PAC generation. Nginx on `:80` continues to reverse-proxy to container outer `:3001` and must not follow the hijack hostname. Outer/Next/admin upload are unchanged.

**Tech Stack:** Chrome MV3 extension (`extension/*.mjs|js|html`), `node:test`, existing `docker/nginx.conf`. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-remote-platform-proxy-design.md`

## Global Constraints

- Runtime: nvm Node **v24.20.0** only; `which node` must be `$HOME/.nvm/versions/node/v24.20.0/bin/node`. Activate with `nvm use 24.20.0` in the current shell before every command.
- Package manager: **pnpm** only. Tests: `pnpm test` / `node --test --experimental-strip-types`.
- Do not change `lib/eone/classify.ts`, `proxy.ts`, admin zip upload routes, or Next ephemeral-port binding.
- Do not expose container `3001` on the VIP. Remote PAC target is **`:80`**.
- Hijack origin remains `http:` only. HTTPS hijack is out of scope.
- Chrome: Manifest V3. Read `.agents/skills/chrome-extensions/SKILL.md` before editing `extension/`.
- Every `Run:` below assumes nvm 24.20.0 is already active in that shell.

---

## File structure

| File | Responsibility |
|------|----------------|
| `extension/dnr.mjs` | `DEFAULT_PLATFORM_PROXY`, `normalizePlatformProxy`, `hijackCollidesWithPlatform`, update `shouldSkipPac` / `pacDecision` / `buildPacScript` |
| `extension/dnr.test.mjs` | Unit tests for normalize, collide, PAC target, skip-PAC |
| `extension/background.js` | Read `platformProxy` from storage; pass into PAC helpers; log actual PAC target |
| `extension/background.test.mjs` | Assert PAC data uses configured remote proxy; clear keeps `platformProxy` |
| `extension/popup.html` | 平台代理 field + hint |
| `extension/popup.js` | Load/save `platformProxy`; reject collision; Chinese errors |
| `extension/popup.test.mjs` | Save/normalize/collision coverage (extend existing mocks) |
| `docker/nginx.conf` | Comments + safe `Host` for fixed upstream (no `$host` hijack follow) |
| `README.md` | Remote hijack uses `:80`; platform proxy field |

Do not edit `app/%5F_eone/admin/**` or `lib/eone/forward-proxy.ts` unless a test proves nginx→outer breaks (then stop and report).

---

### Task 1: Normalize and validate `platformProxy`

**Files:**
- Modify: `extension/dnr.mjs`
- Modify: `extension/dnr.test.mjs`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `export const DEFAULT_PLATFORM_PROXY = "127.0.0.1:3001"`
  - `export function normalizePlatformProxy(raw: string): string` — returns `host:port`; throws `Error` with Chinese message on invalid input
  - Keep exporting `LOCAL_PROXY_HOST` / `LOCAL_PROXY_PORT` (still used as defaults / docs); `DEFAULT_PLATFORM_PROXY === \`${LOCAL_PROXY_HOST}:${LOCAL_PROXY_PORT}\``

- [ ] **Step 1: Write the failing tests**

In `extension/dnr.test.mjs`, import the new symbols and add:

```js
test("DEFAULT_PLATFORM_PROXY matches local loopback 3001", () => {
  assert.equal(DEFAULT_PLATFORM_PROXY, "127.0.0.1:3001");
});

test("normalizePlatformProxy accepts host:port and http URL", () => {
  assert.equal(
    normalizePlatformProxy("eone-router.jdtest.net:80"),
    "eone-router.jdtest.net:80",
  );
  assert.equal(
    normalizePlatformProxy("http://eone-router.jdtest.net:80"),
    "eone-router.jdtest.net:80",
  );
  assert.equal(normalizePlatformProxy("127.0.0.1:3001"), "127.0.0.1:3001");
});

test("normalizePlatformProxy rejects bad values", () => {
  assert.throws(() => normalizePlatformProxy(""));
  assert.throws(() => normalizePlatformProxy("eone-router.jdtest.net"));
  assert.throws(() => normalizePlatformProxy("https://eone-router.jdtest.net:80"));
  assert.throws(() => normalizePlatformProxy("eone-router.jdtest.net:80/path"));
  assert.throws(() => normalizePlatformProxy("host:abc"));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test --experimental-strip-types extension/dnr.test.mjs`

Expected: FAIL (`DEFAULT_PLATFORM_PROXY` / `normalizePlatformProxy` not exported)

- [ ] **Step 3: Implement**

In `extension/dnr.mjs`:

```js
export const DEFAULT_PLATFORM_PROXY = `${LOCAL_PROXY_HOST}:${LOCAL_PROXY_PORT}`;

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
    if (!url.port) {
      throw new Error("平台代理必须包含端口");
    }
    hostPort = `${url.hostname}:${url.port}`;
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test --experimental-strip-types extension/dnr.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add extension/dnr.mjs extension/dnr.test.mjs
git commit -m "Add normalizePlatformProxy for configurable PAC targets."
```

---

### Task 2: PAC helpers take `platformProxy` + collision check

**Files:**
- Modify: `extension/dnr.mjs`
- Modify: `extension/dnr.test.mjs`

**Interfaces:**
- Consumes: `normalizePlatformProxy`, `normalizeHijackOrigin`, `normalizeOrigin`
- Produces:
  - `export function shouldSkipPac(hijackOrigin: string, platformProxy?: string): boolean`
  - `export function pacDecision(url: string, hijackOrigin: string, platformProxy?: string): string`
  - `export function buildPacScript(hijackOrigin: string, platformProxy?: string): string`
  - `export function hijackCollidesWithPlatform(hijackOrigin: string, platformProxy: string): boolean`
  - Default `platformProxy` argument = `DEFAULT_PLATFORM_PROXY` when omitted (keeps old call sites green during migration)

Semantics (spec):

- `shouldSkipPac`: true only when normalized hijack is `http://localhost:<port>` or `http://127.0.0.1:<port>` **and** normalized `platformProxy` host is `localhost` or `127.0.0.1` with the **same** port.
- `pacDecision` / `buildPacScript`: `PROXY ${platformProxy}` instead of hardcoded `127.0.0.1:3001`.
- `hijackCollidesWithPlatform`: true when hijack origin’s `hostname:port` (default port 80 if omitted in URL) equals `platformProxy`.

- [ ] **Step 1: Write the failing tests**

Replace/extend existing PAC tests:

```js
test("shouldSkipPac for loopback platform only", () => {
  assert.equal(shouldSkipPac("http://localhost:3001", "127.0.0.1:3001"), true);
  assert.equal(shouldSkipPac("http://127.0.0.1:3001/", "127.0.0.1:3001"), true);
  assert.equal(shouldSkipPac("http://xxx.jd.com", "127.0.0.1:3001"), false);
  assert.equal(
    shouldSkipPac("http://eone-router.jdtest.net", "eone-router.jdtest.net:80"),
    false,
  );
  assert.equal(
    shouldSkipPac("http://localhost:3001", "eone-router.jdtest.net:80"),
    false,
  );
});

test("pacDecision uses configured platformProxy", () => {
  const origin = "http://xxx.jd.com:8080";
  assert.equal(
    pacDecision("http://xxx.jd.com:8080/app.js", origin, "eone-router.jdtest.net:80"),
    "PROXY eone-router.jdtest.net:80",
  );
  assert.equal(
    pacDecision("http://xxx.jd.com:8080", origin, "127.0.0.1:3001"),
    "PROXY 127.0.0.1:3001",
  );
  assert.equal(pacDecision("http://other.example/", origin, "127.0.0.1:3001"), "DIRECT");
});

test("buildPacScript embeds remote platformProxy", () => {
  const script = buildPacScript("http://xxx.jd.com", "eone-router.jdtest.net:80");
  const fn = new Function(`${script}; return FindProxyForURL;`)();
  assert.equal(
    fn("http://xxx.jd.com/a", "xxx.jd.com"),
    "PROXY eone-router.jdtest.net:80",
  );
});

test("hijackCollidesWithPlatform detects same endpoint", () => {
  assert.equal(
    hijackCollidesWithPlatform(
      "http://eone-router.jdtest.net",
      "eone-router.jdtest.net:80",
    ),
    true,
  );
  assert.equal(
    hijackCollidesWithPlatform("http://xxx.jd.com", "eone-router.jdtest.net:80"),
    false,
  );
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test --experimental-strip-types extension/dnr.test.mjs`

Expected: FAIL on new arity / collision helper

- [ ] **Step 3: Implement**

```js
export function normalizePlatformProxy(/* from Task 1 */) { /* ... */ }

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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test --experimental-strip-types extension/dnr.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add extension/dnr.mjs extension/dnr.test.mjs
git commit -m "Drive PAC PROXY target from platformProxy."
```

---

### Task 3: Background reads `platformProxy`

**Files:**
- Modify: `extension/background.js`
- Modify: `extension/background.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_PLATFORM_PROXY`, `buildPacScript`, `shouldSkipPac`, `normalizePlatformProxy` (optional harden)
- Produces: rebuild uses stored `platformProxy` (default `DEFAULT_PLATFORM_PROXY`)

- [ ] **Step 1: Update failing/extended tests**

In `extension/background.test.mjs` state defaults add `platformProxy: "127.0.0.1:3001"`.

Add/adjust:

```js
test("rebuild PAC uses remote platformProxy from storage", async () => {
  granted = true;
  state.origin = "http://xxx.jd.com";
  state.id = "eone-1";
  state.platformProxy = "eone-router.jdtest.net:80";
  state.pacActive = false;
  proxySettingsValue = { mode: "system" };
  proxySets.length = 0;

  assert.deepEqual(await apply(), { ok: true });
  assert.match(
    proxySets[0].value.pacScript.data,
    /PROXY eone-router\.jdtest\.net:80/,
  );
});

test("empty id restores proxy but keeps platformProxy", async () => {
  granted = false;
  state.origin = "http://xxx.jd.com";
  state.id = "";
  state.platformProxy = "eone-router.jdtest.net:80";
  state.pacActive = true;
  state.previousProxy = { mode: "system" };

  assert.deepEqual(await apply(), { ok: true });
  assert.equal(state.platformProxy, "eone-router.jdtest.net:80");
  assert.equal(state.pacActive, false);
});
```

Update existing `"rebuild adds DNR and PAC..."` to still expect `PROXY 127.0.0.1:3001` when `platformProxy` is default.

Update `"skip PAC for local platform origin"` to set `state.platformProxy = "127.0.0.1:3001"`.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test --experimental-strip-types extension/background.test.mjs`

Expected: FAIL (background still hardcodes local PAC / ignores storage)

- [ ] **Step 3: Implement background wiring**

In `rebuildOnce` / `applyPac`:

```js
import {
  buildDnrRules,
  buildPacScript,
  DNR_RULE_ID,
  DNR_SWIMLANE_RULE_ID,
  DEFAULT_ORIGIN,
  DEFAULT_PLATFORM_PROXY,
  hostPermissionPattern,
  shouldSkipPac,
} from "./dnr.mjs";

async function applyPac(origin, platformProxy) {
  if (shouldSkipPac(origin, platformProxy)) {
    await restoreBrowserProxy();
    return;
  }
  // ... previousProxy capture unchanged ...
  await chrome.proxy.settings.set({
    value: {
      mode: "pac_script",
      pacScript: { data: buildPacScript(origin, platformProxy) },
    },
    scope: "regular",
  });
  await chrome.storage.local.set({ pacActive: true });
}

async function rebuildOnce() {
  const { origin, id, platformProxy } = await chrome.storage.local.get({
    origin: DEFAULT_ORIGIN,
    id: "",
    platformProxy: DEFAULT_PLATFORM_PROXY,
  });
  // ... permission + DNR unchanged ...
  console.info("[eone] rebuild", {
    origin,
    id: id || "(empty)",
    hasPermission: Boolean(hasPermission),
    skipPac: shouldSkipPac(origin, platformProxy),
    pacTarget: platformProxy,
  });
  if (hasPermission) {
    await applyPac(origin, platformProxy);
  } else {
    await restoreBrowserProxy();
  }
}
```

Remove unused `LOCAL_PROXY_HOST` / `LOCAL_PROXY_PORT` imports if no longer referenced.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test --experimental-strip-types extension/background.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add extension/background.js extension/background.test.mjs
git commit -m "Apply PAC using stored platformProxy."
```

---

### Task 4: Popup field 平台代理

**Files:**
- Modify: `extension/popup.html`
- Modify: `extension/popup.js`
- Modify: `extension/popup.test.mjs` (if present patterns allow; otherwise add coverage)

**Interfaces:**
- Consumes: `DEFAULT_PLATFORM_PROXY`, `normalizePlatformProxy`, `normalizeHijackOrigin`, `hijackCollidesWithPlatform`
- Produces: save persists `{ origin, id, platformProxy }`; clear sets `id: ""` only (keeps origin + platformProxy)

- [ ] **Step 1: Update HTML**

Add after 标识 field:

```html
<label>
  平台代理
  <input
    id="platformProxy"
    name="platformProxy"
    type="text"
    placeholder="127.0.0.1:3001"
  />
</label>
```

Replace hint with:

```html
<p id="hint">
  只支持 http 劫持 Origin。劫持流量发往「平台代理」的
  <code>host:port</code>。远程部署填
  <code>eone-router.jdtest.net:80</code>
  （不要填 3001，外网不通）。本地开发保持默认
  <code>127.0.0.1:3001</code>。保存后会暂时替换浏览器代理；清空标识后恢复代理，平台代理保留。
</p>
```

- [ ] **Step 2: Wire popup.js**

```js
import {
  DEFAULT_ORIGIN,
  DEFAULT_PLATFORM_PROXY,
  hijackCollidesWithPlatform,
  normalizeHijackOrigin,
  normalizePlatformProxy,
  requiredHostPermissions,
} from "./dnr.mjs";

const platformProxyInput = document.querySelector("#platformProxy");

async function restore() {
  const { origin, id, platformProxy } = await chrome.storage.local.get({
    origin: DEFAULT_ORIGIN,
    id: "",
    platformProxy: DEFAULT_PLATFORM_PROXY,
  });
  originInput.value = origin;
  idInput.value = id;
  platformProxyInput.value = platformProxy;
}

// on save:
let platformProxy;
try {
  origin = normalizeHijackOrigin(originValue);
  platformProxy = normalizePlatformProxy(platformProxyInput.value);
} catch (error) {
  setStatus(error instanceof Error ? error.message : String(error));
  return;
}
if (hijackCollidesWithPlatform(origin, platformProxy)) {
  setStatus("劫持 Origin 不能与平台代理相同");
  return;
}
await chrome.storage.local.set({ origin, id, platformProxy });
// applyRule unchanged
platformProxyInput.value = platformProxy;

// on clear:
await chrome.storage.local.set({ origin, id: "" }); // do not clear platformProxy
```

- [ ] **Step 3: Extend popup tests**

Cover: normalize error surfaces; collision rejected without storage write; successful save writes `platformProxy`; clear keeps `platformProxy`.

- [ ] **Step 4: Run**

Run: `node --test --experimental-strip-types extension/popup.test.mjs extension/dnr.test.mjs extension/background.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/popup.html extension/popup.js extension/popup.test.mjs
git commit -m "Add platform proxy field to the extension popup."
```

---

### Task 5: Nginx comments + safe Host for fixed upstream

**Files:**
- Modify: `docker/nginx.conf`
- Modify: `README.md`

**Interfaces:**
- Consumes: existing outer on `127.0.0.1:3001`
- Produces: documented PAC-on-:80 behavior; `Host` set to upstream, not hijack `$host`

- [ ] **Step 1: Update nginx location**

Inside `location /`, keep `proxy_pass http://127.0.0.1:3001;` and set:

```nginx
# PAC clients may send absolute-form URIs (GET http://hijack-host/path).
# Always forward to the local outer server — never proxy_pass to $host.
# Origin-form path + X-Eone-Id is enough for Next package serving.
proxy_set_header Host 127.0.0.1:3001;
```

Remove or stop using `proxy_set_header Host $host;` in this location (that would pass the hijack Host through; outer overwrites anyway, but fixed Host documents intent).

Keep `client_max_body_size 100m;`.

- [ ] **Step 2: Update README**

Add a **Hijack / platform proxy** section:

- Extension field 平台代理 defaults to `127.0.0.1:3001`
- On jdtest set `eone-router.jdtest.net:80` (not `:3001` — connection refused externally)
- nginx `:80` → container `3001`; reload nginx after conf changes
- Fix the outdated sentence claiming sample nginx lacks `client_max_body_size` if the file already has it

- [ ] **Step 3: Commit**

```bash
git add docker/nginx.conf README.md
git commit -m "Document PAC via nginx :80 and pin upstream Host."
```

---

### Task 6: Full verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

Expected: all pass

- [ ] **Step 2: Manual checklist (operator)**

1. Reload unpacked extension after rebuild.
2. Set 平台代理 `eone-router.jdtest.net:80`, hijack HTTP origin, existing remote id → open hijack URL → package HTML.
3. `curl -v --proxy http://eone-router.jdtest.net:80 http://<hijack-host>/ -H 'X-Eone-Id: <id>'` → not connection refused.
4. Local: 平台代理 default + `pnpm start` → previous local hijack still works.

- [ ] **Step 3: Commit any doc fixups only if needed**

---

## Spec coverage self-check

| Spec item | Task |
|-----------|------|
| `platformProxy` storage + default | 1, 3, 4 |
| normalize / reject bad proxy | 1, 4 |
| PAC uses configured proxy | 2, 3 |
| skip-PAC loopback-only with matching proxy | 2 |
| reject hijack == platform | 2, 4 |
| clear keeps platformProxy | 3, 4 |
| nginx no follow hijack host; `:80` path | 5 |
| README `:80` not `:3001` | 5 |
| Automated + manual tests | 2–6 |
| No admin/classify/3001 VIP expose | Global constraints |

## Placeholder scan

No TBD / “implement later” steps. Signatures named consistently: `platformProxy`, `normalizePlatformProxy`, `hijackCollidesWithPlatform`, `DEFAULT_PLATFORM_PROXY`.
