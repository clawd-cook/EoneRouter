export const MAX_PACKAGE_BODY_BYTES = 100 * 1024 * 1024;

export type PackageErrorCode =
  | "invalid-id"
  | "empty-files"
  | "path-escape"
  | "invalid-zip"
  | "package-exists"
  | "not-found"
  | "write-failed";

const ERRORS: Record<PackageErrorCode, { status: number; error: string }> = {
  "invalid-id": { status: 400, error: "标识不合法" },
  "empty-files": { status: 400, error: "未选择文件" },
  "path-escape": { status: 400, error: "相对路径不合法" },
  "invalid-zip": { status: 400, error: "压缩包不合法" },
  "package-exists": { status: 409, error: "标识已被占用" },
  "not-found": { status: 404, error: "找不到该标识" },
  "write-failed": { status: 500, error: "写入失败" },
};

export function packageErrorBody(code: PackageErrorCode): {
  status: number;
  error: string;
} {
  return ERRORS[code];
}

export function isBodyTooLarge(contentLengthHeader: string | null): boolean {
  if (contentLengthHeader === null || contentLengthHeader === "") {
    return false;
  }
  const n = Number(contentLengthHeader);
  return Number.isFinite(n) && n > MAX_PACKAGE_BODY_BYTES;
}
