import { isBodyTooLarge, packageErrorBody } from "@/lib/eone/package-http";
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
  const fileParts = form.getAll("file");
  const pathParts = form.getAll("path");
  if (fileParts.length === 0 || fileParts.length !== pathParts.length) {
    return jsonError("empty-files");
  }

  const files = [];
  for (let i = 0; i < fileParts.length; i++) {
    const part = fileParts[i];
    const rel = pathParts[i];
    if (!(part instanceof File) || typeof rel !== "string") {
      return jsonError("empty-files");
    }
    files.push({
      relativePath: rel,
      bytes: new Uint8Array(await part.arrayBuffer()),
    });
  }

  const result = createPackage(getStorageRoot(), id, files);
  if (!result.ok) {
    return jsonError(result.code);
  }
  return NextResponse.json({ id: result.id });
}
