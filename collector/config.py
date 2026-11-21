"""sources.json: one entry per data source. Loading and validation (also run by tests/test_config.py)."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "sources.json"

QUESTIONS = {"A": "Demand", "B": "Skills", "C": "Employers", "D": "Target group", "E": "Policy watch"}
SCHEDULE_DAYS = {"daily": 1, "weekly": 7, "monthly": 28}
REQUIRED = ["id", "name", "url", "what", "questions", "type", "schedule"]


def load(path=SOURCES_FILE):
    return json.loads(Path(path).read_text())["sources"]


def validate(entries):
    """-> list of plain-language problems (empty list = fine)."""
    from . import types  # late: types import config
    errs, seen = [], set()
    for i, e in enumerate(entries):
        who = e.get("id") or f"entry #{i + 1}"
        for k in REQUIRED:
            if k not in e or e[k] in (None, "", []):
                errs.append(f"{who}: missing '{k}'")
        if e.get("id"):
            if not re.fullmatch(r"[a-z0-9_]+", e["id"]):
                errs.append(f"{who}: id may only contain a-z, 0-9 and _")
            if e["id"] in seen:
                errs.append(f"{who}: id used twice")
            seen.add(e["id"])
        for q in e.get("questions") or []:
            if q not in QUESTIONS:
                errs.append(f"{who}: unknown question '{q}' (use {', '.join(QUESTIONS)})")
        if e.get("schedule") and e["schedule"] not in SCHEDULE_DAYS:
            errs.append(f"{who}: schedule must be one of {', '.join(SCHEDULE_DAYS)}")
        if e.get("url") and not str(e["url"]).startswith("https://"):
            errs.append(f"{who}: url must start with https://")
        t = e.get("type")
        if t:
            if t not in types.NAMES:
                errs.append(f"{who}: unknown type '{t}' (known: {', '.join(types.NAMES)})")
            else:
                for k in types.get(t).REQUIRED:
                    if k not in e:
                        errs.append(f"{who}: type '{t}' needs '{k}'")
    return errs
