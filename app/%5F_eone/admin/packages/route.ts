import { extractZipFiles } from "@/lib/eone/extract-zip";
import {
  isBodyTooLarge,
  MAX_PACKAGE_BODY_BYTES,
  packageErrorBody,
} from "@/lib/eone/package-http";
import { createPackage, listPackages } from "@/lib/eone/packages";
import { getStorageRoot } from "@/lib/eone/storage-root";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(code: Parameters<typeof packageErrorBody>[0]) {
  const { status, error } = packageErrorBody(code);
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const packages = listPackages(getStorageRoot());
  return NextResponse.json({ packages });
}

function looksLikeZipName(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

export async function POST(request: Request) {
  if (isBodyTooLarge(request.headers.get("content-length"))) {
    console.warn("[eone] upload rejected: content-length too large", {
      contentLength: request.headers.get("content-length"),
    });
    return NextResponse.json({ error: "包太大" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    console.error("[eone] upload formData parse failed", err);
    return jsonError("write-failed");
  }

  const id = String(form.get("id") ?? "");
  const part = form.get("file");
  if (!(part instanceof File)) {
    console.warn("[eone] upload rejected: missing file", { id });
    return jsonError("empty-files");
  }
  if (!looksLikeZipName(part.name)) {
    console.warn("[eone] upload rejected: not a zip name", {
      id,
      name: part.name,
    });
    return jsonError("invalid-zip");
  }

  const zipBytes = new Uint8Array(await part.arrayBuffer());
  console.info("[eone] upload received", {
    id,
    name: part.name,
    compressedBytes: zipBytes.byteLength,
  });
  if (zipBytes.byteLength > MAX_PACKAGE_BODY_BYTES) {
    console.warn("[eone] upload rejected: zip bytes over ceiling", {
      id,
      compressedBytes: zipBytes.byteLength,
    });
    return NextResponse.json({ error: "包太大" }, { status: 413 });
  }

  const extracted = extractZipFiles(zipBytes, MAX_PACKAGE_BODY_BYTES);
  if (!extracted.ok) {
    console.warn("[eone] upload extract failed", {
      id,
      code: extracted.code,
    });
    if (extracted.code === "too-large") {
      return NextResponse.json({ error: "包太大" }, { status: 413 });
    }
    return jsonError(extracted.code);
  }

  console.info("[eone] upload extracted", {
    id,
    fileCount: extracted.files.length,
    uncompressedBytes: extracted.files.reduce(
      (sum, f) => sum + f.bytes.byteLength,
      0,
    ),
  });

  const result = createPackage(getStorageRoot(), id, extracted.files);
  if (!result.ok) {
    console.warn("[eone] upload createPackage failed", {
      id,
      code: result.code,
    });
    return jsonError(result.code);
  }
  console.info("[eone] upload ok", { id: result.id });
  return NextResponse.json({ id: result.id });
}
