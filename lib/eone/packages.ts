import fs from "node:fs";
import path from "node:path";
import { isValidEoneId } from "./id";

export function listPackages(storageRoot: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(storageRoot);
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const name of names) {
    if (!isValidEoneId(name)) {
      continue;
    }
    let st: fs.Stats;
    try {
      st = fs.lstatSync(path.join(storageRoot, name));
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      ids.push(name);
    }
  }
  return ids.toSorted();
}
