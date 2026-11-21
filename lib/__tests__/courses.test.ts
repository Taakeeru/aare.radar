/** «What to teach next»: every link is https, every skill has courses, names as the radar writes them are found. */
import { describe, expect, it } from "vitest";
import { COURSES_CHECKED, PROGRAMS, coursesFor } from "@/lib/courses";
import data from "@/content/courses.json";

describe("course suggestions", () => {
  it("every course and program link is https and every skill has at least two courses", () => {
    for (const s of data.skills) {
      expect(s.courses.length, s.skill).toBeGreaterThanOrEqual(2);
      for (const c of s.courses) expect(c.url, `${s.skill} ${c.title}`).toMatch(/^https:\/\/[^\s]+$/);
    }
    for (const p of PROGRAMS) expect(p.url).toMatch(/^https:\/\//);
    expect(COURSES_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("finds skills by the radar's names", () => {
    for (const k of ["Security", "SQL", "Scrum/Agile", "Microsoft 365", "Testing", "QA"]) expect(coursesFor(k), k).not.toBeNull();
    expect(coursesFor("Kubernetes-not-listed")).toBeNull();
  });
});
