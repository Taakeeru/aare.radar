"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ACCENTS,
  BACKGROUNDS,
  DESIGN_DEFAULT,
  FONTS,
  MARKS,
  cleanChoice,
  designStyle,
  type DesignChoice,
} from "@/lib/design-tokens";

const STORE_KEY = "radar-design";
const GROUPS: { key: keyof DesignChoice; values: readonly string[] }[] = [
  { key: "bg", values: Object.keys(BACKGROUNDS) },
  { key: "accent", values: Object.keys(ACCENTS) },
  { key: "font", values: Object.keys(FONTS) },
  { key: "mark", values: MARKS },
];

function isDefault(c: DesignChoice): boolean {
  return GROUPS.every((g) => c[g.key] === DESIGN_DEFAULT[g.key]);
}

/** Writes one combination onto <html>: the CSS variables, the wordmark and light/dark. */
function apply(c: DesignChoice): void {
  const html = document.documentElement;
  for (const [name, value] of Object.entries(designStyle(c))) html.style.setProperty(name, value);
  html.dataset.mark = c.mark;
  html.dataset.light = String(BACKGROUNDS[c.bg]?.light ?? false);
}

function fromUrl(): Partial<DesignChoice> {
  const p = new URLSearchParams(window.location.search);
  const out: Partial<DesignChoice> = {};
  for (const g of GROUPS) {
    const v = p.get(g.key);
    if (v) out[g.key] = v;
  }
  return out;
}

function fromStore(): Partial<DesignChoice> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Partial<DesignChoice>) : {};
  } catch {
    return {};
  }
}

function linkFor(c: DesignChoice): string {
  const url = new URL(window.location.href);
  for (const g of GROUPS) url.searchParams.set(g.key, c[g.key]);
  return url.toString();
}

/**
 * «Design options» (21.11.2026): the team tries background, accent, font and wordmark on the real pages
 * and shares a link to one combination (the choice rides in the URL and is remembered in this browser).
 * Values only from lib/design-tokens.ts; the default stays until the team has voted.
 */
export function DesignSwitcher() {
  const t = useTranslations("design");
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<DesignChoice>(DESIGN_DEFAULT);
  const [status, setStatus] = useState("");
  const fab = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const url = fromUrl();
    const c = cleanChoice(Object.keys(url).length ? { ...fromStore(), ...url } : fromStore());
    setChoice(c);
    apply(c);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        fab.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(next: DesignChoice) {
    setChoice(next);
    setStatus("");
    apply(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* private window: the URL still carries the choice */
    }
    window.history.replaceState(null, "", linkFor(next));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(linkFor(choice));
      setStatus(t("copied"));
    } catch {
      setStatus(linkFor(choice));
    }
  }

  return (
    <>
      <button
        ref={fab}
        type="button"
        className="design-fab"
        aria-expanded={open}
        aria-controls="design-sheet"
        onClick={() => setOpen((o) => !o)}
        data-testid="design-fab"
      >
        {t("open")}
      </button>
      {open ? (
        <section id="design-sheet" className="design-sheet" aria-labelledby="design-title" data-testid="design-sheet">
          <h2 id="design-title">{t("title")}</h2>
          <p className="design-sheet__hint">{t("hint")}</p>
          {GROUPS.map((g) => (
            <fieldset key={g.key}>
              <legend>{t(`group.${g.key}`)}</legend>
              <div className="design-sheet__opts">
                {g.values.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="design-opt"
                    aria-pressed={choice[g.key] === v}
                    onClick={() => choose({ ...choice, [g.key]: v })}
                    data-testid={`design-${g.key}-${v}`}
                  >
                    {t(`opt.${g.key}.${v}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="design-sheet__actions">
            <button type="button" className="btn btn--primary" onClick={copy}>
              {t("copy")}
            </button>
            {!isDefault(choice) ? (
              <button type="button" className="btn-text" onClick={() => choose(DESIGN_DEFAULT)}>
                {t("reset")}
              </button>
            ) : null}
          </div>
          {status ? (
            <p className="design-sheet__status" role="status">
              {status}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
