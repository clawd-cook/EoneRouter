import { packageErrorBody } from "@/lib/eone/package-http";
import { deletePackage } from "@/lib/eone/packages";
import { getStorageRoot } from "@/lib/eone/storage-root";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = deletePackage(getStorageRoot(), id);
  if (!result.ok) {
    const { status, error } = packageErrorBody(result.code);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ id: result.id });
}
