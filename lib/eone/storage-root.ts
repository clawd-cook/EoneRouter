import path from "node:path";

export function getStorageRoot(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.EONE_STORAGE_ROOT ?? path.join(cwd, "storage");
}
