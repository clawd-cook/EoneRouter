# Ant Design operator UI

Restyle the local operator surfaces with Ant Design v6’s default visual language. Functionality stays as specified in [EoneRouter v1](./2026-09-08-eone-router-design.md) and the [admin panel](./2026-09-09-admin-panel-design.md).

Date: 2026-09-09

## Goal

An operator using `/`, `/__eone/admin`, the illegal-id page, and the missing-package page should see one Ant Design console: light theme, shared top bar, certain states (validation, loading, confirm, success/error). Chinese copy and all serving / upload / delete contracts stay the same.

## Non-goals

- Chrome extension popup or other extension UI
- Dark theme, `compactAlgorithm`, or a custom `colorPrimary`
- Changing `proxy.ts`, classify rules, package APIs, identifier rules, or storage layout
- Authentication
- Overwrite / zip upload / rename
- Styling the plain-text missing-file body (`文件不存在`)
- Running Ant Design’s React runtime inside `servePackage()` or error route handlers
- New test runners (Playwright, Jest, Vitest)

## Why error pages are not React

Illegal `X-Eone-Id` is rewritten to `/__eone/invalid`. A missing package is rewritten to `/__eone/files/...`; `proxy.ts` must not read disk, so `servePackage()` returns the 404 HTML itself. Those documents must remain Route Handler / `html.ts` strings with HTTP 400 and 404. They follow the same visual language via static HTML, not `<Result />`.

## Visual language

Source of truth: Ant Design v6 default light theme (`design.md`, antd `^6.6.3` already in the app).

- Values: Natural, Certain, Meaningful, Growing
- One primary action per screen
- Surfaces: layout background → container card → elevated overlay (shadow, not a third fill)
- Spacing on the 4 px scale (content inset 24 px)
- Control height 32 px, control radius 6 px, card radius 8 px
- Type: 14 px body, weights 400 and 600 only
- Selected nav: `#E6F4FF` background and primary text — the only “you are here” cue
- React code consumes tokens (`theme.useToken()` or component defaults). Do not hard-code `#FFFFFF` / `#F5F5F5` in TSX
- Static error HTML is the exception: it inlines the token *roles* below because it cannot import cssinjs

| Role | Value in static HTML |
|------|----------------------|
| `colorBgLayout` | `#F5F5F5` |
| `colorBgContainer` | `#FFFFFF` |
| `colorText` | `#1F1F1F` |
| `colorTextSecondary` | `#595959` |
| `colorBorder` | `#D9D9D9` |
| `colorPrimary` | `#1677FF` |
| `colorError` | `#FF4D4F` |
| Menu selected background | `#E6F4FF` |
| Card padding / content gutter | `24px` |
| Control radius / card radius | `6px` / `8px` |

No preset palette colors on chrome. No second primary button on the same surface.

## Architecture

```
Root layout (RSC)
  AntdRegistry
    AntdProvider (client): ConfigProvider zh_CN + default algorithm + App
      AppShell (client): Layout header + Content
        page children
```

- `html lang="zh-CN"`
- `ConfigProvider`: `locale={zhCN}`, no `theme.token` overrides, `defaultAlgorithm` only
- `App` wraps the tree so `message` and `Modal.confirm` inherit the theme (do not call static `message`/`Modal` APIs outside `App`)
- `AppShell` is used for Next.js pages only (`/` and `/__eone/admin`). Error route handlers return a full HTML document and do not mount this tree
- Header: light `colorBgContainer`, title `EoneRouter` on the left, horizontal `Menu` on the right with two items: 引导 → `/`, 管理 → `/__eone/admin`. Selected key from `usePathname()` (exact `/` vs `/__eone/admin`)
- No sider
- `Content`: layout background, 24 px padding, inner column max-width 960 px
- Tiny global reset only: `html, body { margin: 0; min-height: 100%; }`. No brand colors in that file

## Screens

### Guide (`app/page.tsx`) — Server Component

Card on the content column.

- `Typography.Title` level 3: 本地静态资源访问引导
- Vertical `Steps`, `direction="vertical"`. All five items `status="wait"` (this is a checklist, not a live wizard; the header already marks “you are here”)
- Step copy stays the current five items, including the in-step link 管理端 → `/__eone/admin` and `http://localhost:3001`
- Single primary action: Button `type="primary"` 打开管理端 linking to `/__eone/admin` (via `href` or `next/link`)

### Admin (`admin-panel.tsx`) — Client Component

Same shell. One Card.

**Form** (`layout="vertical"`):

| Field | Control | Client rules (same strings as today) |
|-------|---------|--------------------------------------|
| 标识 | `Input`, placeholder `eone-xxxx` | Must pass `isValidEoneId` → 标识不合法 |
| 文件夹 | Native `input type="file"` with `webkitdirectory` / `directory` (not antd `Upload`) | Empty → 未选择文件; total size > 100 MiB → 包太大 |
| Submit | Button `type="primary"` 上传 | `loading` + both upload and delete disabled while `pending` |

POST `/__eone/admin/packages` is unchanged (`id`, repeated `file` and `path`). On success: `message.success` `已创建 ${id}`, reset id and file input, `router.refresh()`. On failure: `message.error` with JSON `error` or 写入失败.

**Table** below the form:

- Columns: 标识, 操作
- Delete: `Button type="link" danger` 删除 — not primary
- Confirm with `Modal.confirm`: 确定删除 ${id}？ Cancel sends nothing. OK → DELETE `/__eone/admin/packages/<id>`
- Success: `message.success` `已删除 ${id}` then `router.refresh()`. Failure: same error `message` as upload
- Empty: `locale.emptyText` 暂无静态包
- No zebra rows (antd default hover only)

Do not keep the old gray paragraph under the form for results.

### Illegal id (400)

`GET /__eone/invalid` stays a Route Handler. Body from `invalidIdHtml()`. Title 标识不合法. Description unchanged: 请使用 eone- 开头，且只包含字母、数字、连字符和下划线。 Visual status: error. Extra: default (outlined) button 去管理端 → `/__eone/admin`.

Also returned by `servePackage()` when the id is missing or illegal.

### Missing package (404)

`GET /__eone/missing` stays a Route Handler. Body from `missingPackageHtml()`. Title 找不到该标识对应的静态资源. Description unchanged: 请确认 storage/eone-xxxx/ 目录存在。 Visual status: 404-style. Same extra button.

Also returned by `servePackage()` when the package directory does not exist.

Missing *file* inside an existing package stays `fileNotFoundBody()`: plain text 文件不存在, status 404.

## Static error document

`lib/eone/html.ts` exports a shared builder used by both HTML helpers:

```ts
platformErrorHtml(input: {
  title: string;
  description: string;
  kind: "error" | "not-found";
}): string
```

`invalidIdHtml()` and `missingPackageHtml()` call it with the copy above. The document includes:

1. `lang="zh-CN"`, `Cache-Control` still set by the route / `servePackage`, not inside the string
2. Header bar matching AppShell: EoneRouter, links 引导 and 管理 (plain `<a>`, no JS selected state required)
3. Centered result block: kind icon or large status mark, title, description, outlined 去管理端
4. Inline CSS using the token table only

Tests must not snapshot the full markup. `html.test.ts` keeps `/不合法/` and `/找不到/`. `serve.test.ts` keeps `assert.equal(result.body, invalidIdHtml())` (and missing equivalent) so the helper remains the single source.

## Components (files)

| Unit | Location | Responsibility |
|------|----------|----------------|
| Root layout | `app/layout.tsx` | lang, registry, provider, shell, import reset CSS |
| Antd provider | `app/antd-provider.tsx` (client) | `ConfigProvider` + `App` |
| App shell | `app/app-shell.tsx` (client) | Header + Menu + Content column |
| Global reset | `app/globals.css` | margin 0, min-height 100% |
| Guide | `app/page.tsx` | Steps + primary link |
| Admin page | `app/%5F_eone/admin/page.tsx` | `listPackages` → `AdminPanel` (unchanged data) |
| Admin UI | `app/%5F_eone/admin/admin-panel.tsx` | Form, Table, Modal, message |
| Error HTML | `lib/eone/html.ts` | `platformErrorHtml`, existing helpers |
| Error routes | `app/%5F_eone/invalid/route.ts`, `missing/route.ts` | Status + HTML body; no `page.tsx` in those segments |

Do not add dependencies. antd and `@ant-design/nextjs-registry` are already present. Do not restore Tailwind.

## Data flow

Unchanged:

1. No `X-Eone-Id` → `/` guide
2. Illegal header → rewrite `/__eone/invalid` → 400 HTML
3. Valid header → rewrite `/__eone/files...` → files or missing-package / missing-file bodies
4. Admin list/create/delete as in the admin panel spec

UI-only changes: how `/` and `/__eone/admin` render; how the two HTML helpers look.

## Error handling (UI)

| Case | Where | What the operator sees |
|------|--------|------------------------|
| Bad id / no files / too large | Form.Item | Field message; no request |
| Create/delete HTTP error | `message.error` | Server `error` or 写入失败 |
| Network throw | `message.error` | 写入失败 |
| Delete cancel | Modal | No request |
| Occupied id (409) | `message.error` | 标识已被占用 |
| Illegal id document | 400 HTML | Result-like error |
| Missing package document | 404 HTML | Result-like 404 |
| Missing file | 404 text | 文件不存在 |

## Testing

Automated (`pnpm test`): existing `lib/eone` and extension tests. Update HTML assertions only if the required substrings move; prefer keeping them. No new browser automation.

After implementation: `pnpm exec tsc --noEmit`; eslint on `app` (not `.agents/skills`); `antd lint` on changed tsx (`--format json`).

Manual:

1. `/` — layout background, card, five steps, one primary 打开管理端, header 引导 selected
2. `/__eone/admin` — header 管理 selected; validate empty/illegal id and empty folder; upload new id; occupied id 409; delete confirm cancel vs OK
3. Illegal `X-Eone-Id` → 400 page with same header chrome and 不合法 copy
4. Valid id whose directory is missing → 404 page with 找不到 copy
5. Extension and file serving still work for an uploaded package

## Success criteria

1. Guide and admin look and behave as Ant Design v6 default light consoles, with one shared header
2. Error documents match that chrome and keep 400/404 plus existing Chinese titles/descriptions
3. Admin validation, confirm, and `message` feedback replace the old paragraph + `window.confirm`
4. No change to proxy, package APIs, identifier rules, or the extension
5. Automated tests above pass; manual checklist passes
