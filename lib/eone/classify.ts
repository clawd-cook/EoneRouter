import { isValidEoneId } from "./id";

export type ClassifyResult =
  | { action: "skip" }
  | { action: "pass" }
  | { action: "rewrite"; target: string };

function isSkippedPath(pathname: string): boolean {
  return (
    pathname === "/_next" ||
    pathname.startsWith("/_next/") ||
    pathname === "/__eone" ||
    pathname.startsWith("/__eone/")
  );
}

export function classifyRequest(
  pathname: string,
  header: string | null,
): ClassifyResult {
  if (isSkippedPath(pathname)) {
    return { action: "skip" };
  }

  const id = header?.trim() ?? "";
  if (!id) {
    return { action: "pass" };
  }

  if (!isValidEoneId(id)) {
    return { action: "rewrite", target: "/__eone/invalid" };
  }

  const suffix = pathname === "/" ? "/" : pathname;
  return { action: "rewrite", target: `/__eone/files${suffix}` };
}
