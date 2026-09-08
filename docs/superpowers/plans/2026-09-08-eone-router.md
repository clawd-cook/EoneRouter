# EoneRouter v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve local static trees from `storage/<eone-id>/` on one shared origin, selected by Chrome extension header `X-Eone-Id`.

**Architecture:** Next.js 16 `proxy.ts` (Edge) classifies the request from `X-Eone-Id` and rewrites; a Node route handler reads files. The MV3 extension only attaches that header via one dynamic DNR rule. Pure helpers live in `lib/eone/` so tests do not need Chrome or a running server.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Node 24.20.0 `node:test`, Chrome MV3 (no bundler).

**Spec:** `docs/superpowers/specs/2026-09-08-eone-router-design.md`

## Global Constraints

- Runtime: nvm Node **v24.20.0** only; `which node` must be `$HOME/.nvm/versions/node/v24.20.0/bin/node`. Activate with `nvm use 24.20.0` in the current shell before every command.
- Package manager: **pnpm** only.
- Do not add Jest, Vitest, Playwright, or tsx. Tests use `node --test --experimental-strip-types`.
- Next 16 file convention: Edge interceptor is `proxy.ts` exporting `proxy()` (spec’s “middleware”). Do **not** create `middleware.ts`. Matcher export is `config`, not `proxyConfig`.
- `proxy.ts` and `lib/eone/classify.ts` / `lib/eone/id.ts` must not import `node:fs` or `lib/eone/path.ts`.
- Header name: `X-Eone-Id` (read via `headers.get('x-eone-id')`).
- Id pattern (entire string): `^eone-[A-Za-z0-9_-]+$`
- Storage directory: `storage/` (rename from `strorage/`). Update `AGENTS.md` in the same task; the spec overrides the old “keep the typo” note.
- Error “pages” are **route handlers** that return HTML with status 400/404 (App Router `page.tsx` cannot set those statuses).
- Chrome: Manifest V3, `declarativeNetRequestWithHostAccess`, no content scripts, no URL rewrite, no invented PNG icons.
- Follow `.agents/skills/next-best-practices`, `.agents/skills/vercel-react-best-practices`, and `.agents/skills/chrome-extensions` before writing those files.
- Every `Run:` below assumes nvm 24.20.0 is already active in that shell.

---

## File structure

| File | Responsibility |
|------|----------------|
| `lib/eone/id.ts` | `isValidEoneId` |
| `lib/eone/classify.ts` | Edge-safe rewrite decision |
| `lib/eone/content-type.ts` | Extension → Content-Type |
| `lib/eone/path.ts` | Resolve pathname to a file under `storage/<id>/` |
| `lib/eone/html.ts` | Invalid / missing-package / file-not-found bodies |
| `lib/eone/serve.ts` | `servePackage` → status + body + headers |
| `lib/eone/storage-root.ts` | `getStorageRoot()` (`EONE_STORAGE_ROOT` or `<cwd>/storage`) |
| `proxy.ts` | Call `classifyRequest`, `next()` or `rewrite()` |
| `app/page.tsx` | Chinese guide (no header) |
| `app/layout.tsx` | Title / `lang` |
| `app/__eone/invalid/route.ts` | GET 400 + invalid HTML |
| `app/__eone/missing/route.ts` | GET 404 + missing-package HTML |
| `app/__eone/files/[[...path]]/route.ts` | Node static reader |
| `storage/eone-1`, `storage/eone-2` | Sample packages (moved from `strorage/`) |
| `extension/dnr.mjs` | Pure `buildDnrRule` |
| `extension/manifest.json` | MV3 manifest |
| `extension/background.js` | Rebuild DNR from `chrome.storage` |
| `extension/popup.html`, `extension/popup.js` | Origin + id UI |
| `package.json` | `"test"` script |

Colocate tests as `*.test.ts` / `extension/dnr.test.mjs`. Exclude `**/*.test.ts` from `tsconfig.json` `include` so `tsc` does not require `.ts` import suffixes.

---

### Task 1: Identifier validation + test script

**Files:**
- Create: `lib/eone/id.ts`
- Create: `lib/eone/id.test.ts`
- Modify: `package.json` (add `test` script)
- Modify: `tsconfig.json` (stop including test files)

**Interfaces:**
- Consumes: nothing
- Produces: `export function isValidEoneId(id: string): boolean`

- [ ] **Step 1: Add the test script and exclude tests from tsc**

In `package.json` `scripts`:

```json
"test": "node --test --experimental-strip-types --experimental-default-type=module lib/eone/*.test.ts extension/dnr.test.mjs"
```

In `tsconfig.json` `exclude`, add `"**/*.test.ts"`.

- [ ] **Step 2: Write the failing test**

Create `lib/eone/id.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidEoneId } from "./id.ts";

test("accepts eone-1", () => {
  assert.equal(isValidEoneId("eone-1"), true);
});

test("accepts letters, digits, hyphen, underscore after prefix", () => {
  assert.equal(isValidEoneId("eone-AbC_09-x"), true);
});

test("rejects empty string", () => {
  assert.equal(isValidEoneId(""), false);
});

test("rejects eone- with nothing after the hyphen", () => {
  assert.equal(isValidEoneId("eone-"), false);
});

test("rejects path-escape ids", () => {
  assert.equal(isValidEoneId("eone-../etc"), false);
});

test("rejects ids without eone- prefix", () => {
  assert.equal(isValidEoneId("prod-1"), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/eone/id.test.ts`

Expected: FAIL with ERR_MODULE_NOT_FOUND for `./id.ts`

- [ ] **Step 4: Write minimal implementation**

Create `lib/eone/id.ts`:

```ts
const EONE_ID_PATTERN = /^eone-[A-Za-z0-9_-]+$/;

export function isValidEoneId(id: string): boolean {
  return EONE_ID_PATTERN.test(id);
}
```

- [ ] **Step 5: Run tests and make sure they pass**

Run: `pnpm test`

Expected: id tests PASS. `extension/dnr.test.mjs` may print “could not load” until Task 6 — if `node --test` treats missing glob as failure, temporarily use:

```json
"test": "node --test --experimental-strip-types --experimental-default-type=module lib/eone/*.test.ts"
```

and restore the `extension/dnr.test.mjs` glob in Task 6. Do not leave the glob pointing at a missing file.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json lib/eone/id.ts lib/eone/id.test.ts
git commit -m "Add eone id validation and node:test runner."
```

---

### Task 2: Request classification

**Files:**
- Create: `lib/eone/classify.ts`
- Create: `lib/eone/classify.test.ts`

**Interfaces:**
- Consumes: `isValidEoneId(id: string): boolean`
- Produces:

```ts
export type ClassifyResult =
  | { action: "skip" }
  | { action: "pass" }
  | { action: "rewrite"; target: string };

export function classifyRequest(
  pathname: string,
  header: string | null,
): ClassifyResult;
```

`target` values: `/__eone/invalid`, or `/__eone/files` + original pathname (`/` → `/__eone/files/`).

- [ ] **Step 1: Write the failing test**

Create `lib/eone/classify.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRequest } from "./classify.ts";

test("skips _next and __eone prefixes", () => {
  assert.deepEqual(classifyRequest("/_next/static/x.js", "eone-1"), {
    action: "skip",
  });
  assert.deepEqual(classifyRequest("/__eone/files/", "eone-1"), {
    action: "skip",
  });
  assert.deepEqual(classifyRequest("/__eone/invalid", null), {
    action: "skip",
  });
});

test("passes through when header is missing or empty", () => {
  assert.deepEqual(classifyRequest("/", null), { action: "pass" });
  assert.deepEqual(classifyRequest("/", ""), { action: "pass" });
  assert.deepEqual(classifyRequest("/index.js", "   "), { action: "pass" });
});

test("rewrites illegal id to invalid page", () => {
  assert.deepEqual(classifyRequest("/", "eone-../x"), {
    action: "rewrite",
    target: "/__eone/invalid",
  });
  assert.deepEqual(classifyRequest("/", "prod-1"), {
    action: "rewrite",
    target: "/__eone/invalid",
  });
});

test("rewrites valid id to files handler preserving path", () => {
  assert.deepEqual(classifyRequest("/", "eone-1"), {
    action: "rewrite",
    target: "/__eone/files/",
  });
  assert.deepEqual(classifyRequest("/index.js", "eone-1"), {
    action: "rewrite",
    target: "/__eone/files/index.js",
  });
  assert.deepEqual(classifyRequest("/assets/a.css", "eone-2"), {
    action: "rewrite",
    target: "/__eone/files/assets/a.css",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/eone/classify.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Write minimal implementation**

Create `lib/eone/classify.ts`:

```ts
import { isValidEoneId } from "./id.ts";

export type ClassifyResult =
  | { action: "skip" }
  | { action: "pass" }
  | { action: "rewrite"; target: string };

function isSkippedPath(pathname: string): boolean {
  return (
    pathname === "/_next" ||
    pathname.startsWith("/_next/") ||
    pathname === "/__eone" ||
    pathname.startsWith("/__eone/")
  );
}

export function classifyRequest(
  pathname: string,
  header: string | null,
): ClassifyResult {
  if (isSkippedPath(pathname)) {
    return { action: "skip" };
  }

  const id = header?.trim() ?? "";
  if (!id) {
    return { action: "pass" };
  }

  if (!isValidEoneId(id)) {
    return { action: "rewrite", target: "/__eone/invalid" };
  }

  const suffix = pathname === "/" ? "/" : pathname;
  return { action: "rewrite", target: `/__eone/files${suffix}` };
}
```

If `tsc` or Next bundler rejects `from "./id.ts"`, switch **all** `lib/eone` implementation imports to extensionless `from "./id"` and keep **only test files** using `from "./id.ts"` (Node strip-types needs the suffix). Do not mix both styles inside one file.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `pnpm test`

Expected: PASS (id + classify)

- [ ] **Step 5: Commit**

```bash
git add lib/eone/classify.ts lib/eone/classify.test.ts
git commit -m "Add request classification for X-Eone-Id rewrites."
```

---

### Task 3: Path resolve and Content-Type

**Files:**
- Create: `lib/eone/content-type.ts`
- Create: `lib/eone/content-type.test.ts`
- Create: `lib/eone/path.ts`
- Create: `lib/eone/path.test.ts`

**Interfaces:**
- Consumes: `isValidEoneId`
- Produces:

```ts
export function contentTypeFor(filename: string): string;

export type ResolveResult =
  | { ok: true; absolutePath: string }
  | {
      ok: false;
      reason: "invalid-id" | "escape" | "missing-package" | "not-a-file";
    };

export function resolvePackageFile(input: {
  storageRoot: string;
  id: string;
  pathname: string;
}): ResolveResult;
```

Textual types include `charset=utf-8`. Unknown extension → `application/octet-stream`. `/` or empty pathname → `index.html`. Query string is ignored. `..` segments and symlink escape → `escape` (do not read). Missing dir → `missing-package`. Missing/non-file → `not-a-file`.

- [ ] **Step 1: Write the failing Content-Type test**

Create `lib/eone/content-type.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { contentTypeFor } from "./content-type.ts";

test("maps known extensions", () => {
  assert.equal(contentTypeFor("index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("app.js"), "text/javascript; charset=utf-8");
  assert.equal(contentTypeFor("a.css"), "text/css; charset=utf-8");
  assert.equal(contentTypeFor("x.png"), "image/png");
});

test("unknown extension is octet-stream", () => {
  assert.equal(contentTypeFor("file.bin"), "application/octet-stream");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/eone/content-type.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement contentTypeFor**

Create `lib/eone/content-type.ts`:

```ts
const TEXTUAL = new Set([
  "html",
  "js",
  "mjs",
  "css",
  "json",
  "svg",
  "txt",
  "map",
]);

const TYPES: Record<string, string> = {
  html: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  txt: "text/plain",
  map: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  wasm: "application/wasm",
};

export function contentTypeFor(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const ext = (dot >= 0 ? base.slice(dot + 1) : "").toLowerCase();
  const type = TYPES[ext] ?? "application/octet-stream";
  if (type !== "application/octet-stream" && TEXTUAL.has(ext)) {
    return `${type}; charset=utf-8`;
  }
  return type;
}
```

- [ ] **Step 4: Run Content-Type tests — expect PASS**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/eone/content-type.test.ts`

- [ ] **Step 5: Write the failing path tests**

Create `lib/eone/path.test.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolvePackageFile } from "./path.ts";

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eone-"));
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "one");
  fs.writeFileSync(path.join(root, "eone-1", "index.js"), "js");
  fs.mkdirSync(path.join(root, "eone-1", "assets"));
  fs.writeFileSync(path.join(root, "eone-1", "assets", "a.css"), "css");
  return root;
}

test("maps / to index.html", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.absolutePath, path.join(storageRoot, "eone-1", "index.html"));
  }
});

test("maps /index.js to that file", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/index.js",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.absolutePath, path.join(storageRoot, "eone-1", "index.js"));
  }
});

test("strips query string", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/index.js?cache=1",
  });
  assert.equal(result.ok, true);
});

test("rejects .. escape", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/../eone-1/index.html",
  });
  assert.deepEqual(result, { ok: false, reason: "escape" });
});

test("rejects invalid id before joining", () => {
  const result = resolvePackageFile({
    storageRoot: "/tmp",
    id: "eone-../etc",
    pathname: "/",
  });
  assert.deepEqual(result, { ok: false, reason: "invalid-id" });
});

test("missing package directory", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-missing",
    pathname: "/",
  });
  assert.deepEqual(result, { ok: false, reason: "missing-package" });
});

test("missing file is not-a-file", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/nope.js",
  });
  assert.deepEqual(result, { ok: false, reason: "not-a-file" });
});

test("directory is not-a-file", () => {
  const storageRoot = makeRoot();
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/assets",
  });
  assert.deepEqual(result, { ok: false, reason: "not-a-file" });
});

test("symlink escape is rejected", () => {
  const storageRoot = makeRoot();
  const outside = path.join(storageRoot, "secret.txt");
  fs.writeFileSync(outside, "nope");
  fs.symlinkSync(outside, path.join(storageRoot, "eone-1", "link.txt"));
  const result = resolvePackageFile({
    storageRoot,
    id: "eone-1",
    pathname: "/link.txt",
  });
  assert.deepEqual(result, { ok: false, reason: "escape" });
});
```

- [ ] **Step 6: Run path tests to verify they fail**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/eone/path.test.ts`

Expected: FAIL module not found

- [ ] **Step 7: Implement resolvePackageFile**

Create `lib/eone/path.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { isValidEoneId } from "./id.ts";

export type ResolveResult =
  | { ok: true; absolutePath: string }
  | {
      ok: false;
      reason: "invalid-id" | "escape" | "missing-package" | "not-a-file";
    };

function relativeFromPathname(pathname: string): string | null {
  const raw = pathname.split("?")[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded === "/" || decoded === "") {
    return "index.html";
  }
  const trimmed = decoded.replace(/^\/+/, "");
  const segments = trimmed.split(/[/\\]/);
  if (
    trimmed === "" ||
    path.isAbsolute(trimmed) ||
    segments.some((s) => s === "" || s === "." || s === "..")
  ) {
    return null;
  }
  return trimmed;
}

function isInside(parent: string, child: string): boolean {
  const prefix = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child === parent || child.startsWith(prefix);
}

export function resolvePackageFile(input: {
  storageRoot: string;
  id: string;
  pathname: string;
}): ResolveResult {
  if (!isValidEoneId(input.id)) {
    return { ok: false, reason: "invalid-id" };
  }

  const relative = relativeFromPathname(input.pathname);
  if (relative === null) {
    return { ok: false, reason: "escape" };
  }

  const packageDir = path.join(input.storageRoot, input.id);
  let realPackage: string;
  try {
    const st = fs.lstatSync(packageDir);
    if (!st.isDirectory()) {
      return { ok: false, reason: "missing-package" };
    }
    realPackage = fs.realpathSync(packageDir);
  } catch {
    return { ok: false, reason: "missing-package" };
  }

  const candidate = path.join(packageDir, relative);
  let realFile: string;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    return { ok: false, reason: "not-a-file" };
  }

  if (!isInside(realPackage, realFile)) {
    return { ok: false, reason: "escape" };
  }

  try {
    const st = fs.statSync(realFile);
    if (!st.isFile()) {
      return { ok: false, reason: "not-a-file" };
    }
  } catch {
    return { ok: false, reason: "not-a-file" };
  }

  return { ok: true, absolutePath: realFile };
}
```

- [ ] **Step 8: Run tests and make sure they pass**

Run: `pnpm test`

Expected: PASS including symlink case. If a platform cannot create the symlink, fail the test (do not skip) and fix permissions in the test tmpdir — do not weaken the check.

- [ ] **Step 9: Commit**

```bash
git add lib/eone/content-type.ts lib/eone/content-type.test.ts lib/eone/path.ts lib/eone/path.test.ts
git commit -m "Add package path resolution and content types."
```

---

### Task 4: HTML helpers and servePackage

**Files:**
- Create: `lib/eone/html.ts`
- Create: `lib/eone/html.test.ts`
- Create: `lib/eone/serve.ts`
- Create: `lib/eone/serve.test.ts`

**Interfaces:**
- Consumes: `resolvePackageFile`, `contentTypeFor`, `isValidEoneId`
- Produces:

```ts
export function invalidIdHtml(): string;
export function missingPackageHtml(): string;
export function fileNotFoundBody(): string;

export type ServeResult = {
  status: number;
  body: Buffer | string;
  contentType: string;
  cacheControl: "no-store";
};

export function servePackage(input: {
  storageRoot: string;
  id: string | null;
  pathname: string;
}): ServeResult;
```

Mapping: missing/empty/invalid id → 400 + `invalidIdHtml()` (`text/html; charset=utf-8`). `missing-package` → 404 + `missingPackageHtml()`. `escape` / `invalid-id` from resolve → 400 + `invalidIdHtml()`. `not-a-file` → 404 + `fileNotFoundBody()` with `text/plain; charset=utf-8`. Success → 200, file bytes, `contentTypeFor`, `Cache-Control: no-store`.

- [ ] **Step 1: Write failing html + serve tests**

`lib/eone/html.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileNotFoundBody,
  invalidIdHtml,
  missingPackageHtml,
} from "./html.ts";

test("invalid html mentions illegal identifier", () => {
  assert.match(invalidIdHtml(), /不合法/);
});

test("missing html mentions 找不到", () => {
  assert.match(missingPackageHtml(), /找不到/);
});

test("file not found is plain language", () => {
  assert.match(fileNotFoundBody(), /文件不存在/);
});
```

`lib/eone/serve.test.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { invalidIdHtml, missingPackageHtml, fileNotFoundBody } from "./html.ts";
import { servePackage } from "./serve.ts";

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eone-serve-"));
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "<p>one</p>");
  return root;
}

test("null id is 400 invalid html", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: null,
    pathname: "/",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body, invalidIdHtml());
  assert.equal(result.cacheControl, "no-store");
});

test("unknown package is 404 missing html", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: "eone-nope",
    pathname: "/",
  });
  assert.equal(result.status, 404);
  assert.equal(result.body, missingPackageHtml());
});

test("valid file returns bytes and html content type", () => {
  const storageRoot = makeRoot();
  const result = servePackage({
    storageRoot,
    id: "eone-1",
    pathname: "/",
  });
  assert.equal(result.status, 200);
  assert.equal(result.contentType, "text/html; charset=utf-8");
  assert.equal(result.body.toString(), "<p>one</p>");
});

test("missing file is 404 plain body", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: "eone-1",
    pathname: "/missing.js",
  });
  assert.equal(result.status, 404);
  assert.equal(result.body, fileNotFoundBody());
  assert.equal(result.contentType, "text/plain; charset=utf-8");
});

test("illegal id is 400", () => {
  const result = servePackage({
    storageRoot: makeRoot(),
    id: "eone-../x",
    pathname: "/",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body, invalidIdHtml());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --experimental-strip-types --experimental-default-type=module lib/eone/html.test.ts lib/eone/serve.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement html.ts and serve.ts**

`lib/eone/html.ts`:

```ts
export function invalidIdHtml(): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>标识不合法</title></head><body><h1>标识不合法</h1><p>请使用 eone- 开头，且只包含字母、数字、连字符和下划线。</p></body></html>`;
}

export function missingPackageHtml(): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>找不到资源</title></head><body><h1>找不到该标识对应的静态资源</h1><p>请确认 storage/eone-xxxx/ 目录存在。</p></body></html>`;
}

export function fileNotFoundBody(): string {
  return "文件不存在";
}
```

`lib/eone/serve.ts`:

```ts
import fs from "node:fs";
import { contentTypeFor } from "./content-type.ts";
import { fileNotFoundBody, invalidIdHtml, missingPackageHtml } from "./html.ts";
import { isValidEoneId } from "./id.ts";
import { resolvePackageFile } from "./path.ts";

export type ServeResult = {
  status: number;
  body: Buffer | string;
  contentType: string;
  cacheControl: "no-store";
};

const HTML = "text/html; charset=utf-8";
const TEXT = "text/plain; charset=utf-8";
const NO_STORE = "no-store" as const;

function html400(): ServeResult {
  return {
    status: 400,
    body: invalidIdHtml(),
    contentType: HTML,
    cacheControl: NO_STORE,
  };
}

export function servePackage(input: {
  storageRoot: string;
  id: string | null;
  pathname: string;
}): ServeResult {
  const id = input.id?.trim() ?? "";
  if (!id || !isValidEoneId(id)) {
    return html400();
  }

  const resolved = resolvePackageFile({
    storageRoot: input.storageRoot,
    id,
    pathname: input.pathname,
  });

  if (!resolved.ok) {
    if (resolved.reason === "missing-package") {
      return {
        status: 404,
        body: missingPackageHtml(),
        contentType: HTML,
        cacheControl: NO_STORE,
      };
    }
    if (resolved.reason === "not-a-file") {
      return {
        status: 404,
        body: fileNotFoundBody(),
        contentType: TEXT,
        cacheControl: NO_STORE,
      };
    }
    return html400();
  }

  const body = fs.readFileSync(resolved.absolutePath);
  return {
    status: 200,
    body,
    contentType: contentTypeFor(resolved.absolutePath),
    cacheControl: NO_STORE,
  };
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `pnpm test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/eone/html.ts lib/eone/html.test.ts lib/eone/serve.ts lib/eone/serve.test.ts
git commit -m "Add static package serve results and error HTML."
```

---

### Task 5: Next.js proxy, routes, guide, rename storage

**Files:**
- Create: `lib/eone/storage-root.ts`
- Create: `proxy.ts`
- Create: `app/__eone/invalid/route.ts`
- Create: `app/__eone/missing/route.ts`
- Create: `app/__eone/files/[[...path]]/route.ts`
- Modify: `app/page.tsx` (replace starter)
- Modify: `app/layout.tsx` (title `EoneRouter`, `lang="zh-CN"`)
- Modify: `AGENTS.md` (`strorage` → `storage`, mention `pnpm test` and `extension/`)
- Rename: `strorage/` → `storage/` via `git mv`

**Interfaces:**
- Consumes: `classifyRequest`, `servePackage`, `invalidIdHtml`, `missingPackageHtml`
- Produces: HTTP behavior on `http://localhost:3000`

`getStorageRoot()`:

```ts
export function getStorageRoot(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.EONE_STORAGE_ROOT ?? path.join(cwd, "storage");
}
```

Read `.agents/skills/next-best-practices/file-conventions.md` (Proxy) before writing `proxy.ts`. Await Next 16 `params` as `Promise`. File route: `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.

- [ ] **Step 1: Rename the fixture directory and point AGENTS.md at it**

```bash
git mv strorage storage
```

In `AGENTS.md`:

- Layout bullet: `storage/` (not `strorage/`); drop “keep the folder name as-is”.
- Additional notes: storage spelling is `storage/`.
- Testing: `pnpm test` runs `node:test` for `lib/eone` and `extension/dnr.test.mjs`.
- Layout: add `extension/` Chrome MV3 unpacked extension; add `lib/eone/` helpers; add `proxy.ts`.

- [ ] **Step 2: Implement storage-root, proxy, and routes**

`lib/eone/storage-root.ts` as specified (import `path` from `node:path`).

`proxy.ts` (project root):

```ts
import { classifyRequest } from "@/lib/eone/classify";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const header = request.headers.get("x-eone-id");
  const result = classifyRequest(request.nextUrl.pathname, header);

  if (result.action === "skip" || result.action === "pass") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = result.target;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

If `@/lib/eone/classify` fails in Edge because of `.ts` imports inside that module, change `lib/eone` **implementation** imports to extensionless relative paths (`./id`) so both Next and Node tests work (tests keep `.ts` suffixes).

`app/__eone/invalid/route.ts`:

```ts
import { invalidIdHtml } from "@/lib/eone/html";
import { NextResponse } from "next/server";

export function GET() {
  return new NextResponse(invalidIdHtml(), {
    status: 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
```

`app/__eone/missing/route.ts`: same with `missingPackageHtml()` and status `404`.

`app/__eone/files/[[...path]]/route.ts`:

```ts
import { servePackage } from "@/lib/eone/serve";
import { getStorageRoot } from "@/lib/eone/storage-root";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const pathname =
    !path || path.length === 0 ? "/" : `/${path.join("/")}`;
  const result = servePackage({
    storageRoot: getStorageRoot(),
    id: request.headers.get("x-eone-id"),
    pathname,
  });
  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": result.cacheControl,
    },
  });
}
```

Replace `app/page.tsx` with a Server Component (no `'use client'`) Chinese guide listing:

1. 从 `extension/` 加载未打包的 Chrome 插件
2. 填写 `eone-xxxx` 和平台 Origin（默认 `http://localhost:3000`）
3. 把静态文件放到 `storage/eone-xxxx/`
4. 打开当前这个地址

Update `app/layout.tsx` metadata title to `EoneRouter`, description to `按 X-Eone-Id 分发本地静态资源`, `html lang="zh-CN"`.

- [ ] **Step 3: Typecheck and lint app files**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint app proxy.ts lib next.config.ts
```

Expected: PASS (no unused imports). Do not “fix” `.agents/skills`.

- [ ] **Step 4: Verify HTTP behavior against a running app**

Start `pnpm dev` if it is not already running. Then:

```bash
curl -s -o /tmp/eone-guide.html -w "%{http_code}" http://localhost:3000/
# expect 200 and 引导 or 插件 in the body

curl -s -o /tmp/eone-1.html -w "%{http_code}" -H "X-Eone-Id: eone-1" http://localhost:3000/
# expect 200 and body containing eone-1

curl -s -D- -H "X-Eone-Id: eone-1" http://localhost:3000/ | head
# expect Cache-Control: no-store

curl -s -o /tmp/eone-2.js -w "%{http_code}" -H "X-Eone-Id: eone-2" http://localhost:3000/index.js
# expect 200 (eone-2 has index.js)

curl -s -o /tmp/eone-missing.html -w "%{http_code}" -H "X-Eone-Id: eone-nope" http://localhost:3000/
# expect 404 and 找不到

curl -s -o /tmp/eone-bad.html -w "%{http_code}" -H "X-Eone-Id: prod-1" http://localhost:3000/
# expect 400 and 不合法

curl -s -o /tmp/eone-nofile.txt -w "%{http_code}" -H "X-Eone-Id: eone-1" http://localhost:3000/nope.js
# expect 404 and 文件不存在
```

If `pnpm dev` is on another port, use that origin. Next 16.2.9 is below next-dev-loop’s 16.3 MCP floor: do **not** upgrade Next. Treat curl as the runtime proof. Also run `pnpm test` and `pnpm build`.

- [ ] **Step 5: Commit**

```bash
git add lib/eone/storage-root.ts proxy.ts app AGENTS.md storage
git add -u strorage
git commit -m "Serve storage packages through proxy rewrites and Node route."
```

If `git add -u strorage` errors because the folder is already gone, `git status` and add the rename together with the new files.

---

### Task 6: Extension DNR rule builder

**Files:**
- Create: `extension/dnr.mjs`
- Create: `extension/dnr.test.mjs`
- Modify: `package.json` `test` script to include `extension/dnr.test.mjs` if it was omitted in Task 1

**Interfaces:**
- Consumes: nothing (pure JS)
- Produces:

```js
export const DNR_RULE_ID = 1;
export const EONE_HEADER_NAME = "X-Eone-Id";
export const DEFAULT_ORIGIN = "http://localhost:3000";
export const RESOURCE_TYPES = [ /* spec list */ ];

export function normalizeOrigin(origin: string): string; // throws if not http(s) URL
export function hostPermissionPattern(origin: string): string; // `${origin}/*`
export function originToRegexFilter(origin: string): string; // ^escaped(/|$)
export function buildDnrRule({ origin, id }): object | null; // null if !id
```

Read `.agents/skills/chrome-extensions/references/extensions/declarative-net-request.md` and `permissions.md` before Task 7. This task is the pure function only.

One dynamic rule. `regexFilter` so both `http://localhost:3000` and `http://localhost:3000/index.js` match, without matching `http://localhost:30000`. Empty `id` → `null`. Do not validate id pattern here (server returns 400).

- [ ] **Step 1: Write the failing test**

Create `extension/dnr.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DNR_RULE_ID,
  EONE_HEADER_NAME,
  RESOURCE_TYPES,
  buildDnrRule,
  hostPermissionPattern,
  normalizeOrigin,
  originToRegexFilter,
} from "./dnr.mjs";

test("normalizeOrigin strips path and trailing slash", () => {
  assert.equal(normalizeOrigin("http://localhost:3000/foo"), "http://localhost:3000");
});

test("normalizeOrigin rejects non-http", () => {
  assert.throws(() => normalizeOrigin("ftp://localhost"));
});

test("empty id yields null rule", () => {
  assert.equal(buildDnrRule({ origin: "http://localhost:3000", id: "" }), null);
});

test("builds a single modifyHeaders rule", () => {
  const rule = buildDnrRule({ origin: "http://localhost:3000", id: "eone-1" });
  assert.equal(rule.id, DNR_RULE_ID);
  assert.equal(rule.action.type, "modifyHeaders");
  assert.deepEqual(rule.action.requestHeaders, [
    { header: EONE_HEADER_NAME, operation: "set", value: "eone-1" },
  ]);
  assert.equal(rule.condition.regexFilter, originToRegexFilter("http://localhost:3000"));
  assert.deepEqual(rule.condition.resourceTypes, RESOURCE_TYPES);
});

test("regex does not match a longer port", () => {
  const filter = originToRegexFilter("http://localhost:3000");
  const re = new RegExp(filter);
  assert.equal(re.test("http://localhost:3000"), true);
  assert.equal(re.test("http://localhost:3000/"), true);
  assert.equal(re.test("http://localhost:3000/index.js"), true);
  assert.equal(re.test("http://localhost:30000/"), false);
});

test("host permission pattern", () => {
  assert.equal(
    hostPermissionPattern("http://localhost:3000"),
    "http://localhost:3000/*",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extension/dnr.test.mjs`

Expected: FAIL cannot find `./dnr.mjs`

- [ ] **Step 3: Implement dnr.mjs**

```js
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
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `pnpm test`

Expected: PASS including dnr tests

- [ ] **Step 5: Commit**

```bash
git add extension/dnr.mjs extension/dnr.test.mjs package.json
git commit -m "Add Chrome DNR rule builder for X-Eone-Id."
```

---

### Task 7: Extension popup, service worker, manifest

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/popup.html`
- Create: `extension/popup.js`

**Interfaces:**
- Consumes: `buildDnrRule`, `DNR_RULE_ID`, `DEFAULT_ORIGIN`, `hostPermissionPattern`, `normalizeOrigin` from `./dnr.mjs`
- Produces: unpacked extension the operator loads from `extension/`

Read before coding: `.agents/skills/chrome-extensions/SKILL.md`, `references/extensions/declarative-net-request.md`, `references/extensions/permissions.md`, `references/extensions/popup-ui.md`, `references/extensions/storage.md`, `references/extensions/service-worker.md`.

`chrome.permissions.request` must run in the popup click handler **before** any `await` that is not the request itself (gesture). After grant (or when clearing), `chrome.storage.local.set({ origin, id })` then `chrome.runtime.sendMessage({ type: "eone-apply" })`. On deny, show error and **do not** `set` a new id / **do not** leave a DNR rule for that origin.

Service worker: `onInstalled`, `onStartup`, `onMessage` `eone-apply` → `updateDynamicRules({ removeRuleIds: [DNR_RULE_ID], addRules: rule ? [rule] : [] })`. Always remove id `1` first so origin changes cannot stack rules.

No content_scripts. No icons key (do not invent PNGs).

- [ ] **Step 1: Write manifest.json**

```json
{
  "manifest_version": 3,
  "name": "EoneRouter",
  "version": "0.1.0",
  "description": "Attach X-Eone-Id so the preview origin can serve a local static package.",
  "action": {
    "default_title": "EoneRouter",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "permissions": ["storage", "declarativeNetRequestWithHostAccess"],
  "optional_host_permissions": ["http://*/*", "https://*/*"]
}
```

- [ ] **Step 2: Write background.js**

```js
import { buildDnrRule, DNR_RULE_ID, DEFAULT_ORIGIN } from "./dnr.mjs";

async function rebuild() {
  const { origin, id } = await chrome.storage.local.get({
    origin: DEFAULT_ORIGIN,
    id: "",
  });
  const rule = id ? buildDnrRule({ origin, id }) : null;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [DNR_RULE_ID],
    addRules: rule ? [rule] : [],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  rebuild();
});

chrome.runtime.onStartup.addListener(() => {
  rebuild();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "eone-apply") {
    return;
  }
  rebuild()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
```

- [ ] **Step 3: Write popup.html and popup.js**

`popup.html`: width ~320px. Fields: Origin, 标识 (`eone-xxxx`), buttons 保存 / 清空, a `#status` node for errors. Script: `<script type="module" src="popup.js"></script>`.

`popup.js` behavior:

- On load: `chrome.storage.local.get({ origin: DEFAULT_ORIGIN, id: "" })` into inputs.
- 保存 click (sync start):
  1. Read origin + id from inputs (`id` trimmed).
  2. `normalizeOrigin(origin)` in try/catch; on throw, set status and return.
  3. If `id` is non-empty: `await chrome.permissions.request({ origins: [hostPermissionPattern(origin)] })` as the first await in this click. If `!granted`, status `未授予站点权限`, return without writing storage.
  4. `await chrome.storage.local.set({ origin: normalizeOrigin(origin), id })`.
  5. `const res = await chrome.runtime.sendMessage({ type: "eone-apply" })`. If `!res?.ok`, status the error; still do not add a second DNR path — SW rebuild is the only writer.
- 清空 click: keep current origin (normalized if possible, else `DEFAULT_ORIGIN`), set `id` to `""`, save, apply, clear the id input.

Show success in `#status` on ok (`已保存` / `已清空`).

- [ ] **Step 4: Run automated tests**

Run: `pnpm test`

Expected: PASS

- [ ] **Step 5: Manual checklist (operator)**

1. Chrome → 加载未打包的扩展程序 → select `extension/`.
2. Popup: origin `http://localhost:3000`, id `eone-1`, 保存, allow host permission.
3. Open `http://localhost:3000/` → see eone-1 HTML.
4. Switch id to `eone-2`, 保存, refresh → eone-2 HTML; `index.js` still loads (DevTools request header `X-Eone-Id: eone-2`).
5. 清空 → refresh `/` → guide page, no `X-Eone-Id` on the document request.

- [ ] **Step 6: Commit**

```bash
git add extension/manifest.json extension/background.js extension/popup.html extension/popup.js
git commit -m "Add unpacked Chrome extension to set X-Eone-Id."
```

---

## Self-review vs spec

| Spec section | Task |
|--------------|------|
| One shared URL + header routing | 2, 5 |
| No header → guide | 5 `app/page.tsx` + classify `pass` |
| Illegal id → 400 | 2 rewrite + 4 html + 5 invalid route |
| Missing package → 404 HTML | 4, 5 |
| Missing file → 404 plain, no SPA | 3, 4 |
| `/` → index.html, nested files | 3, 5 curl |
| `storage/` rename | 5 |
| `proxy.ts` no fs | 2 + 5 |
| Node file handler + `[[...path]]` | 5 |
| Path escape / symlink | 3 |
| DNR header, one rule, regex both root and paths | 6 |
| Optional host permissions, clear removes rule | 7 |
| Extension unit + manual | 6, 7 |
| `pnpm test` Node 24 | 1 |
| Non-goals (upload, auth, hijack, SPA) | not in any task |

No TBD/TODO placeholders. `classifyRequest` / `servePackage` / `buildDnrRule` names are consistent across tasks.
