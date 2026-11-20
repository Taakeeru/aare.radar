/**
 * Swiss German copy rules (owner, copy_rules.py): du, no eszett, no sentence
 * dashes, no typographic quotes. Checked on every visible German string this
 * repo holds: the UI messages and the two mails. (The owner's copy_rules.py was
 * also run over messages/de.json: see the pull request.)
 */
import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import { passwordResetText } from "@/lib/email";

function strings(x: unknown): string[] {
  if (typeof x === "string") return [x];
  if (Array.isArray(x)) return x.flatMap(strings);
  if (x && typeof x === "object") return Object.values(x).flatMap(strings);
  return [];
}

const VISIBLE = [...strings(de), ...Object.values(passwordResetText("https://example.org/x")).flatMap((s) => s.split("\n"))];

describe("German copy rules", () => {
  it("no eszett", () => {
    expect(VISIBLE.filter((s) => s.includes("ß"))).toEqual([]);
  });
  it("no dashes as sentence punctuation (em or en dash)", () => {
    expect(VISIBLE.filter((s) => /[—–]/.test(s) || /\s-\s/.test(s))).toEqual([]);
  });
  it("no typographic or straight double quotes", () => {
    expect(VISIBLE.filter((s) => /[„“”"]/.test(s))).toEqual([]);
  });
  it("du, never Sie or ihr", () => {
    expect(VISIBLE.filter((s) => /\b(Sie|Ihnen|Ihre[mnrs]?|euch|eure[mnrs]?)\b/.test(s))).toEqual([]);
  });
});
