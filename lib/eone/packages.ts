import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isValidEoneId } from "./id";
import { resolveUploadRelativePath } from "./package-path";

export function listPackages(storageRoot: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(storageRoot);
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const name of names) {
    if (!isValidEoneId(name)) {
      continue;
    }
    let st: fs.Stats;
    try {
      st = fs.lstatSync(path.join(storageRoot, name));
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      ids.push(name);
    }
  }
  return ids.toSorted();
}

export type PackageFile = { relativePath: string; bytes: Uint8Array };

export type CreatePackageResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code:
        | "invalid-id"
        | "empty-files"
        | "path-escape"
        | "package-exists"
        | "write-failed";
    };

function isInside(parent: string, child: string): boolean {
  const prefix = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child === parent || child.startsWith(prefix);
}

function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function createPackage(
  storageRoot: string,
  id: string,
  files: PackageFile[],
): CreatePackageResult {
  if (!isValidEoneId(id)) {
    return { ok: false, code: "invalid-id" };
  }
  if (files.length === 0) {
    return { ok: false, code: "empty-files" };
  }

  const resolved: { relative: string; bytes: Uint8Array }[] = [];
  for (const file of files) {
    const relative = resolveUploadRelativePath(file.relativePath);
    if (relative === null) {
      return { ok: false, code: "path-escape" };
    }
    resolved.push({ relative, bytes: file.bytes });
  }

  fs.mkdirSync(storageRoot, { recursive: true });
  const dest = path.join(storageRoot, id);
  if (fs.existsSync(dest)) {
    return { ok: false, code: "package-exists" };
  }

  const tmpDir = path.join(storageRoot, `.tmp-${randomUUID()}`);
  let renaming = false;
  try {
    fs.mkdirSync(tmpDir);
    const realTmp = fs.realpathSync(tmpDir);
    for (const file of resolved) {
      const target = path.resolve(realTmp, file.relative);
      if (!isInside(realTmp, target)) {
        removeDir(tmpDir);
        return { ok: false, code: "path-escape" };
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.bytes);
    }
    renaming = true;
    fs.renameSync(tmpDir, dest);
    return { ok: true, id };
  } catch {
    removeDir(tmpDir);
    if (renaming && fs.existsSync(dest)) {
      return { ok: false, code: "package-exists" };
    }
    return { ok: false, code: "write-failed" };
  }
}
