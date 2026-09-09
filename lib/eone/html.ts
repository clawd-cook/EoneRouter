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
