# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a local operator type an `eone-*` id, upload a folder, and create or delete `storage/<id>/` from `/__eone/admin`, without overwriting an occupied id.

**Architecture:** Pure helpers in `lib/eone/` list, create (temp dir + rename), and delete packages. Node route handlers under `/__eone/admin/packages` parse multipart / JSON. A Server Component page plus one Client Component handle the Chinese UI. `proxy.ts` already skips `/__eone/*`; serving and the Chrome extension stay unchanged.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Node 24.20.0 `node:test`, Tailwind v4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-admin-panel-design.md`

## Global Constraints

- Runtime: nvm Node **v24.20.0** only; `which node` must be `$HOME/.nvm/versions/node/v24.20.0/bin/node`. Activate with `nvm use 24.20.0` in the current shell before every command.
- Package manager: **pnpm** only. Do not add Jest, Vitest, Playwright, or zip libraries.
- Tests: `node --test --experimental-strip-types` as in `package.json` (`lib/eone/*.test.ts` already matches new files).
- Id pattern (entire string): `^eone-[A-Za-z0-9_-]+$` via existing `isValidEoneId`.
- Storage root: `getStorageRoot()` (`EONE_STORAGE_ROOT` or `<cwd>/storage`). Tests use `fs.mkdtempSync`, never the repo `storage/` fixtures.
- Upload paths: server strips the first `webkitRelativePath` segment; client must send that path **with** the folder prefix.
- Occupied id → HTTP 409, no writes. No auth. No zip. No overwrite. `index.html` is optional.
- Next 16: `app/%5F_eone/...` keeps public URLs `/__eone/...`. Do not create `middleware.ts`. `params` is `Promise<...>`. Route handlers `runtime = "nodejs"`.
- Before writing `app/` files, read `.agents/skills/next-best-practices/SKILL.md` (file conventions, route handlers, RSC) and `.agents/skills/vercel-react-best-practices/SKILL.md` (Server Components by default; `'use client'` only for the form).
- Every `Run:` below assumes nvm 24.20.0 is already active in that shell.

---

## File structure

| File | Responsibility |
|------|----------------|
| `lib/eone/package-path.ts` | `resolveUploadRelativePath` — normalize, strip first segment, reject escapes |
| `lib/eone/packages.ts` | `listPackages`, `createPackage`, `deletePackage` |
| `lib/eone/package-http.ts` | Error code → `{ status, error }`; `MAX_PACKAGE_BODY_BYTES`; `isBodyTooLarge` |
| `app/%5F_eone/admin/packages/route.ts` | `GET` list, `POST` create |
| `app/%5F_eone/admin/packages/[id]/route.ts` | `DELETE` one package |
| `app/%5F_eone/admin/page.tsx` | RSC: load list, render panel |
| `app/%5F_eone/admin/admin-panel.tsx` | Client: folder picker, POST, delete + confirm |
| `app/page.tsx` | Guide link + step 3 mention |
| `lib/eone/classify.test.ts` | Explicit skip for `/__eone/admin` |

Do not change `proxy.ts`, `lib/eone/classify.ts`, `lib/eone/serve.ts`, or `extension/`.

---

### Task 1: Upload relative-path resolver

**Files:**
- Create: `lib/eone/package-path.ts`
- Create: `lib/eone/package-path.test.ts`

**Interfaces:**
- Consumes: nothing (pure string logic)
- Produces: `export function resolveUploadRelativePath(raw: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `lib/eone/package-path.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveUploadRelativePath } from "./package-path.ts";

test("strips the selected folder prefix", () => {
  assert.equal(resolveUploadRelativePath("mysite/index.html"), "index.html");
  assert.equal(
    resolveUploadRelativePath("mysite/assets/a.css"),
    "assets/a.css",
  );
});

test("normalizes backslashes then strips", () => {
  assert.equal(
    resolveUploadRelativePath("mysite\\assets\\a.css"),
    "assets/a.css",
  );
});

test("rejects a path that is already stripped (would become empty)", () => {
  assert.equal(resolveUploadRelativePath("index.html"), null);
});

test("rejects empty, dot, and parent segments after strip", () => {
  assert.equal(resolveUploadRelativePath(""), null);
  assert.equal(resolveUploadRelativePath("mysite/"), null);
  assert.equal(resolveUploadRelativePath("mysite/."), null);
  assert.equal(resolveUploadRelativePath("mysite/foo/../bar"), null);
  assert.equal(resolveUploadRelativePath("mysite/../outside.txt"), null);
});

test("rejects absolute paths", () => {
  assert.equal(resolveUploadRelativePath("/mysite/index.html"), null);
  assert.equal(resolveUploadRelativePath("C:\\mysite\\index.html"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types lib/eone/package-path.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./package-path.ts`

- [ ] **Step 3: Write minimal implementation**

Create `lib/eone/package-path.ts`:

```ts
export function resolveUploadRelativePath(raw: string): string | null {
  if (raw === "" || raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw)) {
    return null;
  }

  const normalized = raw.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("//")) {
    return null;
  }

  const segments = normalized.split("/");
  if (segments.length < 2) {
    return null;
  }
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return null;
  }

  return segments.slice(1).join("/");
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --experimental-strip-types lib/eone/package-path.test.ts`

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/eone/package-path.ts lib/eone/package-path.test.ts
git commit -m "$(cat <<'EOF'
Add upload path resolver that strips the folder prefix.

EOF
)"
```

---

### Task 2: List packages

**Files:**
- Create: `lib/eone/packages.ts` (list only in this task)
- Create: `lib/eone/packages.test.ts`

**Interfaces:**
- Consumes: `isValidEoneId` from `lib/eone/id.ts`; `fs` / `path`
- Produces: `export function listPackages(storageRoot: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `lib/eone/packages.test.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listPackages } from "./packages.ts";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eone-pkg-"));
}

test("lists only valid eone directories, sorted", () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, "eone-2"));
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "ok");
  fs.writeFileSync(path.join(root, "not-a-package"), "x");
  fs.mkdirSync(path.join(root, "prod-1"));
  fs.mkdirSync(path.join(root, ".tmp-abc"));
  fs.writeFileSync(path.join(root, "eone-file"), "nope");

  assert.deepEqual(listPackages(root), ["eone-1", "eone-2"]);
});

test("returns empty when storage root is missing", () => {
  const root = path.join(makeRoot(), "missing");
  assert.deepEqual(listPackages(root), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types lib/eone/packages.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./packages.ts`

- [ ] **Step 3: Write minimal implementation**

Create `lib/eone/packages.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { isValidEoneId } from "./id";

export function listPackages(storageRoot: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(storageRoot);
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const name of names) {
    if (!isValidEoneId(name)) {
      continue;
    }
    let st: fs.Stats;
    try {
      st = fs.lstatSync(path.join(storageRoot, name));
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      ids.push(name);
    }
  }
  return ids.toSorted();
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --experimental-strip-types lib/eone/packages.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/eone/packages.ts lib/eone/packages.test.ts
git commit -m "$(cat <<'EOF'
List valid eone package directories from storage.

EOF
)"
```

---

### Task 3: Create package (atomic, no overwrite)

**Files:**
- Modify: `lib/eone/packages.ts`
- Modify: `lib/eone/packages.test.ts`

**Interfaces:**
- Consumes: `resolveUploadRelativePath`; `listPackages` already in this file; `isValidEoneId`
- Produces:

```ts
export type PackageFile = { relativePath: string; bytes: Uint8Array };

export type CreatePackageResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code:
        | "invalid-id"
        | "empty-files"
        | "path-escape"
        | "package-exists"
        | "write-failed";
    };

export function createPackage(
  storageRoot: string,
  id: string,
  files: PackageFile[],
): CreatePackageResult
```

- [ ] **Step 1: Append failing tests**

Add to `lib/eone/packages.test.ts` (keep existing tests; add this import):

```ts
import { createPackage, listPackages } from "./packages.ts";
```

Then:

```ts
test("createPackage writes files with the folder prefix stripped", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-7", [
    { relativePath: "mysite/index.html", bytes: new TextEncoder().encode("hello") },
    {
      relativePath: "mysite/assets/a.css",
      bytes: new TextEncoder().encode("body{}"),
    },
  ]);
  assert.deepEqual(result, { ok: true, id: "eone-7" });
  assert.equal(
    fs.readFileSync(path.join(root, "eone-7", "index.html"), "utf8"),
    "hello",
  );
  assert.equal(
    fs.readFileSync(path.join(root, "eone-7", "assets", "a.css"), "utf8"),
    "body{}",
  );
  assert.equal(fs.existsSync(path.join(root, "eone-7", "mysite")), false);
});

test("createPackage allows a tree without index.html", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-noindex", [
    { relativePath: "site/readme.txt", bytes: new TextEncoder().encode("x") },
  ]);
  assert.deepEqual(result, { ok: true, id: "eone-noindex" });
  assert.equal(fs.existsSync(path.join(root, "eone-noindex", "readme.txt")), true);
});

test("createPackage rejects illegal id without writing", () => {
  const root = makeRoot();
  const result = createPackage(root, "prod-1", [
    { relativePath: "site/index.html", bytes: new Uint8Array([1]) },
  ]);
  assert.deepEqual(result, { ok: false, code: "invalid-id" });
  assert.deepEqual(fs.readdirSync(root), []);
});

test("createPackage rejects empty files", () => {
  const root = makeRoot();
  assert.deepEqual(createPackage(root, "eone-8", []), {
    ok: false,
    code: "empty-files",
  });
});

test("createPackage rejects occupied id and leaves original bytes", () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, "eone-1"));
  fs.writeFileSync(path.join(root, "eone-1", "index.html"), "keep");
  const result = createPackage(root, "eone-1", [
    { relativePath: "site/index.html", bytes: new TextEncoder().encode("new") },
  ]);
  assert.deepEqual(result, { ok: false, code: "package-exists" });
  assert.equal(
    fs.readFileSync(path.join(root, "eone-1", "index.html"), "utf8"),
    "keep",
  );
});

test("createPackage rejects escape paths and does not create the target", () => {
  const root = makeRoot();
  const result = createPackage(root, "eone-9", [
    { relativePath: "site/foo/../../outside.txt", bytes: new Uint8Array([1]) },
  ]);
  assert.deepEqual(result, { ok: false, code: "path-escape" });
  assert.equal(fs.existsSync(path.join(root, "eone-9")), false);
  const leftovers = fs.readdirSync(root).filter((n) => n.startsWith(".tmp-"));
  assert.deepEqual(leftovers, []);
});
```

- [ ] **Step 2: Run test to verify new cases fail**

Run: `node --test --experimental-strip-types lib/eone/packages.test.ts`

Expected: FAIL (`createPackage` is not exported)

- [ ] **Step 3: Implement `createPackage`**

Append to `lib/eone/packages.ts`:

```ts
import { randomUUID } from "node:crypto";
import { resolveUploadRelativePath } from "./package-path";

export type PackageFile = { relativePath: string; bytes: Uint8Array };

export type CreatePackageResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code:
        | "invalid-id"
        | "empty-files"
        | "path-escape"
        | "package-exists"
        | "write-failed";
    };

function isInside(parent: string, child: string): boolean {
  const prefix = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child === parent || child.startsWith(prefix);
}

function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function createPackage(
  storageRoot: string,
  id: string,
  files: PackageFile[],
): CreatePackageResult {
  if (!isValidEoneId(id)) {
    return { ok: false, code: "invalid-id" };
  }
  if (files.length === 0) {
    return { ok: false, code: "empty-files" };
  }

  const resolved: { relative: string; bytes: Uint8Array }[] = [];
  for (const file of files) {
    const relative = resolveUploadRelativePath(file.relativePath);
    if (relative === null) {
      return { ok: false, code: "path-escape" };
    }
    resolved.push({ relative, bytes: file.bytes });
  }

  fs.mkdirSync(storageRoot, { recursive: true });
  const dest = path.join(storageRoot, id);
  if (fs.existsSync(dest)) {
    return { ok: false, code: "package-exists" };
  }

  const tmpDir = path.join(storageRoot, `.tmp-${randomUUID()}`);
  try {
    fs.mkdirSync(tmpDir);
    const realTmp = fs.realpathSync(tmpDir);
    for (const file of resolved) {
      const target = path.resolve(realTmp, file.relative);
      if (!isInside(realTmp, target)) {
        removeDir(tmpDir);
        return { ok: false, code: "path-escape" };
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.bytes);
    }
    fs.renameSync(tmpDir, dest);
    return { ok: true, id };
  } catch (err) {
    removeDir(tmpDir);
    if (fs.existsSync(dest) && (err as NodeJS.ErrnoException).code === "EEXIST") {
      return { ok: false, code: "package-exists" };
    }
    if (fs.existsSync(dest) && fs.lstatSync(dest).isDirectory()) {
      return { ok: false, code: "package-exists" };
    }
    return { ok: false, code: "write-failed" };
  }
}
```

If `renameSync` throws because `dest` appeared, catch, `removeDir(tmpDir)`, return `package-exists`. If rename succeeded, do not delete dest. Keep the catch conservative: only return `package-exists` when `dest` already existed **before** a successful write of our tree; if rename failed and dest is the other package, do not `rmSync(dest)`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --experimental-strip-types lib/eone/packages.test.ts`

Expected: PASS (list + create)

- [ ] **Step 5: Commit**

```bash
git add lib/eone/packages.ts lib/eone/packages.test.ts
git commit -m "$(cat <<'EOF'
Create eone packages atomically without overwriting.

EOF
)"
```

---

### Task 4: Delete package

**Files:**
- Modify: `lib/eone/packages.ts`
- Modify: `lib/eone/packages.test.ts`

**Interfaces:**
- Consumes: `isValidEoneId`; `listPackages` / `createPackage` already in this file
- Produces:

```ts
export type DeletePackageResult =
  | { ok: true; id: string }
  | { ok: false; code: "invalid-id" | "not-found" | "write-failed" };

export function deletePackage(
  storageRoot: string,
  id: string,
): DeletePackageResult
```

- [ ] **Step 1: Append failing tests**

```ts
import { createPackage, deletePackage, listPackages } from "./packages.ts";
```

```ts
test("deletePackage removes only that directory", () => {
  const root = makeRoot();
  createPackage(root, "eone-a", [
    { relativePath: "s/index.html", bytes: new TextEncoder().encode("a") },
  ]);
  createPackage(root, "eone-b", [
    { relativePath: "s/index.html", bytes: new TextEncoder().encode("b") },
  ]);
  assert.deepEqual(deletePackage(root, "eone-a"), { ok: true, id: "eone-a" });
  assert.equal(fs.existsSync(path.join(root, "eone-a")), false);
  assert.equal(
    fs.readFileSync(path.join(root, "eone-b", "index.html"), "utf8"),
    "b",
  );
});

test("deletePackage rejects illegal id", () => {
  const root = makeRoot();
  assert.deepEqual(deletePackage(root, "prod-1"), {
    ok: false,
    code: "invalid-id",
  });
});

test("deletePackage returns not-found when missing", () => {
  const root = makeRoot();
  assert.deepEqual(deletePackage(root, "eone-missing"), {
    ok: false,
    code: "not-found",
  });
});
```

- [ ] **Step 2: Run test to verify new cases fail**

Run: `node --test --experimental-strip-types lib/eone/packages.test.ts`

Expected: FAIL (`deletePackage` is not exported)

- [ ] **Step 3: Implement `deletePackage`**

Append to `lib/eone/packages.ts`:

```ts
export type DeletePackageResult =
  | { ok: true; id: string }
  | { ok: false; code: "invalid-id" | "not-found" | "write-failed" };

export function deletePackage(
  storageRoot: string,
  id: string,
): DeletePackageResult {
  if (!isValidEoneId(id)) {
    return { ok: false, code: "invalid-id" };
  }

  const packageDir = path.join(storageRoot, id);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(packageDir);
  } catch {
    return { ok: false, code: "not-found" };
  }
  if (!st.isDirectory()) {
    return { ok: false, code: "not-found" };
  }

  let realRoot: string;
  let realPackage: string;
  try {
    realRoot = fs.realpathSync(storageRoot);
    realPackage = fs.realpathSync(packageDir);
  } catch {
    return { ok: false, code: "not-found" };
  }
  if (realPackage === realRoot || !isInside(realRoot, realPackage)) {
    return { ok: false, code: "write-failed" };
  }

  try {
    fs.rmSync(packageDir, { recursive: true, force: false });
    return { ok: true, id };
  } catch {
    return { ok: false, code: "write-failed" };
  }
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --experimental-strip-types lib/eone/packages.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/eone/packages.ts lib/eone/packages.test.ts
git commit -m "$(cat <<'EOF'
Delete a single eone package directory.

EOF
)"
```

---

### Task 5: HTTP error mapping and body-size guard

**Files:**
- Create: `lib/eone/package-http.ts`
- Create: `lib/eone/package-http.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:

```ts
export const MAX_PACKAGE_BODY_BYTES = 100 * 1024 * 1024;

export type PackageErrorCode =
  | "invalid-id"
  | "empty-files"
  | "path-escape"
  | "package-exists"
  | "not-found"
  | "write-failed";

export function packageErrorBody(code: PackageErrorCode): {
  status: number;
  error: string;
};

export function isBodyTooLarge(contentLengthHeader: string | null): boolean;
```

- [ ] **Step 1: Write the failing test**

Create `lib/eone/package-http.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBodyTooLarge,
  MAX_PACKAGE_BODY_BYTES,
  packageErrorBody,
} from "./package-http.ts";

test("maps codes to the spec statuses and Chinese messages", () => {
  assert.deepEqual(packageErrorBody("invalid-id"), {
    status: 400,
    error: "标识不合法",
  });
  assert.deepEqual(packageErrorBody("empty-files"), {
    status: 400,
    error: "未选择文件",
  });
  assert.deepEqual(packageErrorBody("path-escape"), {
    status: 400,
    error: "相对路径不合法",
  });
  assert.deepEqual(packageErrorBody("package-exists"), {
    status: 409,
    error: "标识已被占用",
  });
  assert.deepEqual(packageErrorBody("not-found"), {
    status: 404,
    error: "找不到该标识",
  });
  assert.deepEqual(packageErrorBody("write-failed"), {
    status: 500,
    error: "写入失败",
  });
});

test("isBodyTooLarge uses the 100 MiB ceiling", () => {
  assert.equal(MAX_PACKAGE_BODY_BYTES, 100 * 1024 * 1024);
  assert.equal(isBodyTooLarge(null), false);
  assert.equal(isBodyTooLarge(""), false);
  assert.equal(isBodyTooLarge(String(MAX_PACKAGE_BODY_BYTES)), false);
  assert.equal(isBodyTooLarge(String(MAX_PACKAGE_BODY_BYTES + 1)), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types lib/eone/package-http.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Write implementation**

Create `lib/eone/package-http.ts`:

```ts
export const MAX_PACKAGE_BODY_BYTES = 100 * 1024 * 1024;

export type PackageErrorCode =
  | "invalid-id"
  | "empty-files"
  | "path-escape"
  | "package-exists"
  | "not-found"
  | "write-failed";

const ERRORS: Record<PackageErrorCode, { status: number; error: string }> = {
  "invalid-id": { status: 400, error: "标识不合法" },
  "empty-files": { status: 400, error: "未选择文件" },
  "path-escape": { status: 400, error: "相对路径不合法" },
  "package-exists": { status: 409, error: "标识已被占用" },
  "not-found": { status: 404, error: "找不到该标识" },
  "write-failed": { status: 500, error: "写入失败" },
};

export function packageErrorBody(code: PackageErrorCode): {
  status: number;
  error: string;
} {
  return ERRORS[code];
}

export function isBodyTooLarge(contentLengthHeader: string | null): boolean {
  if (contentLengthHeader === null || contentLengthHeader === "") {
    return false;
  }
  const n = Number(contentLengthHeader);
  return Number.isFinite(n) && n > MAX_PACKAGE_BODY_BYTES;
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `node --test --experimental-strip-types lib/eone/package-http.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/eone/package-http.ts lib/eone/package-http.test.ts
git commit -m "$(cat <<'EOF'
Map package errors to HTTP status and Chinese messages.

EOF
)"
```

---

### Task 6: GET and POST `/__eone/admin/packages`

**Files:**
- Create: `app/%5F_eone/admin/packages/route.ts`
- Modify: `lib/eone/classify.test.ts` (assert admin paths skip)

**Interfaces:**
- Consumes: `listPackages`, `createPackage`, `getStorageRoot`, `packageErrorBody`, `isBodyTooLarge`
- Produces: HTTP `GET` `{ packages: string[] }`; `POST` `{ id }` or `{ error }`

Read `.agents/skills/next-best-practices/route-handlers.md` and `file-conventions.md` before this task. `page.tsx` and `route.ts` must not share a folder; this route lives in `packages/`, the page in `admin/`.

- [ ] **Step 1: Extend classify skip tests**

In `lib/eone/classify.test.ts`, inside `"skips _next and __eone prefixes"`, add:

```ts
  assert.deepEqual(classifyRequest("/__eone/admin", "eone-1"), {
    action: "skip",
  });
  assert.deepEqual(classifyRequest("/__eone/admin/packages", "eone-1"), {
    action: "skip",
  });
  assert.deepEqual(
    classifyRequest("/__eone/admin/packages/eone-1", "eone-2"),
    { action: "skip" },
  );
```

Run: `node --test --experimental-strip-types lib/eone/classify.test.ts`

Expected: PASS (prefix skip already covers these; the asserts lock the spec)

- [ ] **Step 2: Implement the route handler**

Create `app/%5F_eone/admin/packages/route.ts`:

```ts
import { isBodyTooLarge, packageErrorBody } from "@/lib/eone/package-http";
import { createPackage, listPackages } from "@/lib/eone/packages";
import { getStorageRoot } from "@/lib/eone/storage-root";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(code: Parameters<typeof packageErrorBody>[0]) {
  const { status, error } = packageErrorBody(code);
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const packages = listPackages(getStorageRoot());
  return NextResponse.json({ packages });
}

export async function POST(request: Request) {
  if (isBodyTooLarge(request.headers.get("content-length"))) {
    return NextResponse.json({ error: "包太大" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("write-failed");
  }

  const id = String(form.get("id") ?? "");
  const fileParts = form.getAll("file");
  const pathParts = form.getAll("path");
  if (fileParts.length === 0 || fileParts.length !== pathParts.length) {
    return jsonError("empty-files");
  }

  const files = [];
  for (let i = 0; i < fileParts.length; i++) {
    const part = fileParts[i];
    const rel = pathParts[i];
    if (!(part instanceof File) || typeof rel !== "string") {
      return jsonError("empty-files");
    }
    files.push({
      relativePath: rel,
      bytes: new Uint8Array(await part.arrayBuffer()),
    });
  }

  const result = createPackage(getStorageRoot(), id, files);
  if (!result.ok) {
    return jsonError(result.code);
  }
  return NextResponse.json({ id: result.id });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add "app/%5F_eone/admin/packages/route.ts" lib/eone/classify.test.ts
git commit -m "$(cat <<'EOF'
Add list and create APIs for admin packages.

EOF
)"
```

---

### Task 7: DELETE `/__eone/admin/packages/<id>`

**Files:**
- Create: `app/%5F_eone/admin/packages/[id]/route.ts`

**Interfaces:**
- Consumes: `deletePackage`, `getStorageRoot`, `packageErrorBody`
- Produces: HTTP `DELETE` `{ id }` or `{ error }`

- [ ] **Step 1: Implement the route handler**

Create `app/%5F_eone/admin/packages/[id]/route.ts`:

```ts
import { packageErrorBody } from "@/lib/eone/package-http";
import { deletePackage } from "@/lib/eone/packages";
import { getStorageRoot } from "@/lib/eone/storage-root";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = deletePackage(getStorageRoot(), id);
  if (!result.ok) {
    const { status, error } = packageErrorBody(result.code);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ id: result.id });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/%5F_eone/admin/packages/[id]/route.ts"
git commit -m "$(cat <<'EOF'
Add delete API for a single admin package.

EOF
)"
```

---

### Task 8: Admin page UI

**Files:**
- Create: `app/%5F_eone/admin/admin-panel.tsx`
- Create: `app/%5F_eone/admin/page.tsx`

**Interfaces:**
- Consumes: `listPackages`, `getStorageRoot`, `isValidEoneId`; POST `/__eone/admin/packages`; DELETE `/__eone/admin/packages/${id}`
- Produces: `/__eone/admin` Chinese panel (form + list)

Read `.agents/skills/next-best-practices/rsc-boundaries.md` and `directives.md`. Default Server Component page; `'use client'` only on `admin-panel.tsx`. Do not define components inside components. After success, `router.refresh()`.

- [ ] **Step 1: Client panel**

Create `app/%5F_eone/admin/admin-panel.tsx`:

```tsx
"use client";

import { isValidEoneId } from "@/lib/eone/id";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function AdminPanel({ packages }: { packages: string[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function bindDirectoryInput(node: HTMLInputElement | null) {
    if (!node) {
      return;
    }
    node.setAttribute("webkitdirectory", "");
    node.setAttribute("directory", "");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const trimmed = id.trim();
    if (!isValidEoneId(trimmed)) {
      setMessage("标识不合法");
      return;
    }
    const selected = inputRef.current?.files;
    if (!selected || selected.length === 0) {
      setMessage("未选择文件");
      return;
    }

    const form = new FormData();
    form.append("id", trimmed);
    for (const file of selected) {
      form.append("file", file);
      form.append("path", file.webkitRelativePath);
    }

    setPending(true);
    try {
      const response = await fetch("/__eone/admin/packages", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "写入失败");
        return;
      }
      setId("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setMessage(`已创建 ${body.id}`);
      router.refresh();
    } catch {
      setMessage("写入失败");
    } finally {
      setPending(false);
    }
  }

  async function onDelete(packageId: string) {
    if (!window.confirm(`确定删除 ${packageId}？`)) {
      return;
    }
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch(
        `/__eone/admin/packages/${encodeURIComponent(packageId)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "写入失败");
        return;
      }
      setMessage(`已删除 ${packageId}`);
      router.refresh();
    } catch {
      setMessage("写入失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16 sm:px-10">
      <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-zinc-950 sm:p-12">
        <p className="mb-3 font-mono text-sm font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
          EoneRouter
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          管理静态包
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          填写标识并选择本地文件夹。标识已被占用时不会覆盖。
        </p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            标识
            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 font-mono dark:border-white/15"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="eone-xxxx"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            文件夹
            <input
              ref={(node) => {
                inputRef.current = node;
                bindDirectoryInput(node);
              }}
              className="mt-2 w-full text-sm"
              type="file"
              multiple
            />
          </label>
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            type="submit"
            disabled={pending}
          >
            上传
          </button>
        </form>

        {message ? (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
        ) : null}

        <h2 className="mt-10 text-lg font-semibold">已有标识</h2>
        {packages.length === 0 ? (
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">暂无静态包</p>
        ) : (
          <ul className="mt-4 divide-y divide-black/10 dark:divide-white/15">
            {packages.map((packageId) => (
              <li
                key={packageId}
                className="flex items-center justify-between py-3"
              >
                <code className="font-mono">{packageId}</code>
                <button
                  className="text-sm text-red-700 dark:text-red-400"
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    void onDelete(packageId);
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
```

Do not send already-stripped paths. `file.webkitRelativePath` must keep the folder prefix.

- [ ] **Step 2: Server page**

Create `app/%5F_eone/admin/page.tsx`:

```tsx
import { AdminPanel } from "./admin-panel";
import { listPackages } from "@/lib/eone/packages";
import { getStorageRoot } from "@/lib/eone/storage-root";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const packages = listPackages(getStorageRoot());
  return <AdminPanel packages={packages} />;
}
```

- [ ] **Step 3: Typecheck and lint app files**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint app next.config.ts postcss.config.mjs eslint.config.mjs
```

Expected: PASS (no errors). If eslint flags the `directory` attribute, keep `setAttribute` only.

- [ ] **Step 4: Commit**

```bash
git add "app/%5F_eone/admin/page.tsx" "app/%5F_eone/admin/admin-panel.tsx"
git commit -m "$(cat <<'EOF'
Add admin panel UI for folder upload and package delete.

EOF
)"
```

---

### Task 9: Guide page link

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `/__eone/admin`
- Produces: operator can reach the panel from the guide

- [ ] **Step 1: Update the guide**

In `app/page.tsx`, add `import Link from "next/link";` and replace step 3 plus a line under the list:

```tsx
          <li>
            把静态文件放到{" "}
            <code className="font-mono">storage/eone-xxxx/</code>
            ，或打开{" "}
            <Link className="underline" href="/__eone/admin">
              管理端
            </Link>{" "}
            上传文件夹
          </li>
```

Keep the other three steps as they are.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Link the guide page to the admin panel.

EOF
)"
```

---

### Task 10: Verify helpers, types, and existing serving

**Files:** none new (run commands; fix only if a previous task left a failure)

**Interfaces:**
- Consumes: all of the above
- Produces: evidence that unit tests, `tsc`, and targeted eslint pass

- [ ] **Step 1: Run unit tests**

Run: `pnpm test`

Expected: PASS, including `package-path`, `packages`, `package-http`, `classify`, and existing serve/path/id tests.

- [ ] **Step 2: Typecheck and lint**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint app next.config.ts postcss.config.mjs eslint.config.mjs lib/eone
```

Expected: PASS

- [ ] **Step 3: Manual checklist (needs `pnpm dev` on :3000)**

This app is Next.js **16.2.9**. `.agents/skills/next-dev-loop` wants 16.3+ `/_next/mcp` and `agent-browser`. Do **not** upgrade Next or `npm i -g agent-browser` unless the operator explicitly says yes. If those tools are missing, verify with `curl` / the browser as below and state that MCP + agent-browser did not run.

1. No `X-Eone-Id`: `GET http://localhost:3000/` shows the guide and a 管理端 link. Follow it to `/__eone/admin`.
2. With the extension header still set to some id, `/__eone/admin` still renders the panel (not a static package).
3. Upload a new id whose folder contains `index.html` → list shows it. Point the extension at that id → `GET /` returns that HTML.
4. Upload the same id again → UI shows 标识已被占用; original files unchanged.
5. Delete that id → gone from the list; that header then matches the existing missing-package page.

- [ ] **Step 4: Commit only if Step 1–2 required fixes**

If nothing changed, skip. If you fixed a bug:

```bash
git add -u
git commit -m "$(cat <<'EOF'
Fix admin panel issues found in verification.

EOF
)"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| `/__eone/admin` page + Chinese UI | 8 |
| Directory picker; `path` keeps folder prefix | 8 |
| GET/POST `/__eone/admin/packages` | 6 |
| DELETE `/__eone/admin/packages/<id>` | 7 |
| List only valid dirs | 2 |
| Strip first path segment; reject `..` / absolute | 1, 3 |
| 409 no overwrite; atomic temp + rename | 3 |
| Delete one package; siblings remain | 4 |
| Chinese JSON errors + 413 包太大 | 5, 6 |
| `index.html` optional | 3 |
| Guide link | 9 |
| Skip rewrite for `/__eone/admin*` | 6 (classify tests; no `classify.ts` change) |
| No auth, zip, rename, extension changes | not implemented |
| Automated tests in `lib/eone` | 1–5 |
| Manual checklist | 10 |
