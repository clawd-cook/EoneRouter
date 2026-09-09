import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16 sm:px-10">
      <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-zinc-950 sm:p-12">
        <p className="mb-3 font-mono text-sm font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
          EoneRouter
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          本地静态资源访问引导
        </h1>
        <ol className="mt-8 list-decimal space-y-5 pl-6 text-lg leading-8 text-zinc-700 dark:text-zinc-300">
          <li>
            从 <code className="font-mono">extension/</code>{" "}
            加载未打包的 Chrome 插件
          </li>
          <li>
            填写要劫持的站点 Origin（http，例如{" "}
            <code className="font-mono">http://xxx.jd.com</code>
            ）和 <code className="font-mono">eone-xxxx</code>
            。本机平台固定为{" "}
            <code className="font-mono">http://localhost:3001</code>
          </li>
          <li>
            把静态文件放到{" "}
            <code className="font-mono">storage/eone-xxxx/</code>
            ，或打开{" "}
            <Link className="underline" href="/__eone/admin">
              管理端
            </Link>{" "}
            上传文件夹
          </li>
          <li>打开当前这个地址</li>
          <li>
            劫持真实站点时请先保持本页对应的本地进程在跑；清空插件标识后浏览器会重新访问真实站点
          </li>
        </ol>
      </div>
    </main>
  );
}
