import { unzipSync } from "fflate";
import { resolveUploadRelativePath } from "./package-path";
import type { PackageFile } from "./packages";

export type ExtractZipResult =
  | { ok: true; files: PackageFile[] }
  | {
      ok: false;
      code: "empty-files" | "path-escape" | "too-large" | "invalid-zip";
    };

export function extractZipFiles(
  zipBytes: Uint8Array,
  maxUncompressedBytes: number,
): ExtractZipResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    return { ok: false, code: "invalid-zip" };
  }

  const files: PackageFile[] = [];
  let total = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith("/")) {
      continue;
    }
    const relativePath = resolveUploadRelativePath(name);
    if (relativePath === null) {
      return { ok: false, code: "path-escape" };
    }
    total += bytes.byteLength;
    if (total > maxUncompressedBytes) {
      return { ok: false, code: "too-large" };
    }
    files.push({ relativePath, bytes });
  }

  if (files.length === 0) {
    return { ok: false, code: "empty-files" };
  }
  return { ok: true, files };
}
