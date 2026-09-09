"use client";

import { isValidEoneId } from "@/lib/eone/id";
import { MAX_PACKAGE_BODY_BYTES } from "@/lib/eone/package-http";
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

    let totalBytes = 0;
    for (const file of selected) {
      totalBytes += file.size;
    }
    if (totalBytes > MAX_PACKAGE_BODY_BYTES) {
      setMessage("包太大");
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
