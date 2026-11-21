/**
 * «What to teach next» (21.11.2026, Isabella, panel thread 55): for the skills most asked in the ads, the Powercoders
 * program that fits (powercoders.org/programs) and beginner courses elsewhere. content/courses.json was researched and
 * every link opened on 21.11.2026; costs and certificates are as the provider pages showed them that day.
 */
import data from "@/content/courses.json";

export type Course = { provider: string; title: string; url: string; cost: string; language: string; certificate: boolean };
export type Program = { id: string; name: string; url: string; summary: string; skills: string[] };
export type SkillCourses = { skill: string; powercoders: string[]; courses: Course[] };

export const COURSES_CHECKED: string = data.checked;
export const PROGRAMS: Program[] = data.programs;
const BY_SKILL = new Map<string, SkillCourses>((data.skills as SkillCourses[]).map((s) => [s.skill.toLowerCase(), s]));

/** Course suggestions for a skill name as the radar writes it («Testing» finds «Testing/QA»). */
export function coursesFor(skill: string): SkillCourses | null {
  const k = skill.toLowerCase();
  return BY_SKILL.get(k) ?? [...BY_SKILL.values()].find((s) => s.skill.toLowerCase().split("/").includes(k)) ?? null;
}

export function programsFor(s: SkillCourses): Program[] {
  return PROGRAMS.filter((p) => s.powercoders.includes(p.id) && /^https:\/\//.test(p.url));
}
