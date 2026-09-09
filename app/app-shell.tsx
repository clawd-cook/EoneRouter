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
