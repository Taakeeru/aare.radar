/**
 * The «Volunteers» page is a CONCEPT with fictional people only (owner, 21.11.2026): no real person, nothing from
 * LinkedIn. Guard: every profile is marked «Example:», the page says it is a concept, and no LinkedIn link exists.
 */
import { describe, expect, it } from "vitest";
import { VOLUNTEERS, CH_OUTLINE, project } from "@/lib/volunteers-mockup";
import { read } from "./support/files";

describe("volunteers concept", () => {
  it("every profile is a marked example", () => {
    expect(VOLUNTEERS.length).toBeGreaterThan(5);
    for (const v of VOLUNTEERS) expect(v.name.startsWith("Example: "), v.name).toBe(true);
  });

  it("the page says it is a concept with fictional profiles, in both languages, and links nowhere", () => {
    const en = JSON.parse(read("messages/en.json")).volunteers;
    const de = JSON.parse(read("messages/de.json")).volunteers;
    expect(en.conceptTitle).toMatch(/fictional/i);
    expect(de.conceptTitle).toMatch(/erfunden/i);
    const code = read("components/volunteer-map.tsx") + read("lib/volunteers-mockup.ts");
    expect(code).not.toMatch(/linkedin\.com|https?:\/\//i);
  });

  it("every pin lands inside the map box", () => {
    for (const v of VOLUNTEERS) {
      const [x, y] = project(v.lon, v.lat, 640, 420);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(640);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(420);
    }
    expect(CH_OUTLINE[0]).toEqual(CH_OUTLINE[CH_OUTLINE.length - 1]);
  });
});
