"""A4 (Asian American Arts Alliance) opportunity board. Source id: a4.

The board is one HTML page of cards. Each card links to a detail page that has the full address
and the deadline with its year, so the backfill reads the detail page for every card it keeps.
A4's terms prohibit scraping; see source-research.md section 7 for the decision to proceed.
"""
import html
import re
import time
import urllib.request
from datetime import datetime

NAME = "a4"
BASE = "https://www.aaartsalliance.org"
LIST_URL = BASE + "/opportunities"
USER_AGENT = "creative-opportunities-finder-class-project"
DELAY_SECONDS = 1.0  # pause between detail pages; one backfill run, not a crawl

# Board types that are opportunities for artists. Jobs, internships and workshops are skipped.
TYPES = {
    "call for submissions": "open_call",
    "residency": "residency",
    "grant": "grant",
    "fellowship": "grant",
    "audition/casting call": "audition",
    "free or subsidized space": "space",
}

CARD = re.compile(
    r'<div class="opportunity [^"]*">\s*<a href="([^"]+)">.*?'
    r'<div class="col-md-6">\s*(.*?)\s*</div>\s*'
    r'<div class="col-md-3 d-none d-md-flex">\s*(.*?)\s*</div>\s*'
    r'<div class="col-md-3 d-none d-md-flex">\s*(.*?)\s*</div>\s*'
    r'</div>\s*<h2 class="small-title">(.*?)</h2>',
    re.S,
)

# NYC zip codes: 100-102 Manhattan, 103 Staten Island, 104 Bronx, 112 Brooklyn, 111/113/114/116 Queens.
ZIP_BOROUGH = {"100": "manhattan", "101": "manhattan", "102": "manhattan", "103": "staten_island",
               "104": "bronx", "112": "brooklyn", "111": "queens", "113": "queens", "114": "queens",
               "116": "queens"}
BOROUGH_WORDS = [("brooklyn", "brooklyn"), ("bronx", "bronx"), ("staten island", "staten_island"),
                 ("manhattan", "manhattan"), ("queens", "queens")]
NYC_WORDS = re.compile(r"\b(nyc|new york city)\b", re.I)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(text):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def parse_cards(page):
    return [
        {"href": href, "org": clean(org), "type": clean(kind), "list_deadline": clean(due), "title": clean(title)}
        for href, org, kind, due, title in CARD.findall(page)
    ]


def fetch():
    items = []
    for card in parse_cards(get(LIST_URL)):
        if card["type"].lower() not in TYPES:
            continue
        time.sleep(DELAY_SECONDS)
        try:
            card["detail"] = clean(re.sub(r"<(script|style|nav|header)\b.*?</\1>", " ", get(BASE + card["href"]), flags=re.S))
        except OSError:
            card["detail"] = ""
        items.append(card)
    return items


def parse_deadline(detail):
    """ISO date from 'Deadline Dec 15, 2026', 'rolling', or None when the page gives neither."""
    m = re.search(r"Deadline\s+(Rolling|[A-Z][a-z]{2,8} \d{1,2}, \d{4})", detail)
    if not m:
        return None
    if m.group(1) == "Rolling":
        return "rolling"
    for fmt in ("%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(m.group(1), fmt).date().isoformat()
        except ValueError:
            pass
    return None


def address_of(item):
    """The text between the organization name and 'Deadline' on the detail page."""
    head = item["detail"].split(" Deadline ", 1)[0]
    # the organization name also appears in the page title, so take what follows its last mention
    return head.rsplit(item["org"], 1)[1].strip() if item["org"] and item["org"] in head else ""


def location_of(item):
    """(is_nyc, borough) from the address, falling back to NYC wording in the listing text."""
    address = address_of(item)
    zip_match = re.search(r"\bNY\s+(\d{3})\d{2}\b", address)
    if zip_match and zip_match.group(1) in ZIP_BOROUGH:
        return True, ZIP_BOROUGH[zip_match.group(1)]
    for word, borough in BOROUGH_WORDS:
        if word in address.lower():
            return True, borough
    if re.search(r"\bNew York,\s*NY\b", address):
        return True, "unknown"
    if NYC_WORDS.search(f"{item['title']} {item['detail']}"):
        return True, "unknown"
    return False, "unknown"


def body_of(detail):
    """The listing text after 'Posted <date>', without the page title and address header."""
    m = re.search(r"Posted [A-Z][a-z]{2,8} \d{1,2}, \d{4}\s*", detail)
    return detail[m.end():] if m else detail


def to_record(item):
    """Map one board listing to a record, or None if it is not an artist opportunity."""
    kind = TYPES.get(item["type"].lower())
    if kind is None:
        return None
    is_nyc, borough = location_of(item)
    return {
        "source": NAME,
        "title": item["title"],
        "opportunity_type": kind,
        "borough": borough,
        "nyc_confirmed": is_nyc,
        "eligibility": [],  # free text; the Extractor fills this later
        "fee": "unknown",
        "deadline": parse_deadline(item["detail"]),
        "description": body_of(item["detail"]),
        "source_url": BASE + item["href"],
    }
