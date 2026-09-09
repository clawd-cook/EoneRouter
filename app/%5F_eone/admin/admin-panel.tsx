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

  async function onFinish(values: { id: string }) {
    const trimmed = values.id.trim();
    const selected = inputRef.current?.files?.[0];
    if (!selected) {
      return;
    }

    const formData = new FormData();
    formData.append("id", trimmed);
    formData.append("file", selected);

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
        填写标识并选择 zip 压缩包（根目录即站点根）。标识已被占用时不会覆盖。
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
          label="压缩包"
          name="archive"
          rules={[
            {
              validator: async () => {
                const selected = inputRef.current?.files?.[0];
                if (!selected) {
                  throw new Error("未选择文件");
                }
                if (!selected.name.toLowerCase().endsWith(".zip")) {
                  throw new Error("压缩包不合法");
                }
                if (selected.size > MAX_PACKAGE_BODY_BYTES) {
                  throw new Error("包太大");
                }
              },
            },
          ]}
        >
          <input ref={inputRef} type="file" accept=".zip,application/zip" />
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
