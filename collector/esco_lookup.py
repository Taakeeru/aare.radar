"""One-time lookup: map our skill labels (roles.py SKILLS) to ESCO skill URIs.

    python3 -m collector.esco_lookup            # resolve CURATED against the ESCO API, write collector/esco_skills.json
    python3 -m collector.esco_lookup --check    # list skills in roles.py that CURATED does not decide on

The ESCO API (https://ec.europa.eu/esco/api) is official and open. The result is committed as
collector/esco_skills.json so the export needs no network; re-run only when SKILLS changes.

ESCO (v1.x) is an occupation/skill taxonomy and lags behind current tooling: there is no concept for React, Docker,
Kubernetes, Azure, AWS, Tableau or Windows. A plain text search returns nonsense for those ("react to emergency
situations"), so every pick is curated by hand: (search text, exact ESCO label wanted, match kind).
match = "exact" (same concept) or "broader" (the closest ESCO concept that covers it). None = no fitting concept;
the skill then has no esco_uri in the export rather than a wrong link.
"""
import json
import sys
import urllib.parse
from pathlib import Path

from . import net
from .roles import SKILLS

OUT = Path(__file__).resolve().parent / "esco_skills.json"
API = "https://ec.europa.eu/esco/api/search?language=en&type=skill&limit=10&text="

CURATED = {
    "JavaScript": ("JavaScript", "JavaScript", "exact"),
    "TypeScript": ("TypeScript", "TypeScript", "exact"),
    "React": ("JavaScript", "JavaScript Framework", "broader"),
    "Angular": ("JavaScript", "JavaScript Framework", "broader"),
    "Vue": ("JavaScript", "JavaScript Framework", "broader"),
    "Node.js": ("JavaScript", "JavaScript Framework", "broader"),
    "HTML/CSS": ("use markup languages", "use markup languages", "broader"),
    "PHP": ("PHP", "PHP", "exact"),
    "Java": ("Java (computer programming)", "Java (computer programming)", "exact"),
    "C#/.NET": ("C#", "C#", "exact"),
    "Python": ("Python (computer programming)", "Python (computer programming)", "exact"),
    "SQL": ("SQL", "SQL", "exact"),
    "Git": ("version control", "tools for software configuration management", "broader"),
    "Docker": None, "Kubernetes": None, "Azure": None, "AWS": None,
    "Cloud": ("cloud", "cloud technologies", "exact"),
    "Linux": None, "Windows": None,
    "Microsoft 365": ("use microsoft office", "use microsoft office", "broader"),
    "Active Directory": ("Active Directory", "distributed directory information services", "broader"),
    "Intune/MDM": ("mobile device management", "mobile device management", "exact"),
    "Networking": None,
    "ITIL": ("ITIL", "apply operations for an ITIL-based environment", "broader"),
    "Ticketing": ("ICT help desk", "handle helpdesk problems", "broader"),
    "Hardware": ("ICT hardware", "ICT hardware specifications", "broader"),
    "Power BI": ("business intelligence", "business intelligence", "broader"),
    "Excel": ("Microsoft Excel", "use spreadsheets software", "broader"),
    "Tableau": None,
    "R": ("R (computer programming)", "R", "exact"),
    "SAP": ("SAP R3", "SAP R3", "broader"),
    "Security": ("computer security", "cyber security", "exact"),
    "Scrum/Agile": ("agile project management", "Agile project management", "exact"),
    "API/REST": None,
}


def search(text):
    data = json.loads(net.fetch(API + urllib.parse.quote(text, safe="()"), min_gap=1.0)[0])
    return [{"uri": h["uri"], "label": h.get("title") or h.get("searchHit")}
            for h in data.get("_embedded", {}).get("results", [])]


def main():
    if "--check" in sys.argv:
        print("not decided in CURATED:", [s for s in SKILLS if s not in CURATED] or "none")
        return
    mapping = {}
    for skill in SKILLS:
        pick = CURATED.get(skill)
        if not pick:
            mapping[skill] = None
            print(f"{skill:18} -> (no ESCO concept)")
            continue
        text, label, kind = pick
        hit = next((h for h in search(text) if h["label"] == label), None)
        if not hit:
            print(f"{skill:18} -> NOT FOUND: {label!r} for search {text!r}")
            mapping[skill] = None
            continue
        mapping[skill] = {"uri": hit["uri"], "label": hit["label"], "match": kind}
        print(f"{skill:18} -> {hit['label']} ({kind})")
    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT}: {sum(1 for v in mapping.values() if v)}/{len(SKILLS)} skills mapped")


if __name__ == "__main__":
    main()
