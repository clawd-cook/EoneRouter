# EoneRouter v1 Design

Local preview platform: one shared URL serves different static site trees based on a Chrome extension request header.

Date: 2026-09-08

## Goal

An operator drops a static site into `storage/<id>/`, sets that id in a Chrome extension, and opens a single platform URL (default `http://localhost:3000`). Every request to that origin carries `X-Eone-Id`, and the server returns files from the matching directory. The address bar never includes the id.

Without the header, the same URL shows a guide page. A bad or unknown id shows a platform error page, not content from another package.

## Non-goals (v1)

- Upload UI or API
- Auth / multi-user
- Hijacking third-party origins
- Per-project URLs
- SPA fallback (`index.html` for unknown paths)
- Directory listings
- Nested directory index (`/foo/` → `/foo/index.html`) except for site root `/`

## Components

| Unit | Location | Responsibility |
|------|----------|----------------|
| Chrome MV3 extension | `extension/` | Persist id + origin; attach `X-Eone-Id` via declarativeNetRequest |
| Middleware | `middleware.ts` | Classify the request; rewrite or pass through. No filesystem I/O (Edge). |
| Static reader | Node route handler under `/__eone/files` | Resolve and read files from `storage/<id>/` |
| Guide page | replace starter `app/page.tsx` | Shown when the header is absent |
| Error pages | Next pages under `/__eone/` | Invalid id (400) and missing package (404) |

Rename the existing typo directory `strorage/` to `storage/`. Keep the sample trees `eone-1` and `eone-2`.

## Identifier and storage

- Id pattern (entire string): `^eone-[A-Za-z0-9_-]+$`
- Package path: `<repoRoot>/storage/<id>/`
- A package exists only when that path is a directory

Reject anything that does not match the pattern (including `eone-../x`) before joining paths.

## Request header

- Name: `X-Eone-Id`
- Value: the identifier, or omit the header entirely when the operator clears the id
- The extension adds the header on the configured origin only
- Pages cannot set or clear this header

## URL and path mapping

Public origin is one shared entry, default `http://localhost:3000`. Pathnames are public paths, not package names.

After the id is accepted and the package directory exists:

| Request pathname | File |
|------------------|------|
| `/` (or empty) | `storage/<id>/index.html` |
| `/index.js` | `storage/<id>/index.js` |
| `/assets/a.css` | `storage/<id>/assets/a.css` |

Rules:

- Strip the query string and hash; they do not affect file lookup
- URL-decode the pathname
- Do not append `index.html` except for `/`
- If the resolved file is missing, is a directory, or is not a file → 404 (plain platform 404, not SPA fallback)
- Content-Type from file extension (html, js, css, json, svg, png, jpg, jpeg, gif, ico, woff, woff2, map, txt, wasm). Textual types include `charset=utf-8`. Unknown extension → `application/octet-stream`
- `Cache-Control: no-store` so switching packages is visible without hard-refresh tricks

## Routing in Next.js

Middleware runs on Edge and **must not** read `storage/`. It only inspects the path and `X-Eone-Id`, then `next()` or `rewrite()`.

Skip (never rewrite to static serving):

- `/_next/*`
- `/__eone/*` (internal guide/error/file routes; already rewritten)

Decision table for other paths:

| `X-Eone-Id` | Result |
|-------------|--------|
| missing or empty | `next()` → guide page at `/` for `/`; other public paths stay Next’s normal 404 |
| present, fails the id pattern | rewrite to `/__eone/invalid` (HTTP 400) |
| present, pattern ok | rewrite to `/__eone/files/<original pathname>` (root `/` → `/__eone/files/` ) |

Use an optional catch-all route `app/__eone/files/[[...path]]/route.ts` so both `/__eone/files` and `/__eone/files/index.js` hit the same handler.

The Node route handler must:

1. Read `X-Eone-Id` again (defense in depth)
2. Re-validate the pattern; if it fails, return HTTP 400 with the same body as `/__eone/invalid`
3. Confirm `storage/<id>` is a directory; if not, return HTTP 404 with the same body as `/__eone/missing` (shared HTML helper — do not 302, keep the 404)
4. Resolve the file **inside** that directory (see Security)
5. Return bytes, or HTTP 404 with a short “file not found” body (different from the missing-package page)

Direct browser visits to `/__eone/*` without going through rewrite are allowed to hit the same handlers; they still require a valid header to serve package files. `/__eone/invalid` and `/__eone/missing` are platform pages and do not require a header.

## Security

Resolve with `path.normalize` / `realpath` (or equivalent) and require:

- id matches the pattern
- joined path stays under `storage/<id>/` (prefix check after resolve; reject `..` segments)
- no symlink escape: resolved real path must remain under the real path of `storage/<id>/`

Failed checks → 400, do not read the file.

v1 has no authentication. Anyone who can reach the process and send the header can read any local package.

## Chrome extension

Manifest V3, no bundler in v1 (HTML/JS in `extension/`).

Permissions:

- `declarativeNetRequestWithHostAccess`
- `storage`
- `optional_host_permissions`: `http://*/*`, `https://*/*`

Default origin: `http://localhost:3000`. On save, request host access for that origin if not already granted. If the user denies permission, show an error and do not leave a DNR rule pointing at an unauthorized host.

Popup fields:

- Origin (text)
- Identifier (text, may be empty)
- Save / Clear

`Clear` empties the identifier, removes the DNR rule, and keeps the last origin.

Behavior:

- Persist `{ origin, id }` in `chrome.storage.local`
- On save, install, or service worker start: rebuild DNR from storage
- Single dynamic DNR rule (fixed id, e.g. `1`)
- `action`: `modifyHeaders` → request header `X-Eone-Id`
- `condition`: resource types covering document and subresources at least `main_frame`, `sub_frame`, `stylesheet`, `script`, `image`, `font`, `media`, `xmlhttprequest`, `websocket`, `other`
- URL filter: the configured origin including the origin with no extra path and all subpaths (DNR `/*` alone may miss `http://localhost:3000`)
- Empty id → remove the rule (no header)
- Changing origin: remove the old rule, then write the new one
- DNR or permission failure: popup shows the error; do not keep a partial rule

The extension does not inject content scripts and does not rewrite URLs.

## Guide and error UI

Guide (`/` without header), in Chinese:

- Install the unpacked extension from `extension/`
- Set `eone-xxxx` and the platform origin
- Place files in `storage/eone-xxxx/`
- Open this same URL

`/__eone/invalid` (400): identifier is not legal.

`/__eone/missing` (404): no package directory for that id.

Missing file inside a valid package: HTTP 404 with a short platform body (`text/plain` or minimal HTML), not the guide page and not another package’s `index.html`.

## Data flow

1. Operator copies files into `storage/eone-1/`
2. Popup saves id `eone-1` and origin `http://localhost:3000`
3. Service worker upserts the DNR rule
4. Browser requests `http://localhost:3000/` and `http://localhost:3000/index.js` with `X-Eone-Id: eone-1`
5. Middleware rewrites to the file handler; handler reads `storage/eone-1/index.html` and `storage/eone-1/index.js`
6. Address bar stays `http://localhost:3000/...`
7. Clear id → rule gone → `/` is the guide again

## Testing

Extract pure helpers (id validation, path resolve, DNR rule builder) so tests do not need Chrome or a full Next server.

Must cover:

- Id: accept `eone-1`; reject empty, `eone-../etc`, strings that do not match the pattern
- Resolve: `/` → `index.html`; `/index.js` → that file; `..` cannot escape `storage/<id>/`
- Serve outcomes: no header → guide; valid header + existing dir → file bytes and Content-Type; unknown id → missing-package 404; missing file → 404; illegal id → 400

Extension:

- Unit-test the function that turns `{origin,id}` into a DNR rule or `null` (clear)
- Manual: load unpacked extension → `eone-1` shows eone-1 HTML → switch to `eone-2` → clear → guide; subresource `/index.js` also receives the header

Run tests with the repo’s pinned Node (`v24.20.0` via nvm) and pnpm.

## Success criteria

v1 is done when:

1. `storage/eone-1` and `storage/eone-2` are selectable via the extension on `http://localhost:3000`
2. Root and at least one nested/static file path work
3. No header shows the guide; bad id and missing package show the specified errors
4. Automated tests above pass
5. The manual extension checklist passes
