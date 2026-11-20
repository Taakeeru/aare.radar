import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Files under `dirs` (relative to the repo) with one of `exts`, skipping node_modules/.next/tests. */
export function sourceFiles(dirs: string[], exts: string[], opts: { includeTests?: boolean } = {}): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (["node_modules", ".next", ".git"].includes(e.name)) continue;
        if (!opts.includeTests && e.name === "__tests__") continue;
        walk(full);
      } else if (exts.some((x) => e.name.endsWith(x))) {
        out.push(full);
      }
    }
  };
  for (const d of dirs) walk(path.join(ROOT, d));
  return out;
}

export function read(file: string): string {
  return fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), "utf8");
}

export function rel(file: string): string {
  return path.relative(ROOT, file);
}
