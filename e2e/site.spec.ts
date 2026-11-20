/**
 * The public dashboard and the team's sign-in, against the PRODUCTION build with
 * the sample data (fixtures/radar.sample.json) and the demo admin
 * (scripts/demo/seed_demo.mjs). Tagged @ci: Pandora's client CI runs these.
 *
 * Every HTTP check goes through the browser (page.goto, or fetch inside
 * page.evaluate), never page.request: in Pandora's CI the runner is a separate
 * container and only the browser reaches the app.
 */
import { expect, test } from "@playwright/test";
import { COLOR, GRADIENT } from "../lib/design-tokens";

test("@ci dashboard renders: one screen per role, the big number, the favicon", async ({ page }) => {
  const res = await page.goto("/de");
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Das sucht der IT-Markt");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Offene Inserate" })).toBeVisible();
  await expect(page.locator(".stat__n").first()).toHaveText(/\d/);
  const favicon = await page.evaluate(async () => (await fetch("/favicon.ico")).status);
  expect(favicon).toBe(200);
});

test("@ci the role switcher changes the whole screen", async ({ page }) => {
  await page.goto("/de");
  const nav = page.getByRole("navigation", { name: "Beruf wählen" });
  await expect(nav.getByRole("link", { name: "Web-Entwicklung" })).toHaveAttribute("aria-current", "true");
  const web = await page.locator(".stat__n").first().innerText();
  await nav.getByRole("link", { name: "IT-Support" }).click();
  await expect(page).toHaveURL(/\/de\?role=support$/);
  await expect(nav.getByRole("link", { name: "IT-Support" })).toHaveAttribute("aria-current", "true");
  expect(await page.locator(".stat__n").first().innerText()).not.toBe(web);
});

test("@ci every number names its source with a link and a date", async ({ page }) => {
  await page.goto("/de");
  const panels = page.locator("section.panel");
  const n = await panels.count();
  expect(n).toBeGreaterThanOrEqual(8);
  for (let i = 0; i < n; i++) {
    const src = panels.nth(i).locator("p.source");
    await expect(src).toContainText("Quelle:");
    await expect(src).toContainText(/Stand \d{2}\.\d{2}\.\d{4}/);
    await expect(src.locator("a[href^='http']").first()).toBeVisible();
  }
});

test("@ci the five questions are the navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/de");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  for (const [name, path, h1] of [
    ["Zielgruppe", "/de/zielgruppe", "Für wen bilden wir aus?"],
    ["Politik", "/de/politik", "Was könnte uns zwingen, das Programm anzupassen?"],
    ["Quellen", "/de/quellen", "Quellen"],
  ] as const) {
    await page.goto("/de");
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator("h1")).toHaveText(h1);
  }
  await page.goto("/de");
  for (const [name, id] of [["Nachfrage", "nachfrage"], ["Fähigkeiten", "faehigkeiten"], ["Arbeitgeber", "arbeitgeber"]] as const) {
    await expect(nav.getByRole("link", { name })).toHaveAttribute("href", new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});

test("@ci policy list and sources page", async ({ page }) => {
  await page.goto("/de/politik");
  await expect(page.locator("ul.policy li").first()).toBeVisible();
  await expect(page.locator("ul.policy li .tag").first()).toContainText(/Parlament|Bundesrecht|Stichwort/);
  await page.goto("/de/quellen");
  await expect(page.getByRole("heading", { name: "Das verwenden wir nicht" })).toBeVisible();
  for (const name of ["LinkedIn", "jobs.ch", "Adzuna"]) await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.goto("/de/zielgruppe");
  await expect(page.getByText("Daten folgen")).toBeVisible();
});

test("@ci English pages", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText("What the IT market is looking for");
  await page.goto("/en/politik");
  await expect(page.locator("h1")).toHaveText("What could force us to change the programme?");
});

test("@ci phone width: no horizontal scroll on any public page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/de", "/de?role=data", "/de/politik", "/de/quellen", "/de/zielgruppe", "/de/login", "/en"]) {
    await page.goto(p);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${p} overflows by ${over}px`).toBeLessThanOrEqual(0);
  }
});

test("@ci nothing is loaded from another site", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== "localhost") external.push(host);
  });
  for (const p of ["/de", "/de/politik", "/de/quellen"]) await page.goto(p);
  expect(external, "no request may leave the site").toEqual([]);
});

test("@ci admin: signed out goes to the sign-in, the demo admin gets in and out", async ({ page }) => {
  const email = process.env.CI_DEMO_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "cto-demo@demo.invalid";
  const password = process.env.CI_DEMO_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "";
  test.skip(!password, "no demo admin password given (CI_DEMO_ADMIN_PASSWORD)");
  await page.goto("/de/admin");
  await expect(page).toHaveURL(/\/de\/login\?next=%2Fde%2Fadmin$/);
  await page.fill("#pw-email", email);
  await page.fill("#pw-password", "wrong-password");
  await page.locator("form:has(#pw-password) button[type=submit]").click();
  await expect(page.locator("#login-error")).toHaveText("E-Mail oder Passwort stimmt nicht.");
  await page.fill("#pw-password", password);
  await page.locator("form:has(#pw-password) button[type=submit]").click();
  await expect(page).toHaveURL(/\/de\/admin$/);
  await expect(page.locator("h1")).toHaveText("Verwaltung");
  await expect(page.getByRole("heading", { name: "Datenstand" })).toBeVisible();
  await expect(page.getByText("Datei erzeugt")).toBeVisible();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/de\/login\?loggedout=1$/);
  await page.goto("/de/admin");
  await expect(page).toHaveURL(/\/de\/login\?next=/);
});

test("@ci password reset: the same answer for any address, no account enumeration", async ({ page }) => {
  for (const email of ["cto-demo@demo.invalid", "nobody@example.org"]) {
    await page.goto("/de/passwort-vergessen");
    await page.fill("#pw-email", email);
    await page.getByRole("button", { name: "Link schicken" }).click();
    await expect(page).toHaveURL(/\/de\/passwort-vergessen\?sent=1$/);
    await expect(page.getByRole("status")).toContainText("Wenn zu dieser Adresse ein Konto gehört");
  }
});

test("@ci security headers on the admin sign-in", async ({ page }) => {
  const res = await page.goto("/de/login");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["cache-control"]).toContain("no-store");
});

/** Every colour the browser really paints (text, backgrounds, borders, outlines, shadows, gradients, SVG) is a palette value. */
test("@ci rendered colours are only the palette", async ({ page }) => {
  const hex = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
  const allowed = new Set([...Object.values(COLOR), ...GRADIENT].map(hex));
  for (const [w, p] of [[1280, "/de"], [390, "/de?role=data"], [1280, "/de/politik"], [1280, "/de/quellen"], [1280, "/de/zielgruppe"], [1280, "/de/login"]] as const) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(p);
    const found = await page.evaluate(() => {
      const out = new Map<string, string>();
      const props = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke", "textDecorationColor", "caretColor", "boxShadow", "backgroundImage"];
      for (const el of Array.from(document.querySelectorAll("body, body *"))) {
        const cs = getComputedStyle(el);
        if (cs.display === "none") continue;
        for (const prop of props) {
          const v = (cs as unknown as Record<string, string>)[prop] ?? "";
          if (prop.startsWith("border") && cs.getPropertyValue(prop.replace(/Color$/, "Style").replace(/([A-Z])/g, "-$1").toLowerCase()) === "none") continue;
          if (prop === "outlineColor" && cs.outlineStyle === "none") continue;
          for (const m of v.matchAll(/rgba?\([^)]*\)/g)) out.set(m[0], `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 30)} ${prop}`);
        }
      }
      return [...out.entries()];
    });
    const bad = found.filter(([c]) => !allowed.has(c) && !/^rgba\(\d+, \d+, \d+, 0\)$/.test(c));
    expect(bad, `${p} @${w}: colours outside the palette`).toEqual([]);
  }
});

/** English is complete: no German left on the English pages (data from the sources, such as ad titles and policy titles, is in its original language and is left out). */
test("@ci English pages hold no German", async ({ page }) => {
  const email = process.env.CI_DEMO_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "cto-demo@demo.invalid";
  const password = process.env.CI_DEMO_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "";
  const GERMAN = /\b(und|der|die|das|nicht|für|mit|von|ist|sind|Inserate?n?|Stand|Quelle|Hürden?|Zielgruppe|Daten|Verwaltung|Anmelden|Abmelden|Passwort|Beruf|Woche|Fähigkeiten|Arbeitgeber|Politik|Quellen|Zum|Zur)\b/;
  const check = async (path: string) => {
    await page.goto(path);
    const text = await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>(".ads, .policy__title, .policy__status, #p-employers .rank, #p-agencies .rank").forEach((n) => (n.style.display = "none"));
      return document.body.innerText;
    });
    const hit = text.split("\n").filter((l) => GERMAN.test(l));
    expect(hit, `${path}: German text on an English page`).toEqual([]);
  };
  for (const p of ["/en", "/en?role=support", "/en?role=data", "/en/politik", "/en/quellen", "/en/zielgruppe", "/en/login", "/en/passwort-vergessen", "/en/nonexistent-page"]) await check(p);
  test.skip(!password, "no demo admin password given (CI_DEMO_ADMIN_PASSWORD)");
  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fadmin$/);
  await page.fill("#pw-email", email);
  await page.fill("#pw-password", password);
  await page.locator("form:has(#pw-password) button[type=submit]").click();
  await expect(page).toHaveURL(/\/en\/admin$/);
  for (const p of ["/en/admin", "/en/admin/sicherheit", "/en/admin/berichte", "/en/admin/protokoll"]) await check(p);
});

test("@ci the language picker is on every page and keeps the page", async ({ page }) => {
  const email = process.env.CI_DEMO_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "cto-demo@demo.invalid";
  const password = process.env.CI_DEMO_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "";
  const pick = page.getByRole("list", { name: /Sprache|Language/ });
  for (const [from, to] of [["/de", "/en"], ["/de?role=data", "/en?role=data"], ["/de/politik?source=federal", "/en/politik?source=federal"], ["/de/quellen", "/en/quellen"], ["/de/zielgruppe", "/en/zielgruppe"], ["/de/login", "/en/login"]]) {
    await page.goto(from);
    await expect(pick.getByRole("link", { name: "Deutsch" })).toBeVisible();
    await pick.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(new RegExp(`${to.replace(/[?/]/g, "\\$&")}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await pick.getByRole("link", { name: "Deutsch" }).click();
    await expect(page).toHaveURL(new RegExp(`${from.replace(/[?/]/g, "\\$&")}$`));
  }
  test.skip(!password, "no demo admin password given (CI_DEMO_ADMIN_PASSWORD)");
  await page.goto("/de/admin");
  await page.fill("#pw-email", email);
  await page.fill("#pw-password", password);
  await page.locator("form:has(#pw-password) button[type=submit]").click();
  await expect(page).toHaveURL(/\/de\/admin$/);
  await pick.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
  await expect(page.locator("h1")).toHaveText("Administration");
});
