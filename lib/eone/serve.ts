import fs from "node:fs";
import { contentTypeFor } from "./content-type";
import { fileNotFoundBody, invalidIdHtml, missingPackageHtml } from "./html";
import { isValidEoneId } from "./id";
import { resolvePackageFile } from "./path";

export type ServeResult = {
  status: number;
  body: Buffer | string;
  contentType: string;
  cacheControl: "no-store";
};

const HTML = "text/html; charset=utf-8";
const TEXT = "text/plain; charset=utf-8";
const NO_STORE = "no-store" as const;

function html400(): ServeResult {
  return {
    status: 400,
    body: invalidIdHtml(),
    contentType: HTML,
    cacheControl: NO_STORE,
  };
}

export function servePackage(input: {
  storageRoot: string;
  id: string | null;
  pathname: string;
}): ServeResult {
  const id = input.id?.trim() ?? "";
  if (!id || !isValidEoneId(id)) {
    return html400();
  }

  const resolved = resolvePackageFile({
    storageRoot: input.storageRoot,
    id,
    pathname: input.pathname,
  });

  if (!resolved.ok) {
    if (resolved.reason === "missing-package") {
      return {
        status: 404,
        body: missingPackageHtml(),
        contentType: HTML,
        cacheControl: NO_STORE,
      };
    }
    if (resolved.reason === "not-a-file") {
      return {
        status: 404,
        body: fileNotFoundBody(),
        contentType: TEXT,
        cacheControl: NO_STORE,
      };
    }
    return html400();
  }

  const body = fs.readFileSync(resolved.absolutePath);
  return {
    status: 200,
    body,
    contentType: contentTypeFor(resolved.absolutePath),
    cacheControl: NO_STORE,
  };
}
