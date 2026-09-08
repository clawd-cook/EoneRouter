const TEXTUAL = new Set([
  "html",
  "js",
  "mjs",
  "css",
  "json",
  "svg",
  "txt",
  "map",
]);

const TYPES: Record<string, string> = {
  html: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  txt: "text/plain",
  map: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  wasm: "application/wasm",
};

export function contentTypeFor(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const ext = (dot >= 0 ? base.slice(dot + 1) : "").toLowerCase();
  const type = TYPES[ext] ?? "application/octet-stream";
  if (type !== "application/octet-stream" && TEXTUAL.has(ext)) {
    return `${type}; charset=utf-8`;
  }
  return type;
}
