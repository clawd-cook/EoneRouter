# Ant Design Operator UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/`, `/__eone/admin`, and the illegal-id / missing-package HTML documents to Ant Design v6’s default light language, without changing serving, proxy, package APIs, or the extension.

**Architecture:** Next.js pages share `AntdRegistry` → `ConfigProvider` (`zh_CN`, default algorithm) → `App` → `AppShell` (header + 960 px content). Admin uses Form / Table / `App.useApp()` for `message` and `modal.confirm`. Error documents stay Route Handler strings from `platformErrorHtml()` so 400/404 and `servePackage()` keep working.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript, antd `^6.6.3`, `@ant-design/nextjs-registry`, Node 24.20.0 `node:test`. No new dependencies. No Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-09-antd-operator-ui-design.md`

## Global Constraints

- Runtime: nvm Node **v24.20.0** only; `which node` must be `$HOME/.nvm/versions/node/v24.20.0/bin/node`. Activate with `nvm use 24.20.0` in the current shell before every command.
- Package manager: **pnpm** only. Do not add Jest, Vitest, Playwright, Tailwind, or new npm packages.
- Do not change `proxy.ts`, `lib/eone/classify.ts`, `lib/eone/serve.ts` (except that it already calls `invalidIdHtml` / `missingPackageHtml` — those functions change in place), package routes, identifier rules, or `extension/`.
- Do not add `page.tsx` next to `app/%5F_eone/invalid/route.ts` or `missing/route.ts`.
- Do not restore Tailwind. Do not hard-code `#FFFFFF` / `#F5F5F5` in TSX; React chrome uses `theme.useToken()`. Static error HTML is the only place that inlines the spec token table.
- `ConfigProvider`: `locale={zhCN}` from `antd/locale/zh_CN`. No `theme.token` overrides. No `darkAlgorithm` / `compactAlgorithm`.
- One primary button per screen. Delete is `type="link" danger`. Error-page extra is an outlined link, not primary.
- Chinese copy stays exactly as in the spec. Folder picker stays native `webkitdirectory` (not antd `Upload`).
- Before writing `app/` files, read `.agents/skills/next-best-practices/SKILL.md` (RSC, `'use client'`), `.agents/skills/vercel-react-best-practices/SKILL.md`, and `.agents/skills/antd/SKILL.md`. Query `antd info` for any component before using a prop not shown in this plan.
- Next is **16.2.9** (below the next-dev-loop 16.3 MCP floor). Do not claim `/_next/mcp` passed. After UI tasks: `pnpm exec tsc --noEmit`, targeted eslint, `antd lint`, `pnpm test`, and `pnpm dev` / curl where noted.
- Every `Run:` below assumes nvm 24.20.0 is already active in that shell.

---

## File structure

| File | Responsibility |
|------|----------------|
| `lib/eone/html.ts` | `platformErrorHtml`, `invalidIdHtml`, `missingPackageHtml`, unchanged `fileNotFoundBody` |
| `lib/eone/html.test.ts` | Chrome + copy assertions; no full-markup snapshots |
| `app/globals.css` | `html, body { margin: 0; min-height: 100%; }` only |
| `app/antd-provider.tsx` | Client `ConfigProvider` + `App` |
| `app/app-shell.tsx` | Client header Menu + content column |
| `app/layout.tsx` | `zh-CN`, registry, provider, shell |
| `app/page.tsx` | Guide Card + Steps + primary 打开管理端 |
| `app/%5F_eone/admin/admin-panel.tsx` | Form, Table, modal, message |
| `app/%5F_eone/admin/page.tsx` | Unchanged data load |

Do not modify error `route.ts` files unless a type import path breaks (they already call the HTML helpers).

---

### Task 1: Token-faithful error HTML

**Files:**
- Modify: `lib/eone/html.ts`
- Modify: `lib/eone/html.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export function platformErrorHtml(input: { title: string; description: string; kind: "error" | "not-found" }): string`
  - `export function invalidIdHtml(): string` (same name; new markup)
  - `export function missingPackageHtml(): string` (same name; new markup)
  - `export function fileNotFoundBody(): string` still returns `"文件不存在"`

- [ ] **Step 1: Write the failing tests**

Keep the existing `register(...)` bootstrap at the top of `lib/eone/html.test.ts`. Extend the dynamic import and add tests (keep the three original substring tests):

```ts
const {
  fileNotFoundBody,
  invalidIdHtml,
  missingPackageHtml,
  platformErrorHtml,
} = await import("./html.ts");

test("invalid html mentions illegal identifier", () => {
  assert.match(invalidIdHtml(), /不合法/);
});

test("missing html mentions 找不到", () => {
  assert.match(missingPackageHtml(), /找不到/);
});

test("file not found is plain language", () => {
  assert.match(fileNotFoundBody(), /文件不存在/);
});

test("error documents share operator chrome", () => {
  for (const html of [invalidIdHtml(), missingPackageHtml()]) {
    assert.match(html, /EoneRouter/);
    assert.match(html, /引导/);
    assert.match(html, /管理/);
    assert.match(html, /去管理端/);
    assert.match(html, /#F5F5F5/);
    assert.match(html, /href="\/__eone\/admin"/);
  }
});

test("invalid html uses error kind, missing uses 404 mark", () => {
  assert.match(invalidIdHtml(), /#FF4D4F/);
  assert.match(missingPackageHtml(), />404</);
  assert.doesNotMatch(fileNotFoundBody(), /去管理端/);
});

test("platformErrorHtml interpolates title and description", () => {
  const html = platformErrorHtml({
    title: "标识不合法",
    description: "请使用 eone- 开头，且只包含字母、数字、连字符和下划线。",
    kind: "error",
  });
  assert.match(html, /标识不合法/);
  assert.match(html, /请使用 eone- 开头/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec node --test --experimental-strip-types lib/eone/html.test.ts`

Expected: FAIL — `platformErrorHtml` is not exported; current HTML lacks `去管理端` / `#F5F5F5` / `404`.

- [ ] **Step 3: Implement `lib/eone/html.ts`**

Replace the file with:

```ts
export function platformErrorHtml(input: {
  title: string;
  description: string;
  kind: "error" | "not-found";
}): string {
  const title = escapeHtml(input.title);
  const description = escapeHtml(input.description);
  const mark =
    input.kind === "not-found"
      ? `<div class="mark-404">404</div>`
      : `<div class="mark-error">!</div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 22px;
    color: #1F1F1F;
    background: #F5F5F5;
  }
  .header {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background: #FFFFFF;
    border-bottom: 1px solid #D9D9D9;
  }
  .brand { font-size: 16px; font-weight: 600; color: #1F1F1F; text-decoration: none; }
  .nav a {
    margin-left: 16px;
    color: #1677FF;
    text-decoration: none;
  }
  .wrap { padding: 24px; }
  .result {
    max-width: 960px;
    margin: 48px auto 0;
    background: #FFFFFF;
    border-radius: 8px;
    padding: 24px;
    text-align: center;
  }
  .mark-error {
    width: 72px;
    height: 72px;
    margin: 0 auto 16px;
    border-radius: 9999px;
    background: #FF4D4F;
    color: #FFFFFF;
    font-size: 32px;
    font-weight: 600;
    line-height: 72px;
  }
  .mark-404 {
    margin: 0 auto 16px;
    color: #595959;
    font-size: 54px;
    font-weight: 600;
    line-height: 64px;
  }
  h1 { margin: 0 0 8px; font-size: 24px; font-weight: 600; line-height: 32px; }
  p { margin: 0 0 24px; color: #595959; }
  .extra {
    display: inline-block;
    height: 32px;
    line-height: 30px;
    padding: 0 15px;
    border: 1px solid #D9D9D9;
    border-radius: 6px;
    background: #FFFFFF;
    color: #1F1F1F;
    text-decoration: none;
  }
</style>
</head>
<body>
  <header class="header">
    <a class="brand" href="/">EoneRouter</a>
    <nav class="nav">
      <a href="/">引导</a>
      <a href="/__eone/admin">管理</a>
    </nav>
  </header>
  <div class="wrap">
    <div class="result">
      ${mark}
      <h1>${title}</h1>
      <p>${description}</p>
      <a class="extra" href="/__eone/admin">去管理端</a>
    </div>
  </div>
</body>
</html>`;
}

export function invalidIdHtml(): string {
  return platformErrorHtml({
    title: "标识不合法",
    description:
      "请使用 eone- 开头，且只包含字母、数字、连字符和下划线。",
    kind: "error",
  });
}

export function missingPackageHtml(): string {
  return platformErrorHtml({
    title: "找不到该标识对应的静态资源",
    description: "请确认 storage/eone-xxxx/ 目录存在。",
    kind: "not-found",
  });
}

export function fileNotFoundBody(): string {
  return "文件不存在";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
```

Do not change `app/%5F_eone/invalid/route.ts` or `missing/route.ts`. Do not change `serve.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec node --test --experimental-strip-types lib/eone/html.test.ts lib/eone/serve.test.ts`

Expected: PASS (serve tests compare body to the helper return values).

- [ ] **Step 5: Commit**

```bash
git add lib/eone/html.ts lib/eone/html.test.ts
git commit -m "$(cat <<'EOF'
Restyle illegal-id and missing-package HTML to the operator chrome.

EOF
)"
```

---

### Task 2: Provider, shell, and root layout

**Files:**
- Create: `app/globals.css`
- Create: `app/antd-provider.tsx`
- Create: `app/app-shell.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: antd `ConfigProvider`, `App`, `Layout`, `Menu`, `theme.useToken`; `zhCN` from `antd/locale/zh_CN`; `AntdRegistry`
- Produces:
  - `export function AntdProvider({ children }: { children: React.ReactNode }): React.ReactElement`
  - `export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement`
  - Menu keys: `"/"` (引导) and `"/__eone/admin"` (管理)
  - Selected key: `pathname === "/__eone/admin" ? "/__eone/admin" : "/"`

- [ ] **Step 1: Create `app/globals.css`**

```css
html,
body {
  margin: 0;
  min-height: 100%;
}
```

No colors in this file.

- [ ] **Step 2: Create `app/antd-provider.tsx`**

```tsx
"use client";

import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AntdProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider locale={zhCN}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
```

Do not pass `theme={{ token: ... }}`. Do not import `theme.defaultAlgorithm` unless TypeScript requires an explicit default (it should not).

- [ ] **Step 3: Create `app/app-shell.tsx`**

```tsx
"use client";

import { Layout, Menu, theme, Typography } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";

const CONTENT_MAX_WIDTH = 960;

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { token } = theme.useToken();
  const selectedKey =
    pathname === "/__eone/admin" ? "/__eone/admin" : "/";

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Layout.Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingInline: token.paddingLG,
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          height: 64,
          lineHeight: "64px",
        }}
      >
        <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
          EoneRouter
        </Typography.Text>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{
            minWidth: 200,
            justifyContent: "flex-end",
            borderBottom: "none",
            background: "transparent",
          }}
          items={[
            {
              key: "/",
              label: <Link href="/">引导</Link>,
            },
            {
              key: "/__eone/admin",
              label: <Link href="/__eone/admin">管理</Link>,
            },
          ]}
        />
      </Layout.Header>
      <Layout.Content
        style={{ padding: token.paddingLG, background: token.colorBgLayout }}
      >
        <div style={{ maxWidth: CONTENT_MAX_WIDTH, margin: "0 auto" }}>
          {children}
        </div>
      </Layout.Content>
    </Layout>
  );
}
```

`background: "transparent"` on Menu is allowed: it is not a brand hex; the header already uses `token.colorBgContainer`.

- [ ] **Step 4: Replace `app/layout.tsx`**

```tsx
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AntdProvider } from "./antd-provider";
import { AppShell } from "./app-shell";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <AntdProvider>
            <AppShell>{children}</AppShell>
          </AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS. If `antd/locale/zh_CN` has no types, stop and fix with `import zhCN from "antd/locale/zh_CN"` plus `esModuleInterop` (already on) — do not add a new dependency.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/antd-provider.tsx app/app-shell.tsx app/layout.tsx
git commit -m "$(cat <<'EOF'
Add Ant Design provider and shared operator header shell.

EOF
)"
```

---

### Task 3: Guide page

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `AppShell` from layout (do not wrap again)
- Produces: Server Component default export using antd `Card`, `Typography.Title` `level={3}`, `Steps` `direction="vertical"` with five `status: "wait"` items, one `Button type="primary" href="/__eone/admin"` 打开管理端

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import { Button, Card, Steps, Typography } from "antd";
import Link from "next/link";

export default function Home() {
  return (
    <Card>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        本地静态资源访问引导
      </Typography.Title>
      <Steps
        direction="vertical"
        items={[
          {
            status: "wait",
            title: "加载插件",
            description: (
              <>
                从 <Typography.Text code>extension/</Typography.Text>{" "}
                加载未打包的 Chrome 插件
              </>
            ),
          },
          {
            status: "wait",
            title: "填写 Origin 和标识",
            description: (
              <>
                填写要劫持的站点 Origin（http，例如{" "}
                <Typography.Text code>http://xxx.jd.com</Typography.Text>
                ）和 <Typography.Text code>eone-xxxx</Typography.Text>
                。本机平台固定为{" "}
                <Typography.Text code>http://localhost:3001</Typography.Text>
              </>
            ),
          },
          {
            status: "wait",
            title: "放入静态文件",
            description: (
              <>
                把静态文件放到{" "}
                <Typography.Text code>storage/eone-xxxx/</Typography.Text>
                ，或打开{" "}
                <Link href="/__eone/admin">管理端</Link> 上传文件夹
              </>
            ),
          },
          {
            status: "wait",
            title: "打开当前地址",
            description: "打开当前这个地址",
          },
          {
            status: "wait",
            title: "保持进程",
            description:
              "劫持真实站点时请先保持本页对应的本地进程在跑；清空插件标识后浏览器会重新访问真实站点",
          },
        ]}
      />
      <Button type="primary" href="/__eone/admin">
        打开管理端
      </Button>
    </Card>
  );
}
```

Do not add a second `type="primary"` button. Keep the in-step 管理端 `Link`.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Rebuild the guide page with Ant Design Steps and a single primary action.

EOF
)"
```

---

### Task 4: Admin Form, Table, and feedback

**Files:**
- Modify: `app/%5F_eone/admin/admin-panel.tsx`
- Leave: `app/%5F_eone/admin/page.tsx` (still `listPackages` → `<AdminPanel packages={packages} />`)

**Interfaces:**
- Consumes: `isValidEoneId`, `MAX_PACKAGE_BODY_BYTES`, `App.useApp()` (`message`, `modal`), `useRouter`
- Produces: `export function AdminPanel({ packages }: { packages: string[] })` — same prop type as today
- POST `/__eone/admin/packages` still sends `id`, repeated `file`, repeated `path` (`webkitRelativePath` with folder prefix)
- DELETE `/__eone/admin/packages/${encodeURIComponent(packageId)}`
- Field errors: 标识不合法 / 未选择文件 / 包太大
- Messages: `已创建 ${id}` / `已删除 ${id}` / body `error` / 写入失败
- Confirm title: `确定删除 ${packageId}？`

- [ ] **Step 1: Query APIs actually used**

Run:

```bash
antd info Form --version 6.6.3 --format json
antd info Input --version 6.6.3 --format json
antd info Table --version 6.6.3 --format json
antd info Modal --version 6.6.3 --format json
```

Confirm `Form.useForm`, `Form.Item` `rules` / `label`, `Table` `dataSource` / `columns` / `locale` / `pagination` / `rowKey`, `Button` `type` `danger` `href` `loading` `htmlType`. Use `App.useApp().modal.confirm` (hook), not static `Modal.confirm`.

- [ ] **Step 2: Replace `app/%5F_eone/admin/admin-panel.tsx`**

```tsx
"use client";

import { isValidEoneId } from "@/lib/eone/id";
import { MAX_PACKAGE_BODY_BYTES } from "@/lib/eone/package-http";
import { App, Button, Card, Form, Input, Table, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function AdminPanel({ packages }: { packages: string[] }) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<{ id: string }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  function bindDirectoryInput(node: HTMLInputElement | null) {
    if (!node) {
      return;
    }
    node.setAttribute("webkitdirectory", "");
    node.setAttribute("directory", "");
    inputRef.current = node;
  }

  async function onFinish(values: { id: string }) {
    const trimmed = values.id.trim();
    const selected = inputRef.current?.files;
    if (!selected || selected.length === 0) {
      return;
    }

    const formData = new FormData();
    formData.append("id", trimmed);
    for (const file of selected) {
      formData.append("file", file);
      formData.append("path", file.webkitRelativePath);
    }

    setPending(true);
    try {
      const response = await fetch("/__eone/admin/packages", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        message.error(body.error ?? "写入失败");
        return;
      }
      form.resetFields();
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      message.success(`已创建 ${body.id}`);
      router.refresh();
    } catch {
      message.error("写入失败");
    } finally {
      setPending(false);
    }
  }

  async function deletePackage(packageId: string) {
    setPending(true);
    try {
      const response = await fetch(
        `/__eone/admin/packages/${encodeURIComponent(packageId)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        message.error(body.error ?? "写入失败");
        return;
      }
      message.success(`已删除 ${packageId}`);
      router.refresh();
    } catch {
      message.error("写入失败");
    } finally {
      setPending(false);
    }
  }

  function onDelete(packageId: string) {
    modal.confirm({
      title: `确定删除 ${packageId}？`,
      okText: "确定",
      cancelText: "取消",
      onOk: () => deletePackage(packageId),
    });
  }

  return (
    <Card>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        管理静态包
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        填写标识并选择本地文件夹。标识已被占用时不会覆盖。
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        disabled={pending}
      >
        <Form.Item
          label="标识"
          name="id"
          rules={[
            {
              validator: async (_, value: string | undefined) => {
                if (!isValidEoneId((value ?? "").trim())) {
                  throw new Error("标识不合法");
                }
              },
            },
          ]}
        >
          <Input placeholder="eone-xxxx" autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="文件夹"
          name="folder"
          rules={[
            {
              validator: async () => {
                const selected = inputRef.current?.files;
                if (!selected || selected.length === 0) {
                  throw new Error("未选择文件");
                }
                let totalBytes = 0;
                for (const file of selected) {
                  totalBytes += file.size;
                }
                if (totalBytes > MAX_PACKAGE_BODY_BYTES) {
                  throw new Error("包太大");
                }
              },
            },
          ]}
        >
          <input ref={bindDirectoryInput} type="file" multiple />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={pending}>
            上传
          </Button>
        </Form.Item>
      </Form>
      <Typography.Title level={4}>已有标识</Typography.Title>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={packages.map((id) => ({ id }))}
        locale={{ emptyText: "暂无静态包" }}
        columns={[
          { title: "标识", dataIndex: "id" },
          {
            title: "操作",
            key: "actions",
            render: (_: unknown, row: { id: string }) => (
              <Button
                type="link"
                danger
                disabled={pending}
                onClick={() => {
                  onDelete(row.id);
                }}
              >
                删除
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}
```

Do not keep `window.confirm`. Do not keep a result `<p>` under the form. Do not use antd `Upload`. Do not stack a second primary button.

- [ ] **Step 3: Typecheck and lint**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint app next.config.ts
antd lint app/layout.tsx app/antd-provider.tsx app/app-shell.tsx app/page.tsx app/%5F_eone/admin/admin-panel.tsx --format json
```

Expected: `tsc` PASS; eslint PASS on `app` (ignore `.agents/skills` failures); `antd lint` has no deprecated usage on those files.

If `Form.Item` `name="folder"` on a native file input warns, keep the validator on that item (it reads the ref). Do not switch to `Upload`.

- [ ] **Step 4: Commit**

```bash
git add app/%5F_eone/admin/admin-panel.tsx
git commit -m "$(cat <<'EOF'
Rebuild the admin panel with Form, Table, and App feedback.

EOF
)"
```

---

### Task 5: Automated verification

**Files:** none expected (fix only if a command fails)

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: passing `pnpm test`, `tsc`, app eslint

- [ ] **Step 1: Unit tests**

Run: `pnpm test`

Expected: PASS, including `html.test.ts` and `serve.test.ts`.

- [ ] **Step 2: Typecheck and eslint**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint app next.config.ts
```

Expected: PASS.

- [ ] **Step 3: curl error documents (dev server if already running on :3000; otherwise start `pnpm dev` in another terminal first)**

```bash
curl -s -o /tmp/eone-invalid.html -w "%{http_code}" http://localhost:3000/__eone/invalid
echo
curl -s -o /tmp/eone-missing.html -w "%{http_code}" http://localhost:3000/__eone/missing
echo
grep -E "不合法|去管理端|EoneRouter" /tmp/eone-invalid.html
grep -E "找不到|去管理端|EoneRouter" /tmp/eone-missing.html
```

Expected: invalid **400**, missing **404**, both bodies contain chrome + the spec copy.

- [ ] **Step 4: Manual checklist (do not skip)**

With `pnpm dev`:

1. `http://localhost:3000/` — layout gray background, white card, five wait Steps, header 引导 selected, one primary 打开管理端
2. `/__eone/admin` — 管理 selected; empty/illegal id and empty folder show Form.Item errors and do not POST; upload a new id; occupied id shows `message` 标识已被占用; delete cancel vs OK
3. Request with illegal `X-Eone-Id` still 400 with 不合法
4. Valid id whose directory is missing still 404 with 找不到
5. An uploaded package still serves through the extension / `X-Eone-Id`

Do not claim next-dev-loop MCP passed (Next 16.2.9).

- [ ] **Step 5: Commit only if Step 3–4 forced a fix; otherwise stop**

If you had to patch files, commit that fix with a message that says why (for example `Fix admin file-input Form.Item typing`). Do not create an empty commit.

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|------------------|------|
| `platformErrorHtml` + token table + 400/404 helpers | 1 |
| `fileNotFoundBody` unchanged | 1 |
| `ConfigProvider` zh_CN, default tokens, `App` | 2 |
| `AppShell` header Menu, 960 px column, no sider | 2 |
| `html lang="zh-CN"` + margin reset | 2 |
| Guide Steps + one primary | 3 |
| Admin Form/Table/`modal.confirm`/`message` | 4 |
| Native directory input, same POST/DELETE | 4 |
| No proxy/extension/package API changes | constraints |
| `pnpm test` / tsc / eslint / `antd lint` / manual | 4–5 |

**Placeholders:** none. **Types:** `platformErrorHtml` kind `"error" \| "not-found"`; `AdminPanel` still `{ packages: string[] }`; Menu keys `"/"` and `"/__eone/admin"`.
