import { invalidIdHtml } from "@/lib/eone/html";
import { NextResponse } from "next/server";

export function GET() {
  return new NextResponse(invalidIdHtml(), {
    status: 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
