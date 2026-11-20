"""Minimal .xlsx reader on the standard library (zipfile + xml). Enough for the plain statistics tables SEM and BFS
publish: it returns the cell text/number of every sheet, no formulas, no styles.
"""
import io
import re
import xml.etree.ElementTree as ET
import zipfile

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def read(data: bytes) -> dict:
    """-> {sheet name: {row number: {column letters: cell value as str}}} (sheet order kept)."""
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(M + "si"):
            shared.append("".join(t.text or "" for t in si.iter(M + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out = {}
    for sheet in ET.fromstring(z.read("xl/workbook.xml")).find(M + "sheets"):
        target = rels[sheet.get(R + "id")].lstrip("/")
        path = target if target.startswith("xl/") else "xl/" + target
        rows = {}
        for row in ET.fromstring(z.read(path)).iter(M + "row"):
            cells = {}
            for c in row.findall(M + "c"):
                col = re.match(r"[A-Z]+", c.get("r")).group()
                t, v = c.get("t"), c.find(M + "v")
                if t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(M + "t"))
                elif v is None:
                    continue
                elif t == "s":
                    val = shared[int(v.text)]
                else:
                    val = v.text
                cells[col] = val
            rows[int(row.get("r"))] = cells
        out[sheet.get("name")] = rows
    return out


def number(s):
    """'1.5E-2' -> 0.015; text such as '-', '()', 'X' -> None."""
    try:
        return float(str(s).strip())
    except (TypeError, ValueError):
        return None
