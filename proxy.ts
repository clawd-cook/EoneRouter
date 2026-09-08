import { classifyRequest } from "@/lib/eone/classify";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const header = request.headers.get("x-eone-id");
  const result = classifyRequest(request.nextUrl.pathname, header);

  if (result.action === "skip" || result.action === "pass") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = result.target;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
