import { servePackage } from "@/lib/eone/serve";
import { getStorageRoot } from "@/lib/eone/storage-root";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const pathname =
    !path || path.length === 0 ? "/" : `/${path.join("/")}`;
  const result = servePackage({
    storageRoot: getStorageRoot(),
    id: request.headers.get("x-eone-id"),
    pathname,
  });
  const body =
    typeof result.body === "string"
      ? result.body
      : new Uint8Array(result.body);
  return new NextResponse(body, {
    status: result.status,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": result.cacheControl,
    },
  });
}
