import fs from "node:fs";
import path from "node:path";
import { isValidEoneId } from "./id";

export type ResolveResult =
  | { ok: true; absolutePath: string }
  | {
      ok: false;
      reason: "invalid-id" | "escape" | "missing-package" | "not-a-file";
    };

function relativeFromPathname(pathname: string): string | null {
  const raw = pathname.split("?")[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded === "/" || decoded === "") {
    return "index.html";
  }
  const trimmed = decoded.replace(/^\/+/, "");
  const segments = trimmed.split(/[/\\]/);
  if (
    trimmed === "" ||
    path.isAbsolute(trimmed) ||
    segments.some((s) => s === "" || s === "." || s === "..")
  ) {
    return null;
  }
  return trimmed;
}

function isInside(parent: string, child: string): boolean {
  const prefix = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child === parent || child.startsWith(prefix);
}

export function resolvePackageFile(input: {
  storageRoot: string;
  id: string;
  pathname: string;
}): ResolveResult {
  if (!isValidEoneId(input.id)) {
    return { ok: false, reason: "invalid-id" };
  }

  const relative = relativeFromPathname(input.pathname);
  if (relative === null) {
    return { ok: false, reason: "escape" };
  }

  const packageDir = path.join(input.storageRoot, input.id);
  let realPackage: string;
  try {
    const st = fs.lstatSync(packageDir);
    if (!st.isDirectory()) {
      return { ok: false, reason: "missing-package" };
    }
    realPackage = fs.realpathSync(packageDir);
  } catch {
    return { ok: false, reason: "missing-package" };
  }

  const candidate = path.join(packageDir, relative);
  let realFile: string;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    return { ok: false, reason: "not-a-file" };
  }

  if (!isInside(realPackage, realFile)) {
    return { ok: false, reason: "escape" };
  }

  try {
    const st = fs.statSync(realFile);
    if (!st.isFile()) {
      return { ok: false, reason: "not-a-file" };
    }
  } catch {
    return { ok: false, reason: "not-a-file" };
  }

  return { ok: true, absolutePath: realFile };
}
