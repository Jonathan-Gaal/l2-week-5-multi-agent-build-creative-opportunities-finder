"""Playbill Jobs board: performer and musician listings in New York. Source id: playbill.

The jobs page is a list of tiles (category, title, company and place, date, link). Only tiles in the Performer
and Musician categories whose place is in New York are kept. The terms page for playbill.com was not found;
its robots.txt allows search use. See source-research.md section 7.
"""
import html
import re
import time
import urllib.request
from datetime import date

from .a4 import ZIP_BOROUGH
from .dates import explicit_deadline

NAME = "playbill"
NYC_ONLY = True
URL = "https://playbill.com/jobs"
USER_AGENT = "creative-opportunities-finder-class-project"
PAGES = 3  # the main page plus ?page=2 and ?page=3, if the site serves them
KEEP = {"Performer": "Performing arts", "Musician": "Music"}

TILE = re.compile(
    r'<div class="pb-tile-category">(.*?)</div>.*?<div class="pb-tile-title">(.*?)</div>\s*'
    r'<div class="pb-tile-location">(.*?)</div>\s*<div class="pb-tile-post-date">(.*?)</div>', re.S)
LINK = re.compile(r'<a href="(https://playbill\.com/job/[^"]+)"')
BOROUGH_WORDS = [("staten island", "staten_island"), ("brooklyn", "brooklyn"), ("bronx", "bronx"),
                 ("queens", "queens"), ("long island city", "queens"), ("harlem", "manhattan"), ("manhattan", "manhattan")]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def place_of(location_html):
    """(company, place) from 'Company<br>City, ST<br>US'."""
    parts = [clean(p) for p in re.split(r"<br\s*/?>", location_html) if clean(p)]
    return (parts[0] if parts else ""), (parts[1] if len(parts) > 2 else "")


def borough_of(place):
    """The NYC borough a place names, 'unknown' for New York or NYC with no borough, or None outside NYC."""
    low = place.lower()
    for word, borough in BOROUGH_WORDS:
        if word in low:
            return borough
    if re.search(r"\b(new york|nyc|ny)\s*,\s*ny\b", low) or low in ("new york, ny", "nyc, ny"):
        return "unknown"
    return None


def nyc_marker(text):
    """A borough ('unknown' if none is named) when the text puts something in New York City, else None."""
    zip_match = re.search(r"\b(?:NY|New York)\s*,?\s*(1\d\d)\d{2}\b", text)
    if zip_match and zip_match.group(1) in ZIP_BOROUGH:
        return ZIP_BOROUGH[zip_match.group(1)]
    low = text.lower()
    for word, borough in BOROUGH_WORDS:
        if word in low:
            return borough
    if re.search(r"\bnyc\b|new york city|new york, ny", low):
        return "unknown"
    return None


VAGUE_PLACES = ("", "NY", "New York")  # a tile with no city: its description may say where the work is


def borough_for(item):
    """Where a listing is: the tile's place, else NYC wording in the title, else (for a vague place) its description."""
    borough = borough_of(item["place"])
    if borough:
        return borough
    in_title = nyc_marker(item["title"])
    if in_title:
        return in_title
    if item["place"] in VAGUE_PLACES:
        return nyc_marker(item.get("detail", ""))
    return None


def parse_page(page):
    items = []
    for block in page.split('<div class="loadmore-item">')[1:]:
        tile, link = TILE.search(block), LINK.search(block)
        if not tile or not link:
            continue
        category, title, location, posted = clean(tile.group(1)), clean(tile.group(2)), tile.group(3), clean(tile.group(4))
        company, place = place_of(location)
        items.append({"category": category, "title": title, "company": company, "place": place,
                      "posted": posted, "url": link.group(1)})
    return items


def detail_text(page):
    """The description on a job page: the text after 'Job Details DESCRIPTION'."""
    text = clean(re.sub(r"<(script|style)\b.*?</\1>", " ", page, flags=re.S))
    start = text.find("DESCRIPTION")
    body = text[start + len("DESCRIPTION"):] if start >= 0 else ""
    # the page ends with other jobs' titles, which carry their own deadlines
    return body.split("Related Jobs")[0].strip()


def fetch():
    items = []
    for n in range(1, PAGES + 1):
        try:
            items += parse_page(get(URL if n == 1 else f"{URL}?page={n}"))
        except OSError:
            break
        time.sleep(1.0)
    seen, out = set(), []
    for it in items:
        if it["url"] not in seen:
            seen.add(it["url"])
            out.append(it)
    for it in out:  # open the performer and musician listings that are in New York or do not say where they are
        if it["category"] in KEEP and (borough_of(it["place"]) or it["place"] in VAGUE_PLACES):
            time.sleep(0.8)
            try:
                it["detail"] = detail_text(get(it["url"]))
            except OSError:
                it["detail"] = ""
    return out


EPA_DATE = re.compile(r"EPA\s*\((\d{1,2})\.(\d{1,2})\.(\d\d)\)")


def deadline_of(item):
    """The title's own deadline, else the date of an Equity Principal Audition named in the title, else one in the
    description. A show's run dates ('through March 14') are not deadlines, so the description uses strict wording."""
    from_title = explicit_deadline(item["title"], strict=True)
    if from_title:
        return from_title
    epa = EPA_DATE.search(item["title"])
    if epa:
        try:
            return date(2000 + int(epa.group(3)), int(epa.group(1)), int(epa.group(2))).isoformat()
        except ValueError:
            pass
    return explicit_deadline(item.get("detail", ""), strict=True)


def to_record(item):
    if item["category"] not in KEEP:
        return None
    borough = borough_for(item)
    if borough is None:
        return None
    return {
        "source": NAME,
        "title": f"{item['title']} ({item['company']})" if item["company"] else item["title"],
        "opportunity_type": "audition" if item["category"] == "Performer" else "gig",
        "borough": borough,
        "eligibility": [],
        "fee": "unknown",
        "deadline": deadline_of(item),
        "description": f"[category: {KEEP[item['category']]}] {item['category']} listing on Playbill Jobs, posted {item['posted']}. "
                       f"{item['company']}, {item['place']}. {item.get('detail', '')[:420]}",
        "source_url": item["url"],
    }
