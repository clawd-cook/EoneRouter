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
    return NextResponse.json({ error: "包太大" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("write-failed");
  }

  const id = String(form.get("id") ?? "");
  const part = form.get("file");
  if (!(part instanceof File)) {
    return jsonError("empty-files");
  }
  if (!looksLikeZipName(part.name)) {
    return jsonError("invalid-zip");
  }

  const zipBytes = new Uint8Array(await part.arrayBuffer());
  if (zipBytes.byteLength > MAX_PACKAGE_BODY_BYTES) {
    return NextResponse.json({ error: "包太大" }, { status: 413 });
  }

  const extracted = extractZipFiles(zipBytes, MAX_PACKAGE_BODY_BYTES);
  if (!extracted.ok) {
    if (extracted.code === "too-large") {
      return NextResponse.json({ error: "包太大" }, { status: 413 });
    }
    return jsonError(extracted.code);
  }

  const result = createPackage(getStorageRoot(), id, extracted.files);
  if (!result.ok) {
    return jsonError(result.code);
  }
  return NextResponse.json({ id: result.id });
}
