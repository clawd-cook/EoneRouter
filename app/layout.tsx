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
