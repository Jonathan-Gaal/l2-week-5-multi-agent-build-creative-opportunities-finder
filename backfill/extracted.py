"""Records read from crawled pages by the Extractor. Source id: extracted.

Until the Claude API is attached, the Extractor is a person or this Claude session: it reads the pages the crawler
saved (data/pages/) and writes one entry per opportunity into backfill/extracted.json. The same file will hold what
the API Extractor produces later. Each entry must carry a quote copied from the page, and this module checks the
quote against the saved page, so a record the page does not support is rejected instead of stored.

Entry fields: title, type (open_call, residency, grant, audition, open_mic), borough (manhattan, brooklyn, queens,
bronx, staten_island, or unknown), category (artist discipline), deadline (YYYY-MM-DD, "rolling" or null),
source_url, quote, and optionally fee, eligibility (list), organization, note.

Check the file without running a backfill: python -m backfill.extracted
"""
import json
import os
import re
import sys
from datetime import date

NAME = "extracted"
NYC_ONLY = False  # each entry names its borough; one without a borough is not stored
PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "extracted.json")
PAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "pages")

TYPES = {"open_call", "residency", "grant", "audition", "open_mic"}
BOROUGHS = {"manhattan", "brooklyn", "queens", "bronx", "staten_island"}
# citywide: open across NYC. unknown: in NYC but the borough is not stated. Both need nyc_basis, a quote showing NYC.
NYC_ONLY_BOROUGHS = {"citywide", "unknown"}
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def norm(text):
    return re.sub(r"\s+", " ", (text or "").replace("’", "'").replace("“", '"').replace("”", '"')).strip().lower()


def load(path=PATH):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        return []


def manual_text(url, pages_dir):
    """Text of a page a person saved by hand into data/pages/manual/: a .txt file whose first line is 'URL: <address>'."""
    folder = os.path.join(pages_dir, "manual")
    if not os.path.isdir(folder):
        return None
    for name in os.listdir(folder):
        if name.endswith(".txt"):
            with open(os.path.join(folder, name), encoding="utf-8", errors="replace") as f:
                first, _, rest = f.read().partition("\n")
            if first.strip().lower().startswith("url:") and first.split(":", 1)[1].strip().rstrip("/") == url.rstrip("/"):
                return rest
    return None


def page_text(url, pages_dir=PAGES_DIR):
    """The saved text of a page: one the crawler saved, or one saved by hand. None when neither exists."""
    if not os.path.isdir(pages_dir):
        return None
    by_hand = manual_text(url, pages_dir)
    if by_hand is not None:
        return by_hand
    for host in os.listdir(pages_dir):
        index = os.path.join(pages_dir, host, "_index.json")
        if not os.path.exists(index):
            continue
        with open(index, encoding="utf-8") as f:
            for entry in json.load(f).get("pages", []):
                if entry["url"].rstrip("/") == url.rstrip("/"):
                    with open(os.path.join(pages_dir, host, entry["id"] + ".json"), encoding="utf-8") as pf:
                        return json.load(pf)["text"]
    return None


def problems(item, pages_dir=PAGES_DIR, today=None):
    """Why an entry cannot be stored; an empty list means it can."""
    found = []
    for field in ("title", "type", "borough", "category", "source_url", "quote"):
        if not item.get(field):
            found.append(f"missing {field}")
    if item.get("type") and item["type"] not in TYPES:
        found.append(f"unknown type {item['type']}")
    if item.get("borough") and item["borough"] not in BOROUGHS | NYC_ONLY_BOROUGHS:
        found.append("borough must be one of the five boroughs, citywide or unknown")
    if item.get("borough") in NYC_ONLY_BOROUGHS and not item.get("nyc_basis"):
        found.append("citywide or unknown borough needs nyc_basis, a quote from the page showing it is in NYC")
    deadline = item.get("deadline")
    if deadline not in (None, "rolling") and not (isinstance(deadline, str) and ISO.match(deadline)):
        found.append(f"deadline {deadline!r} is not YYYY-MM-DD, rolling or null")
    if item.get("quote") and item.get("source_url") and not found:
        text = page_text(item["source_url"], pages_dir)
        if text is None:
            found.append("page was not saved by the crawler, so the quote cannot be checked")
        elif norm(item["quote"]) not in norm(text):
            found.append("quote does not appear in the saved page")
        elif item.get("nyc_basis") and norm(item["nyc_basis"]) not in norm(text):
            found.append("nyc_basis does not appear in the saved page")
    return found


def fetch():
    return load()


def to_record(item):
    if problems(item, PAGES_DIR):
        return None
    note = item.get("note") or ""
    return {
        "source": NAME,
        "title": item["title"],
        "opportunity_type": item["type"],
        "borough": item["borough"],
        "nyc_confirmed": True,
        "eligibility": item.get("eligibility") or [],
        "fee": item.get("fee") or "unknown",
        "deadline": item.get("deadline"),
        "description": " ".join(part for part in (item.get("organization"), note, item["quote"]) if part)[:900],
        "source_url": item["source_url"],
    }


def categories(path=PATH):
    return {e["source_url"]: e["category"] for e in load(path) if e.get("source_url") and e.get("category")}


def main():
    entries = load()
    bad = 0
    for e in entries:
        why = problems(e)
        if why:
            bad += 1
            print(f"REJECT {e.get('title', '?')[:60]}: {'; '.join(why)}")
    print(f"{len(entries) - bad} of {len(entries)} entries pass")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
