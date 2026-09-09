export function resolveUploadRelativePath(raw: string): string | null {
  if (raw === "" || raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw)) {
    return null;
  }

  const normalized = raw.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("//")) {
    return null;
  }

  const segments = normalized.split("/");
  if (segments.length < 1 || segments.some((s) => s === "" || s === "." || s === "..")) {
    return null;
  }

  return segments.join("/");
}
