"""Generic source types. One module per type; each has REQUIRED (param names) and run(conn, entry) -> rows stored.

To add a type: drop a module here, list its name in NAMES, document it in docs/adding-a-source.md.
"""
import importlib

NAMES = ["jobroom_search", "pxweb", "odata_search", "rss_keywords", "csv_series", "xlsx_series", "link"]


def get(name):
    return importlib.import_module(f"{__name__}.{name}")
