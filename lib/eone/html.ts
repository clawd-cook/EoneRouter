export function invalidIdHtml(): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>标识不合法</title></head><body><h1>标识不合法</h1><p>请使用 eone- 开头，且只包含字母、数字、连字符和下划线。</p></body></html>`;
}

export function missingPackageHtml(): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>找不到资源</title></head><body><h1>找不到该标识对应的静态资源</h1><p>请确认 storage/eone-xxxx/ 目录存在。</p></body></html>`;
}

export function fileNotFoundBody(): string {
  return "文件不存在";
}
