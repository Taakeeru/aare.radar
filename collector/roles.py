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
}

# Ads must also look like IT at all (the job-room keyword search is loose: "Support" matches nursing jobs).
IT_GUARD = re.compile(
    r"informati|développ|ingénieur.{0,10}(?:logiciel|système)|\bit\b|\bict\b|software|web|daten|data|system|netzwerk|network|cloud|digital|developer|entwickl"
    r"|support|helpdesk|service.?desk|bi\b|analyst|sql|python|javascript", re.I)

# skill id -> regex (matched on lowercased title + description)
SKILLS = {
    "JavaScript": r"javascript|\bjs\b", "TypeScript": r"typescript", "React": r"\breact\b", "Angular": r"angular",
    "Vue": r"\bvue", "Node.js": r"node\.?js", "HTML/CSS": r"\bhtml|\bcss", "PHP": r"\bphp", "Java": r"\bjava\b",
    "C#/.NET": r"c#|\.net\b|dotnet", "Python": r"python", "SQL": r"\bsql\b|t-sql|mysql|postgres|mssql",
    "Git": r"\bgit\b|github|gitlab", "Docker": r"docker|container", "Kubernetes": r"kubernetes|\bk8s",
    "Azure": r"azure", "AWS": r"\baws\b|amazon web", "Cloud": r"\bcloud", "Linux": r"linux",
    "Windows": r"windows", "Microsoft 365": r"microsoft 365|\bm365|office 365|o365|exchange online|sharepoint|teams",
    "Active Directory": r"active directory|\bentra\b|azure ad|\bad\b", "Intune/MDM": r"intune|\bmdm\b|jamf",
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
}


def classify(title: str) -> list[str]:
    t = title.lower()
    return [rid for rid, (_, _, rx) in ROLES.items() if re.search(rx, t, re.I)]
