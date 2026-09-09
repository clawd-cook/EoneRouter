"use client";

import { Button, Card, Steps, Typography } from "antd";
import Link from "next/link";

export default function Home() {
  return (
    <Card>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        本地静态资源访问引导
      </Typography.Title>
      <Steps
        orientation="vertical"
        items={[
          {
            status: "wait",
            title: "加载插件",
            content: (
              <>
                从 <Typography.Text code>extension/</Typography.Text>{" "}
                加载未打包的 Chrome 插件
              </>
            ),
          },
          {
            status: "wait",
            title: "填写 Origin 和标识",
            content: (
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
            content: (
              <>
                把静态文件放到{" "}
                <Typography.Text code>storage/eone-xxxx/</Typography.Text>
                ，或打开{" "}
                <Link href="/__eone/admin">管理端</Link> 上传 zip 压缩包
              </>
            ),
          },
          {
            status: "wait",
            title: "打开当前地址",
            content: "打开当前这个地址",
          },
        ]}
      />
      <Button type="primary" href="/__eone/admin">
        打开管理端
      </Button>
    </Card>
  );
}
