"""Content of the two-weekly summary email: new job postings per role, with deadlines. Content only.

    python3 -m collector.digest [db_path] [en|de]
"""
import datetime as dt
import json
import sys

from .roles import ROLES

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
    per_role = {rid: [] for rid in ROLES}
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
    for rid, (label, _, _) in ROLES.items():
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


def main(argv):
    from . import db
    c = db.connect(argv[0] if argv else None)
    d = build_digest(c, dt.date.today(), locale=argv[1] if len(argv) > 1 else "en")
    print(d["subject"], "", d["text"], sep="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
