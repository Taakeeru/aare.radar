"""Roles Powercoders graduates go into, and the skills / entry barriers we look for in each ad.

Everything here is a plain list so non-developers on the team can propose changes in the panel.
"""
import re

# role id -> (label, job-room search keywords, title regex that decides membership)
ROLES = {
    "web": (
        "Web developer",
        ["Webentwickler", "Web Developer", "Frontend", "Front-End", "Fullstack", "Full Stack",
         "Développeur web", "Software Developer", "Softwareentwickler", "Applikationsentwickler"],
        r"web|front.?end|full.?stack|javascript|react|angular|vue|php|software.?(?:entwickler|developer|engineer)"
        r"|applikationsentwickl|développeur|developer|entwickler.*(?:software|applikation)",
    ),
    "support": (
        "IT support",
        ["IT Support", "ICT-Supporter", "Supporter", "Helpdesk", "Service Desk", "Systemtechniker",
         "ICT-Techniker", "First Level", "2nd Level", "Technicien informatique"],
        r"support|helpdesk|help desk|service.?desk|\b1st\b|\b2nd\b|first.?level|second.?level|systemtechnik"
        r"|ict.?techni|it.?techni|technicien|workplace|client.?engineer|onsite",
    ),
    "data": (
        "Data analyst",
        ["Data Analyst", "Datenanalyst", "Business Intelligence", "BI Developer", "Data Engineer",
         "Reporting", "Analyste de données"],
        r"(?<!market )(?:data(?!.?cent)|daten(?!bank)|business.?intelligence|\bbi\b|analytics|données)"
        r"|(?:reporting|analyst).*(?:data|daten|bi\b|sql|power)|(?:data|daten|bi\b).*(?:analyst|analytik)",
    ),
    "devops": (
        "DevOps / Cloud engineer",
        ["DevOps", "DevOps Engineer", "Cloud Engineer", "Cloud Architect", "Site Reliability", "Platform Engineer",
         "Ingénieur DevOps", "Ingénieur cloud"],
        r"devops|dev.?ops|cloud.?(?:engineer|ingenieur|architekt|architect|spezialist|specialist)|\bsre\b|site.?reliability"
        r"|platform.?engineer|kubernetes|ingénieur.?cloud",
    ),
    "sysadmin": (
        "System engineer / administrator",
        ["Systemadministrator", "Systemingenieur", "System Engineer", "Systemtechniker", "Windows Administrator",
         "Linux Administrator", "Administrateur système", "Ingénieur système"],
        r"system.?(?:administra|engineer|ingenieur|techni|spezialist|specialist)|sysadmin|(?:windows|linux|server).?(?:administra|engineer)"
        r"|administrateur.?syst|ingénieur.?syst",
    ),
    "network": (
        "Network engineer",
        ["Netzwerkingenieur", "Netzwerktechniker", "Network Engineer", "Netzwerkadministrator", "Network Administrator",
         "Ingénieur réseau", "Technicien réseau"],
        r"netzwerk|network|\bwlan\b|firewall|ingénieur.?réseau|technicien.?réseau|administrateur.?réseau|réseaux",
    ),
    "security": (
        "IT security",
        ["IT Security", "Cyber Security", "Cybersecurity", "Information Security", "Security Engineer",
         "IT-Sicherheit", "Informationssicherheit", "Sécurité informatique"],
        r"security|sicherheit|cyber|\bciso\b|\bsoc\b.?analyst|pentest|sécurité",
    ),
    "dataeng": (
        "Data engineer / Data scientist",
        ["Data Engineer", "Data Scientist", "Machine Learning", "Big Data", "Dateningenieur", "ETL Developer",
         "Ingénieur de données", "Data Scientist"],
        r"data.?engineer|data.?scien|dateningenieur|daten.?wissenschaft|machine.?learning|\bml\b.?engineer|big.?data"
        r"|\betl\b|ingénieur.?(?:de )?données|\bai\b.?engineer",
    ),
    "qa": (
        "Software tester / QA",
        ["Software Tester", "Softwaretester", "QA Engineer", "Test Engineer", "Testmanager", "Test Analyst",
         "Testeur logiciel", "Ingénieur test"],
        r"tester|\bqa\b|quality.?assurance|test.?(?:engineer|analyst|manager|automat|ingenieur)|software.?test|testeur"
        r"|testautomatisier",
    ),
    "itpm": (
        "IT project manager",
        ["IT Projektleiter", "ICT Projektleiter", "IT Project Manager", "Projektleiter ICT", "Scrum Master",
         "Product Owner", "Chef de projet informatique", "Chef de projet IT"],
        r"(?:it|ict|informatik|digital|software).{0,15}(?:projektleit|project.?manag|projektmanag|chef.?de.?projet)"
        r"|(?:projektleit|project.?manag|projektmanag|chef.?de.?projet).{0,15}(?:it|ict|informatik|digital|software)\b"
        r"|scrum.?master|product.?owner|\bpmo\b",
    ),
    "business": (
        "Business analyst",
        ["Business Analyst", "Business Analyst IT", "Requirements Engineer", "Anforderungsanalyst",
         "Analyste métier", "Analyste fonctionnel"],
        r"business.?analy|requirements.?engineer|anforderungs|analyste.?(?:métier|fonctionnel|d'affaires)|\bba\b",
    ),
    "ux": (
        "UX / UI designer",
        ["UX Designer", "UI Designer", "UX/UI", "Product Designer", "Interaction Designer", "UX Researcher",
         "Designer UX"],
        r"\bux\b|\bui\b|ux/ui|user.?(?:experience|interface)|product.?designer|interaction.?design|usability",
    ),
    "erp": (
        "SAP / ERP consultant",
        ["SAP Berater", "SAP Consultant", "ERP Consultant", "ERP Berater", "SAP Entwickler", "Dynamics 365",
         "Consultant SAP"],
        r"\bsap\b|\berp\b|dynamics.?(?:365|ax|nav)|abap|s/4",
    ),
    "people": (
        "People analyst / HR tech",
        ["People Analyst", "People Analytics", "HR Analyst", "HR Data Analyst", "HRIS", "HR-Informatik",
         "HR Systems Specialist", "Analyste RH"],
        r"people.?analy|\bhris\b|hr.?(?:data|analyst|informatik|system|tech)|analyste.?rh",
    ),
    "product": (
        "Product manager",
        ["Product Manager", "Produktmanager Digital", "Digital Product Manager", "Chef de produit digital"],
        r"product.?manag|produkt.?manag|chef.?de.?produit",
    ),
    "marketing": (
        "Digital marketing / web analytics",
        ["Online Marketing", "Digital Marketing", "SEO", "SEA", "Web Analytics", "Performance Marketing",
         "Marketing digital"],
        r"online.?marketing|digital.?marketing|marketing.?digital|\bseo\b|\bsea\b|web.?analytic|performance.?marketing",
    ),
    "techsales": (
        "IT sales / customer success",
        ["Customer Success Manager", "IT Sales", "Pre-Sales", "Solution Consultant", "Account Manager IT",
         "Ingénieur commercial IT"],
        r"customer.?success|pre.?sales|solution.?consultant|\b(?:it|ict|tech)\b.?(?:sales|vertrieb|verkauf)"
        r"|account.?manager.{0,12}\b(?:it|ict)\b|\b(?:it|ict)\b.{0,12}account.?manager",
    ),
    "recruiting": (
        "Tech recruiter",
        ["IT Recruiter", "Tech Recruiter", "ICT Recruiter"],
        r"\b(?:it|ict|tech)\b.?recruit",
    ),
}

# Ads must also look like IT at all (the job-room keyword search is loose: "Support" matches nursing jobs).
IT_GUARD = re.compile(
    r"informati|développ|ingénieur.{0,10}(?:logiciel|système)|\bit\b|\bict\b|software|web|daten|data|system|netzwerk|network|cloud|digital|developer|entwickl"
    r"|support|helpdesk|service.?desk|bi\b|analyst|sql|python|javascript"
    r"|devops|\bux\b|\bui\b|\bsap\b|\berp\b|security|sicherheit|cyber"
    r"|people.?analy|\bhris\b|hr.?(?:data|analyst)|product.?manag|produkt.?manag|digital.?marketing|online.?marketing"
    r"|web.?analyt|customer.?success|pre.?sales|\b(?:it|ict|tech).?(?:sales|recruit)", re.I)

# skill id -> regex (matched on lowercased title + description)
SKILLS = {
    "JavaScript": r"javascript|\bjs\b", "TypeScript": r"typescript", "React": r"\breact\b", "Angular": r"angular",
    "Vue": r"\bvue", "Node.js": r"node\.?js", "HTML/CSS": r"\bhtml|\bcss", "PHP": r"\bphp", "Java": r"\bjava\b",
    "C#/.NET": r"c#|\.net\b|dotnet", "Python": r"python", "SQL": r"\bsql\b|t-sql|mysql|postgres|mssql",
    "Git": r"\bgit\b|github|gitlab", "Docker": r"docker|container", "Kubernetes": r"kubernetes|\bk8s",
    "Azure": r"azure", "AWS": r"\baws\b|amazon web", "Cloud": r"\bcloud", "Linux": r"linux",
    "Windows": r"windows", "Microsoft 365": r"microsoft 365|\bm365|office 365|o365|exchange online|sharepoint|microsoft teams|ms teams",
    "Active Directory": r"active directory|\bentra id|azure ad\b", "Intune/MDM": r"intune|\bmdm\b|jamf",
    "Networking": r"netzwerk|network|tcp/ip|\blan\b|wlan|firewall|switch|vpn", "ITIL": r"\bitil",
    "Ticketing": r"ticket|servicenow|jira|topdesk", "Hardware": r"hardware|drucker|printer|pc-|notebook",
    "Power BI": r"power ?bi", "Excel": r"excel", "Tableau": r"tableau", "R": r"\br\b(?= |,|/)",
    "SAP": r"\bsap\b", "Security": r"security|sicherheit|cyber", "Scrum/Agile": r"scrum|agil",
    "API/REST": r"\bapi\b|rest(?:ful)?\b",
}
SKILLS = {k: re.compile(v, re.I) for k, v in SKILLS.items()}

# Entry barriers that matter for refugees and migrants (what Powercoders coaches around).
BARRIERS = {
    "german_required": re.compile(
        r"(?:sehr gute|gute|fliessende?|fließende?|stilsichere?|verhandlungssichere?)\s+deutsch|deutsch\s*(?:\(|-)?\s*"
        r"(?:c1|c2|b2|muttersprache|fliessend|fließend|in wort und schrift|zwingend|verhandlungssicher|stilsicher)"
        r"|deutsch als muttersprache|german\s*\((?:c1|c2|b2|fluent|native)|fluent (?:in )?german|native german", re.I),
    "french_required": re.compile(
        r"(?:sehr gute|gute|fliessende?)\s+französisch|français.{0,25}(?:courant|maternelle|c1|b2)|fluent (?:in )?french"
        r"|langue maternelle française", re.I),
    "degree_required": re.compile(
        r"\befz\b|lehre|abgeschlossene (?:berufs)?(?:ausbildung|lehre)|fachhochschul|\bfh\b|hochschul|universit"
        r"|bachelor|master|\beth\b|cfc\b|diplôme|degree in", re.I),
    "senior_experience": re.compile(
        r"(?:mindestens|min\.|mehrjährige|langjährige|\b[3-9]\+?\s*(?:-\s*\d+\s*)?jahre?|\b[3-9]\+?\s*years)"
        r"|several years|plusieurs années", re.I),
    "english_ok": re.compile(r"english|englisch|anglais", re.I),
    # not a barrier but the opposite: the ad says it is open to beginners (question A: entry-level and junior roles)
    "entry_level": re.compile(
        r"\bjunior|einsteiger|berufseinst|quereinst|career chang|trainee|praktikum|praktikant|internship|\bintern\b"
        r"|stagiaire|\bstage\b|lehrabgänger|young professional|graduate|débutant", re.I),
}


def classify(title: str) -> list[str]:
    t = title.lower()
    return [rid for rid, (_, _, rx) in ROLES.items() if re.search(rx, t, re.I)]


# Recruiting and staffing agencies post on behalf of unnamed employers. For question C (who should we talk to)
# they are a different kind of contact, so the dashboard lists them apart. Extend freely.
AGENCY = re.compile(
    r"myitjob|yellowshark|freestar|avec compétence|spotted|jobup|jobs\.ch|adecco|randstad|manpower|hays\b|michael page"
    r"|robert walters|kelly services|universal.?job|interiman|coople|careerplus|gi group|experis|page personnel|nemensis"
    r"|it-recruit|recruit|staffing|personal(?:beratung|dienst|vermittlung)?\s+ag|personal\b|stellenvermittlung"
    r"|unternehmensberatung|personalberatung|coopers group|nonstop consulting|headhunt|executive search|talent", re.I)


# An ad is open to beginners when its text says so (BARRIERS["entry_level"]) or job-room's experience field says none
# or under a year, AND its title is not a senior one: requirement lists mention «graduate» or «Praktikum» in senior
# ads too (21.11.2026: «Senior Cyber Security Engineer» was counted). Used by the export and the summary email.
ENTRY_EXPERIENCE = {"NO_EXPERIENCE", "LESS_THAN_1_YEAR"}
SENIOR_TITLE = re.compile(
    r"\b(?:senior|sr\.|lead|leiter\w*|leitung|head|principal|chef|cheffe|manager\w*|expert\w*|architekt\w*|architect"
    r"|director|direktor\w*|responsable)\b|projektleit|teamleit|bereichsleit|gesamtleit|chef de projet", re.I)


def is_entry_ad(title, tags, experience):
    if SENIOR_TITLE.search(title or ""):
        return False
    return "entry_level" in (tags or []) or experience in ENTRY_EXPERIENCE


# ── Requirement details (Isabella, 21.11.2026): language level per language, degree type, years of experience ──
# Read from the same full text as the skills (the text itself is never stored). Each tag is «lang:de:C1»,
# «degree:bachelor», «exp:3»; an ad can carry several (e.g. «Bachelor or EFZ»).
_LANGS = {
    "de": r"deutsch|german|allemand",
    "fr": r"franz(?:ö|oe)sisch|french|fran(?:ç|c)ais",
    "en": r"englisch|english|anglais",
}
_CEFR = r"\b([abc][12])\b"
_CLAUSE = re.compile(r"[,;.\n()/]|\s(?:und|and|et|sowie|as well as|or|oder|ou)\s", re.I)
_LEVEL_WORDS = [
    (re.compile(r"muttersprache|native|langue maternelle|erstsprache", re.I), "C2"),
    (re.compile(r"verhandlungssicher|fliessend|flie(?:ß|ss)end|fluent|courant|stilsicher|business fluent", re.I), "C1"),
    (re.compile(r"sehr gute|very good|excellent|ausgezeichnete", re.I), "C1"),
    (re.compile(r"(?<!sehr )(?<!very )\bgute|(?<!very )\bgood\b|\bbonne|\bsolide", re.I), "B2"),
    (re.compile(r"grundkenntnisse|basic|notions|von vorteil|advantage|un atout", re.I), "B1"),
]
_DEGREES = [
    ("phd", re.compile(r"\bphd\b|doktor|doctorate|doctorat", re.I)),
    ("master", re.compile(r"\bmaster|\bmsc\b|\beth\b|\bepfl\b|universit(?:ä|ae|y|é)", re.I)),
    ("bachelor", re.compile(r"bachelor|\bbsc\b|\bfh\b|fachhochschule|\bhes\b|\bhf\b|höhere fachschule|hoehere fachschule", re.I)),
    ("vocational", re.compile(r"\befz\b|\bcfc\b|lehre\b|berufslehre|apprentissage|apprenticeship|lehrabschluss|informatiker\s*efz", re.I)),
]
_YEARS = re.compile(
    r"(?:mindestens|min\.?|at least|au moins|plus de|über|ueber)?\s*(\d{1,2})\s*\+?\s*(?:-|bis|to|à)?\s*\d{0,2}\s*\+?\s*"
    r"(?:jahre?n?|years?|ans|yrs)\b[^.\n]{0,40}?(?:erfahrung|experience|expérience|berufserfahrung)", re.I)


def requirement_tags(text):
    """Tags for one ad's full text: language level per language, degree types, the years of experience asked."""
    t = text.lower()
    tags = set()
    for lang, rx in _LANGS.items():
        for m in re.finditer(rx, t):
            # only the clause of this language word: up to the nearest comma, semicolon, full stop or «und/and/et/sowie»
            left = max([0] + [x.end() for x in _CLAUSE.finditer(t, max(0, m.start() - 60), m.start())])
            right_m = _CLAUSE.search(t, m.end(), m.end() + 60)
            clause = t[left: right_m.start() if right_m else m.end() + 60]
            lv = re.search(_CEFR, clause)
            if lv:
                tags.add(f"lang:{lang}:{lv.group(1).upper()}")
                continue
            for wrx, level in _LEVEL_WORDS:
                if wrx.search(clause):
                    tags.add(f"lang:{lang}:{level}")
                    break
    for name, rx in _DEGREES:
        if rx.search(t):
            tags.add(f"degree:{name}")
    years = [int(m.group(1)) for m in _YEARS.finditer(t) if 0 < int(m.group(1)) <= 20]
    if years:
        tags.add(f"exp:{min(years)}")
    # one level per language: keep the highest named
    order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    best = {}
    for tg in [x for x in tags if x.startswith("lang:")]:
        _, lang, lv = tg.split(":")
        if lang not in best or order.index(lv) > order.index(best[lang]):
            best[lang] = lv
    tags = {x for x in tags if not x.startswith("lang:")} | {f"lang:{k}:{v}" for k, v in best.items()}
    return sorted(tags)
