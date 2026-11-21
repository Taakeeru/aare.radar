/** Team, 21.11.2026: «What this means» on at most two charts per page. */
import { describe, expect, it } from "vitest";
import { KEEP_MEANING_BY_PAGE } from "@/components/panel";

describe("what this means: at most two per page", () => {
  it("no page keeps more than two", () => {
    for (const [page, ids] of Object.entries(KEEP_MEANING_BY_PAGE)) expect(ids.length, page).toBeLessThanOrEqual(2);
  });
});
