import { missingPackageHtml } from "@/lib/eone/html";
import { NextResponse } from "next/server";

export function GET() {
  return new NextResponse(missingPackageHtml(), {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
