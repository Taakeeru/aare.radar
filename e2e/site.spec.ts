/**
 * The stub home page and the team's sign-in, against the PRODUCTION build and the
 * demo admin (scripts/demo/seed_demo.mjs). Tagged @ci: Pandora's client CI runs these.
 *
 * Every HTTP check goes through the browser (page.goto, or fetch inside
 * page.evaluate), never page.request: in Pandora's CI the runner is a separate
 * container and only the browser reaches the app.
 */
import { expect, test } from "@playwright/test";
import { COLOR, GRADIENT } from "../lib/design-tokens";

const QUESTIONS = {
  de: ["Nachfrage", "Fähigkeiten", "Arbeitgeber", "Zielgruppe", "Politik"],
  en: ["Demand", "Skills", "Employers", "Target group", "Policy"],
} as const;

test("@ci stub home page (DE and EN): name, one line, five questions, no data, no links", async ({ page }) => {
  const lines = { de: "Ein Marktradar für das Powercoders-Team. Im Aufbau.", en: "A market radar for the Powercoders team. Work in progress." };
  for (const l of ["de", "en"] as const) {
    const res = await page.goto(`/${l}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", l);
    await expect(page.locator("h1")).toHaveText("Powercoders Job Radar");
    await expect(page.locator("main")).toContainText(lines[l]);
    const items = page.locator("main ul li");
    await expect(items).toHaveCount(5);
    for (const [i, name] of QUESTIONS[l].entries()) {
      await expect(items.nth(i)).toContainText(name);
      await expect(items.nth(i)).toContainText("ABCDE"[i]!);
    }
    await expect(page.locator("main a")).toHaveCount(0);
    await expect(page.locator("main img, main canvas, main svg, main table")).toHaveCount(0);
  }
  await page.goto("/de");
  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
  const favicon = await page.evaluate(async () => (await fetch("/favicon.ico")).status);
  expect(favicon).toBe(200);
  await expect(page.getByRole("link", { name: "Anmelden für das Team" })).toHaveAttribute("href", "/de/login");
});

test("@ci phone width: no horizontal scroll on any public page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/de", "/en", "/de/login", "/en/login", "/de/passwort-vergessen", "/de/nonexistent-page"]) {
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
  for (const p of ["/de", "/en", "/de/login"]) await page.goto(p);
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
  for (const [w, p] of [[1280, "/de"], [390, "/de"], [1280, "/en"], [1280, "/de/login"], [390, "/de/login"]] as const) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(p);
    const found = await page.evaluate(() => {
      const out = new Map<string, string>();
      const props = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke", "textDecorationColor", "caretColor", "boxShadow", "backgroundImage"];
      for (const el of Array.from(document.querySelectorAll("body, body *"))) {
        const cs = getComputedStyle(el);
        if (cs.display === "none") continue;
        for (const prop of props) {
          // fill/stroke paint only on SVG shapes and text; elsewhere (HTML, the <svg> root, <g>) they are the inert inherited default (black)
          if ((prop === "fill" || prop === "stroke") && !(el instanceof SVGGeometryElement || el instanceof SVGTextContentElement)) continue;
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

/** English is complete: no German left on the English pages. */
test("@ci English pages hold no German", async ({ page }) => {
  const email = process.env.CI_DEMO_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "cto-demo@demo.invalid";
  const password = process.env.CI_DEMO_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "";
  const GERMAN = /\b(und|der|die|das|nicht|für|mit|von|ist|sind|Stand|Zielgruppe|Daten|Verwaltung|Anmelden|Abmelden|Passwort|Fähigkeiten|Arbeitgeber|Politik|Nachfrage|Zum|Zur)\b/;
  const check = async (path: string) => {
    await page.goto(path);
    const text = await page.evaluate(() => document.body.innerText);
    const hit = text.split("\n").filter((l) => GERMAN.test(l));
    expect(hit, `${path}: German text on an English page`).toEqual([]);
  };
  for (const p of ["/en", "/en/login", "/en/passwort-vergessen", "/en/nonexistent-page"]) await check(p);
  test.skip(!password, "no demo admin password given (CI_DEMO_ADMIN_PASSWORD)");
  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fadmin$/);
  await page.fill("#pw-email", email);
  await page.fill("#pw-password", password);
  await page.locator("form:has(#pw-password) button[type=submit]").click();
  await expect(page).toHaveURL(/\/en\/admin$/);
  for (const p of ["/en/admin", "/en/admin/sicherheit", "/en/admin/protokoll"]) await check(p);
});

test("@ci the language picker is on every page and keeps the page", async ({ page }) => {
  const email = process.env.CI_DEMO_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "cto-demo@demo.invalid";
  const password = process.env.CI_DEMO_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "";
  const pick = page.getByRole("list", { name: /Sprache|Language/ });
  for (const [from, to] of [["/de", "/en"], ["/de/login", "/en/login"], ["/de/passwort-vergessen", "/en/passwort-vergessen"]]) {
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
