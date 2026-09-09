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

  const dest = path.join(storageRoot, id);
  const tmpDir = path.join(storageRoot, `.tmp-${randomUUID()}`);
  let tmpCreated = false;
  let destClaimed = false;
  let publishing = false;
  try {
    fs.mkdirSync(storageRoot, { recursive: true });
    if (fs.existsSync(dest)) {
      return { ok: false, code: "package-exists" };
    }

    fs.mkdirSync(tmpDir);
    tmpCreated = true;
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
    publishing = true;
    fs.mkdirSync(dest);
    destClaimed = true;
    fs.renameSync(tmpDir, dest);
    return { ok: true, id };
  } catch (err) {
    if (tmpCreated) {
      removeDir(tmpDir);
    }
    if (destClaimed) {
      try {
        fs.rmdirSync(dest);
      } catch {
        // Preserve a destination that another writer populated.
      }
    }
    if (publishing && (err as NodeJS.ErrnoException).code === "EEXIST") {
      return { ok: false, code: "package-exists" };
    }
    return { ok: false, code: "write-failed" };
  }
}

export type DeletePackageResult =
  | { ok: true; id: string }
  | { ok: false; code: "invalid-id" | "not-found" | "write-failed" };

export function deletePackage(
  storageRoot: string,
  id: string,
): DeletePackageResult {
  if (!isValidEoneId(id)) {
    return { ok: false, code: "invalid-id" };
  }

  const packageDir = path.join(storageRoot, id);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(packageDir);
  } catch {
    return { ok: false, code: "not-found" };
  }
  if (!st.isDirectory()) {
    return { ok: false, code: "not-found" };
  }

  let realRoot: string;
  let realPackage: string;
  try {
    realRoot = fs.realpathSync(storageRoot);
    realPackage = fs.realpathSync(packageDir);
  } catch {
    return { ok: false, code: "not-found" };
  }
  if (realPackage === realRoot || !isInside(realRoot, realPackage)) {
    return { ok: false, code: "write-failed" };
  }

  try {
    fs.rmSync(packageDir, { recursive: true, force: false });
    return { ok: true, id };
  } catch {
    return { ok: false, code: "write-failed" };
  }
}
