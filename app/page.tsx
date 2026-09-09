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
