/**
 * Nothing in this repo may name the client the app skeleton was taken from, or
 * any other client. (The words are assembled from pieces so this file does not
 * contain them either.)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./support/files";

const BANNED = [
  ["Camer", "ata"],
  ["Memoria", " Cordis"],
  ["memoria", "cordis"],
  ["Repertoire", " Orchestra"],
  ["repertoire", "orchestra"],
  ["Simple", " Symphony"],
  ["simple", "symphony"],
  ["Festival", " Strings"],
].map((p) => p.join(""));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next", "test-results", "data", "coverage"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("no client names", () => {
  it("no text file names another client", () => {
    const hits: string[] = [];
    for (const f of walk(ROOT)) {
      if (/\.(png|ico|jpg|jpeg|webp|woff2?)$/i.test(f)) continue;
      const text = fs.readFileSync(f, "utf8").toLowerCase();
      for (const b of BANNED) if (text.includes(b.toLowerCase())) hits.push(`${path.relative(ROOT, f)}: ${b}`);
    }
    expect(hits).toEqual([]);
  });
});
