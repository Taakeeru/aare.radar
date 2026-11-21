"""Content of the two-weekly summary email.

    python3 -m collector.digest [db_path] [en|de]            # v1: every new ad per role (kept for its tests)
    python3 -m collector.digest --v2 [db_path] [en|de] [--html]   # v2: beginner IT ads first, by category

v2 (21.11.2026, team: «a report every two weeks with the amount of new job postings organized by categories with
clear deadlines»; owner: entry level first): every new IT ad of the period (job-room IT occupation codes, plus the
role ads), grouped by IT field. Per field: how many new ads, how many open to beginners, and the beginner ads with
the soonest deadline first (at most 5), each with a short job-room link. Only counts and public ad facts.
"""
import datetime as dt
import json
import sys

from .roles import ROLES, is_entry_ad

# The summary email keeps the three categories the team chose, whatever the radar tracks.
DIGEST_ROLES = ("web", "support", "data")
DE_LABELS = {"web": "Webentwicklung", "support": "IT-Support", "data": "Datenanalyse"}
MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
           "November", "December"],
    "de": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober",
           "November", "Dezember"],
}
T = {
    "en": {"subject": "AareRadar: new job postings from {a} to {b}", "period": "Period: {a} to {b}",
           "until": "until {d}", "none_end": "no end date given", "empty": "No new postings"},
    "de": {"subject": "AareRadar: neue Stellen von {a} bis {b}", "period": "Zeitraum: {a} bis {b}",
           "until": "bis {d}", "none_end": "kein Enddatum angegeben", "empty": "Keine neuen Stellen"},
}


def _fmt(d, locale):
    m = MONTHS[locale][d.month - 1]
    return f"{d.day}. {m} {d.year}" if locale == "de" else f"{d.day} {m} {d.year}"


def _date(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def build_digest(c, today, days=14, locale="en"):
    if locale not in T:
        locale = "en"
    t = T[locale]
    start = today - dt.timedelta(days=days)
    a, b = _fmt(start, locale), _fmt(today, locale)
    per_role = {rid: [] for rid in DIGEST_ROLES}
    for title, company, city, ends, url, roles, first_seen in c.execute(
            "SELECT title, company, city, ends, url, roles, first_seen FROM ads WHERE roles != '[]'"):
        seen = _date(first_seen)
        if seen is None or not start <= seen <= today:
            continue
        try:
            rids = json.loads(roles)
        except (TypeError, ValueError):
            continue
        end = _date(ends)
        for rid in rids:
            if rid in per_role:
                per_role[rid].append((end, title, company, city, url))
    lines = [t["period"].format(a=a, b=b), ""]
    for rid in DIGEST_ROLES:
        label = ROLES[rid][0]
        if locale == "de":
            label = DE_LABELS.get(rid, label)
        ads = sorted(per_role[rid], key=lambda x: (x[0] is None, x[0] or dt.date.max))
        lines.append(f"{label} ({len(ads)})")
        if not ads:
            lines.append(t["empty"])
        for end, title, company, city, url in ads:
            when = t["until"].format(d=_fmt(end, locale)) if end else t["none_end"]
            lines.append(f"{title}, {company}, {city}, {when}, {url}")
        lines.append("")
    return {"subject": t["subject"].format(a=a, b=b), "text": "\n".join(lines).rstrip() + "\n"}


V2 = {
    "en": {"subject": "AareRadar: {n} IT jobs open to beginners, {a} to {b}",
           "intro": "New IT job ads in Switzerland from {a} to {b}: {total} in all, {entry} of them open to beginners "
                    "(junior, trainee, internship, career changer, or no experience needed).",
           "field": "{label}: {n} new ads, {e} open to beginners",
           "none": "No beginner ad in this field in these two weeks.",
           "more": "{k} more beginner ads in this field on the radar.",
           "until": "apply until {d}", "noend": "no deadline given",
           "foot": "Source: job-room.ch (SECO), ads published in Switzerland. Counts only, no personal data. "
                   "All numbers and charts: {site}",
           "other": "Other IT-related roles"},
    "de": {"subject": "AareRadar: {n} IT-Stellen für Einsteigende, {a} bis {b}",
           "intro": "Neue IT-Inserate in der Schweiz vom {a} bis {b}: {total} insgesamt, {entry} davon offen für "
                    "Einsteigende (Junior, Trainee, Praktikum, Quereinstieg oder ohne Erfahrung).",
           "field": "{label}: {n} neue Inserate, {e} offen für Einsteigende",
           "none": "In diesem Bereich gab es in diesen zwei Wochen kein Einsteiger-Inserat.",
           "more": "{k} weitere Einsteiger-Inserate in diesem Bereich auf dem Radar.",
           "until": "Bewerbung bis {d}", "noend": "kein Enddatum angegeben",
           "foot": "Quelle: job-room.ch (SECO), in der Schweiz ausgeschriebene Inserate. Nur Zahlen, keine Personendaten. "
                   "Alle Zahlen und Grafiken: {site}",
           "other": "Weitere IT-nahe Rollen"},
}
SITE = "https://radar.gnamak.ch"
JOBROOM_AD = "https://www.job-room.ch/job-search/{id}"


def build_digest_v2(c, today, days=14, per_field=5):
    """Language-neutral structure: {from, to, days, ads, entry_ads, fields: [{group, label_en, label_de, ads,
    entry_ads, items: [{title, company, city, ends, url}]}]} (items = beginner ads, soonest deadline first)."""
    from .types.jobroom_search import it_occupations
    it = it_occupations()
    occ, groups = it["occupations"], dict(it["groups"])
    groups["other"] = {"en": V2["en"]["other"], "de": V2["de"]["other"]}
    start = today - dt.timedelta(days=days)
    cols = {r[1] for r in c.execute("PRAGMA table_info(ads)")}
    exp = "experience" if "experience" in cols else "NULL"
    fields, dup = {}, set()
    for aid, title, company, city, ends, roles, barriers, first_seen, code, x in c.execute(
            f"SELECT id, title, company, city, ends, roles, barriers, first_seen, occupation, {exp} FROM ads"):
        seen = _date(first_seen)
        if seen is None or not start <= seen <= today:
            continue
        g = occ[code]["group"] if code in occ else ("other" if roles not in (None, "", "[]") else None)
        if g is None:
            continue
        try:
            tags = json.loads(barriers or "[]")
        except (TypeError, ValueError):
            tags = []
        # the same ad in German, French and Italian is one ad: same company prefix, city and deadline
        key = ((title or "").lower()[:40], (company or "").split(" - ")[0].split("(")[0].strip().lower()[:12], city, ends)
        if key in dup:
            continue
        dup.add(key)
        f = fields.setdefault(g, {"ads": 0, "entry": []})
        f["ads"] += 1
        if is_entry_ad(title, tags, x) and not (ends and ends[:10] <= today.isoformat()):
            f["entry"].append({"title": title, "company": company, "city": city, "ends": (ends or "")[:10] or None,
                               "url": JOBROOM_AD.format(id=aid)})
    out = []
    for g, f in fields.items():
        items = sorted(f["entry"], key=lambda i: (i["ends"] is None, i["ends"] or "9999"))
        out.append({"group": g, "label_en": groups.get(g, {}).get("en", g), "label_de": groups.get(g, {}).get("de", g),
                    "ads": f["ads"], "entry_ads": len(items), "items": items[:per_field]})
    out.sort(key=lambda f: (f["group"] == "other", -f["entry_ads"], -f["ads"]))
    return {"from": start.isoformat(), "to": today.isoformat(), "days": days,
            "ads": sum(f["ads"] for f in out), "entry_ads": sum(f["entry_ads"] for f in out), "fields": out}


def render_v2(d, locale="en"):
    """-> {subject, text, html} for one language. The HTML is inline-styled, plain (mail clients strip CSS)."""
    import html as h
    t = V2.get(locale, V2["en"])
    a, b = _fmt(dt.date.fromisoformat(d["from"]), locale), _fmt(dt.date.fromisoformat(d["to"]), locale)
    lab = (lambda f: f["label_de"]) if locale == "de" else (lambda f: f["label_en"])
    when = lambda i: t["until"].format(d=_fmt(dt.date.fromisoformat(i["ends"]), locale)) if i["ends"] else t["noend"]  # noqa: E731
    lines = [t["intro"].format(a=a, b=b, total=d["ads"], entry=d["entry_ads"]), ""]
    hp = [f'<p style="margin:0 0 16px">{h.escape(lines[0])}</p>']
    for f in d["fields"]:
        head = t["field"].format(label=lab(f), n=f["ads"], e=f["entry_ads"])
        lines.append(head)
        hp.append(f'<h2 style="font-size:17px;margin:24px 0 8px">{h.escape(head)}</h2>')
        if not f["items"]:
            lines.append(t["none"])
            hp.append(f'<p style="margin:0">{h.escape(t["none"])}</p>')
        else:
            hp.append('<ul style="margin:0;padding-left:20px">')
        for i in f["items"]:
            who = ", ".join(x for x in (i["company"], i["city"]) if x)
            lines.append(f"- {i['title']} ({who}), {when(i)}: {i['url']}")
            hp.append(f'<li style="margin:0 0 8px"><a href="{h.escape(i["url"])}">{h.escape(i["title"])}</a>'
                      f'<br>{h.escape(who)} · {h.escape(when(i))}</li>')
        if f["items"]:
            hp.append("</ul>")
        if f["entry_ads"] > len(f["items"]):
            more = t["more"].format(k=f["entry_ads"] - len(f["items"]))
            lines.append(more)
            hp.append(f'<p style="margin:8px 0 0">{h.escape(more)}</p>')
        lines.append("")
    foot = t["foot"].format(site=f"{SITE}/{locale}")
    lines.append(foot)
    hp.append(f'<p style="margin:24px 0 0;font-size:14px">{h.escape(foot)}</p>')
    body = "".join(hp)
    html_doc = (f'<!doctype html><html lang="{locale}"><body style="margin:0;padding:24px;font-family:Helvetica,Arial,sans-serif;'
                f'font-size:16px;line-height:1.5"><div style="max-width:640px;margin:0 auto">'
                f'<p style="font-size:20px;font-weight:700;margin:0 0 16px">{{ AareRadar }}</p>{body}</div></body></html>')
    return {"subject": t["subject"].format(n=d["entry_ads"], a=a, b=b), "text": "\n".join(lines) + "\n", "html": html_doc}


def main(argv):
    from . import db
    if "--v2" in argv:
        rest = [x for x in argv if not x.startswith("--")]
        c = db.connect(rest[0] if rest else None)
        r = render_v2(build_digest_v2(c, dt.date.today()), rest[1] if len(rest) > 1 else "en")
        print(r["html"] if "--html" in argv else f"{r['subject']}\n\n{r['text']}")
        return
    c = db.connect(argv[0] if argv else None)
    d = build_digest(c, dt.date.today(), locale=argv[1] if len(argv) > 1 else "en")
    print(d["subject"], "", d["text"], sep="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
