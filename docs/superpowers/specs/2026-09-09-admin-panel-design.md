# Admin panel: upload zip and assign eone id

Local operators can create and delete static packages from a browser page instead of copying trees into `storage/` by hand.

Date: 2026-09-09

This extends [EoneRouter v1](./2026-09-08-eone-router-design.md). Serving, `X-Eone-Id` rewrite, and the Chrome extension stay as they are.

## Goal

An operator opens `/__eone/admin` on the same platform origin, types an identifier (`eone-xxxx`), chooses a local **`.zip`** whose root is the site root, and the server extracts that tree to `storage/<id>/`. The page lists existing packages and can delete one after confirmation.

If the identifier already has a directory, upload is rejected. Nothing is overwritten.

## Non-goals

- Authentication, tokens, or localhost-only checks (same trust model as v1 reads)
- Folder / `webkitdirectory` upload
- Renaming a package or changing its id without re-upload
- Overwrite / merge into an existing directory
- Configuring the Chrome extension from this page
- Requiring `index.html` (a package without it is still created; `/` keeps today’s missing-file 404)

## Upload request

`multipart/form-data`:

- `id`: string, the eone identifier
- `file`: a single `.zip` archive

Zip root = package root (`index.html` at the archive root becomes `storage/<id>/index.html`). The server rejects path escape (`..`, absolute paths), empty archives, non-`.zip` names, and corrupt zips.

Request body limit and uncompressed total: **100 MiB**. Over that → HTTP 413, message 包太大.

Reverse proxies in front of the app must allow at least **100 MiB** (nginx: `client_max_body_size 100m;`). See `README.md`.

## Components

| Unit | Location | Responsibility |
|------|----------|----------------|
| Admin page | `app/%5F_eone/admin/page.tsx` | Chinese UI: upload form + package list |
| Upload form | client component under that route | Zip file picker, client-side id check, `FormData` POST |
| Package APIs | Node route handlers under `/__eone/admin/packages` | List, create (zip extract), delete |
| Package writer | `lib/eone/` (`extractZipFiles`, `createPackage`, …) | Zip extract + disk list/create/delete with path confinement |
| Guide page | `app/page.tsx` | Link into the admin page |

`proxy.ts` already skips `/__eone/*`. No classify change. The extension is unchanged. `/__eone/files` keeps read-only serving.

## Identifier and storage

Same rules as v1:

- Entire id: `^eone-[A-Za-z0-9_-]+$`
- Package path: `<storageRoot>/<id>/` where `storageRoot` is `EONE_STORAGE_ROOT` or `<cwd>/storage`
- A package exists only when that path is a directory

List returns only directory names that pass the id pattern. Files, junk names, and temp dirs are omitted.

## Routes

Public URLs (folder name remains `%5F_eone` so the path stays `/__eone/...`):

| Method | Path | Action |
|--------|------|--------|
| GET | `/__eone/admin` | HTML panel |
| GET | `/__eone/admin/packages` | JSON list `{ "packages": string[] }` sorted by id |
| POST | `/__eone/admin/packages` | multipart create |
| DELETE | `/__eone/admin/packages/<id>` | delete that package |

JSON errors: `{ "error": "<Chinese message>" }` plus the HTTP status below.

## Create semantics

1. Validate `id`. Fail → 400 标识不合法.
2. If `file` missing or not a File → 400 未选择文件. If name is not `.zip` or zip is corrupt → 400 压缩包不合法. Empty archive → 400 未选择文件. Path escape in zip → 400 相对路径不合法. Uncompressed over limit → 413 包太大.
3. If `<storageRoot>/<id>` already exists as a directory → **409** 标识已被占用, write nothing.
4. Write into a temp directory whose name does **not** match the id pattern (so it never appears in the list), under `storageRoot`.
5. On success, `rename` the temp dir to `<storageRoot>/<id>`. If the target appeared meanwhile, delete the temp dir and return 409.
6. On any validation or write failure after temp creation, delete the temp dir. The target id directory must not exist afterwards.

HTTP 200 body: `{ "id": "<id>" }`.

`index.html` is optional.

## Delete semantics

1. Validate `id` from the URL. Fail → 400 标识不合法.
2. If the directory is missing → 404 找不到该标识.
3. Recursively remove only `<storageRoot>/<id>/`. Never remove `storageRoot` itself or sibling packages.
4. HTTP 200: `{ "id": "<id>" }`. Disk failure → 500.

The UI confirms before calling DELETE.

## Page flow

Chinese copy, same visual language as the guide page.

Top: identifier text field, `.zip` file input, submit. Client blocks bad ids, missing/non-zip files, and bodies over 100 MiB; the server re-checks.

Bottom: one row per listed id and a delete button. After a successful create or delete, reload the list (refresh the page or re-fetch GET).

The guide page (`/` without header) adds a link to `/__eone/admin` so the operator does not have to remember the path. Step 3 can mention the panel as an alternative to copying files by hand.

## Data flow

1. Operator opens `http://localhost:3000/__eone/admin` (works with or without `X-Eone-Id`).
2. GET packages renders the list from disk.
3. Operator types `eone-7`, picks a zip with site-root layout, submits.
4. POST extracts and writes `storage/eone-7/` atomically.
5. Popup still sets `X-Eone-Id: eone-7`; existing file serving returns that tree.
6. Operator deletes `eone-7` → directory gone → same header now hits the existing missing-package page.

## Error handling (summary)

| Case | HTTP | Notes |
|------|------|--------|
| Illegal id | 400 | Create and delete |
| No file / empty zip | 400 | Create |
| Non-zip or corrupt zip | 400 | 压缩包不合法 |
| Path escape in zip | 400 | 相对路径不合法; target not created |
| Id already a directory | 409 | No writes |
| Body or uncompressed larger than 100 MiB | 413 | |
| Delete missing package | 404 | |
| Unexpected disk error | 500 | Temp cleaned on create; other packages untouched |

No auth errors. `/__eone/admin` does not inspect `X-Eone-Id`.

## Testing

`node:test` next to the `lib/eone` helpers (temp dirs, not the repo `storage/` fixtures).

Must cover extract (root paths, zip-slip, size, corrupt/empty) and existing create/delete confinement.

- List: only valid package directories; ignore files and names that fail the id pattern
- Create: zip-root files land at `<root>/<id>/...`
- Create reject: illegal id, existing directory, escape paths — target directory absent afterwards
- Delete: existing dir removed; illegal id and missing id fail; sibling packages remain

Manual check:

1. Guide page link opens the admin panel
2. Upload a zip with `index.html` at the archive root under a new id → list shows it; extension using that id serves the site
3. Upload the same id again → 409, original files unchanged
4. Delete that id → gone from the list; that header shows the missing-package page

## Success criteria

1. Operator can create a package from a zip + typed id without using the filesystem by hand
2. Occupied ids never overwrite
3. Listed packages can be deleted
4. Existing header-based serving still works for packages created this way
5. Automated tests above pass; manual checklist passes
6. Deploy docs state that reverse proxies must allow ≥ 100 MiB bodies
