"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/avatar";
import { CH_OUTLINE, VOLUNTEERS, project, type Volunteer } from "@/lib/volunteers-mockup";

// Where a city's name goes so neighbours do not overlap (Zürich, Zug, Winterthur, Luzern sit close together).
const LABEL: Record<string, "above" | "below" | "right" | "left"> = { Zürich: "left", Zug: "below", Luzern: "left", Winterthur: "above", Fribourg: "left", Bern: "right", "St. Gallen": "right" };

const W = 640;
const H = 420;

/** Concept map: pins per city, a click shows the (fictional) profiles there; filters by city, field and free text. */
export function VolunteerMap() {
  const t = useTranslations("volunteers");
  const [city, setCity] = useState("");
  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string>("");

  const cities = useMemo(() => [...new Set(VOLUNTEERS.map((v) => v.city))].sort(), []);
  const domains = useMemo(() => [...new Set(VOLUNTEERS.flatMap((v) => v.domains))].sort(), []);
  const shown = VOLUNTEERS.filter(
    (v) =>
      (!city || v.city === city) &&
      (!domain || v.domains.includes(domain)) &&
      (!q || `${v.name} ${v.city} ${v.domains.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const byCity = new Map<string, Volunteer[]>();
  for (const v of shown) byCity.set(v.city, [...(byCity.get(v.city) ?? []), v]);
  const outline = CH_OUTLINE.map(([lon, lat]) => project(lon, lat, W, H).join(",")).join(" ");
  const selected = open ? (byCity.get(open) ?? []) : shown;

  return (
    <div className="vol">
      <div className="vol__filters" role="search">
        <label>
          <span>{t("city")}</span>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{t("all")}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("domain")}</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">{t("all")}</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="vol__search">
          <span>{t("search")}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchHint")} />
        </label>
      </div>

      <div className="vol__body">
        <svg className="vol__map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("mapLabel")}>
          <polygon className="vol__land" points={outline} />
          {[...byCity.entries()].map(([c, list]) => {
            const [x, y] = project(list[0]!.lon, list[0]!.lat, W, H);
            const r = 9 + Math.min(list.length, 4) * 2;
            return (
              <g key={c} className="vol__pin" data-open={open === c ? "true" : undefined}>
                <circle cx={x} cy={y} r={r} onClick={() => setOpen(open === c ? "" : c)} />
                <text x={x} y={y + 4} textAnchor="middle" aria-hidden="true">
                  {list.length}
                </text>
                <text
                  className="vol__city"
                  x={LABEL[c] === "right" ? x + r + 4 : LABEL[c] === "left" ? x - r - 4 : x}
                  y={LABEL[c] === "below" ? y + r + 14 : LABEL[c] === "right" || LABEL[c] === "left" ? y + 4 : y - r - 6}
                  textAnchor={LABEL[c] === "right" ? "start" : LABEL[c] === "left" ? "end" : "middle"}
                  aria-hidden="true"
                >
                  {c}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="vol__list">
          <div className="vol__pins" aria-label={t("pinsLabel")}>
            {[...byCity.keys()].map((c) => (
              <button key={c} type="button" className="vol__chip" aria-pressed={open === c} onClick={() => setOpen(open === c ? "" : c)}>
                {c} ({byCity.get(c)!.length})
              </button>
            ))}
          </div>
          <p className="vol__count" role="status">
            {open ? t("inCity", { n: selected.length, city: open }) : t("count", { n: shown.length })}
          </p>
          <ul className="vol__cards">
            {selected.map((v) => (
              <li key={v.id} className="vol__card">
                <Avatar id={v.id} label={t("avatar", { name: v.name })} />
                <div className="vol__info">
                <p className="vol__name">{v.name}</p>
                <p className="vol__meta">
                  {v.city} · {t("offers", { offer: v.offer })}
                </p>
                <p className="vol__tags">
                  {v.domains.map((d) => (
                    <span key={d} className="vol__tag">
                      {d}
                    </span>
                  ))}
                </p>
                </div>
              </li>
            ))}
          </ul>
          {selected.length === 0 ? <p>{t("none")}</p> : null}
        </div>
      </div>
    </div>
  );
}
