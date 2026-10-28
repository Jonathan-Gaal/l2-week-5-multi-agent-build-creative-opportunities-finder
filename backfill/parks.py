"""NYC Parks public events feed (next 14 days). Source id: nyc_parks."""
import html
import json
import re
import urllib.request

NAME = "nyc_parks"
URL = "https://www.nycgovparks.org/xml/events_300_rss.json"
NYC_ONLY = True

# Parks IDs start with a borough letter.
BOROUGHS = {"M": "manhattan", "B": "brooklyn", "Q": "queens", "X": "bronx", "R": "staten_island"}

# Order matters: the first match wins.
TYPE_KEYWORDS = [
    ("open_call", ("open call", "call for artists", "call for entries")),
    ("residency", ("residency",)),
]

# Description text often credits funders ("made possible by ... grant program"), so grants match on the title only.
GRANT_TITLE = re.compile(r"\bgrants?\b", re.IGNORECASE)


def fetch():
    with urllib.request.urlopen(URL, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def clean(text):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def borough_of(park_ids):
    letters = {p.strip()[:1].upper() for p in (park_ids or "").split(",") if p.strip()}
    boroughs = {BOROUGHS[l] for l in letters if l in BOROUGHS}
    if len(boroughs) == 1:
        return boroughs.pop()
    return "citywide" if len(boroughs) > 1 else "unknown"


def opportunity_type(title, description):
    text = f"{title} {description}".lower()
    for kind, words in TYPE_KEYWORDS:
        if any(w in text for w in words):
            return kind
    if GRANT_TITLE.search(title):
        return "grant"
    return None


def to_record(item):
    """Map one feed item to a record, or None if it is not an artist opportunity."""
    title = clean(item.get("title"))
    description = clean(item.get("description"))
    kind = opportunity_type(title, description)
    if kind is None:
        return None
    return {
        "source": NAME,
        "title": title,
        "opportunity_type": kind,
        "borough": borough_of(item.get("parkids")),
        "eligibility": [],  # free text; the Extractor fills this later
        "fee": "unknown",
        "deadline": None,  # not a feed field; the Extractor fills this later
        "description": description,
        "source_url": item.get("link") or "",
    }
