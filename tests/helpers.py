"""Test helpers: a tiny .xlsx writer (so no binary fixtures are needed) and an in-memory database."""
import io
import zipfile
from xml.sax.saxutils import escape


def make_xlsx(sheets):
    """sheets: {name: [[cell, ...], ...]} (row lists, None = empty). Strings become inline strings."""
    z_io = io.BytesIO()
    with zipfile.ZipFile(z_io, "w") as z:
        names = list(sheets)
        z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        z.writestr("xl/workbook.xml",
                   '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + "".join(f'<sheet name="{escape(n)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, n in enumerate(names))
                   + "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + "".join(f'<Relationship Id="rId{i + 1}" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(names)))
                   + "</Relationships>")
        for i, n in enumerate(names):
            rows = ""
            for r, row in enumerate(sheets[n], 1):
                cells = ""
                for c, v in enumerate(row):
                    if v is None:
                        continue
                    ref = f"{chr(65 + c)}{r}"
                    if isinstance(v, (int, float)):
                        cells += f'<c r="{ref}"><v>{v}</v></c>'
                    else:
                        cells += f'<c r="{ref}" t="inlineStr"><is><t>{escape(v)}</t></is></c>'
                rows += f'<row r="{r}">{cells}</row>'
            z.writestr(f"xl/worksheets/sheet{i + 1}.xml",
                       '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                       f"<sheetData>{rows}</sheetData></worksheet>")
    return z_io.getvalue()
