"""Dance/NYC listings board: auditions, choreographic opportunities and funding. Source id: dancenyc.

Each category is a list of 8 listings per page (/for-artists/listings/<page>/Category-<name>). Recent listings are
opened for their Location line, and only those in New York City are kept. Listings are user-posted.
"""
import html
import re
import time
import urllib.request
from datetime import date, timedelta

from .dates import explicit_deadline
from .playbill import borough_of

NAME = "dancenyc"
NYC_ONLY = True
BASE = "https://www.dance.nyc"
USER_AGENT = "creative-opportunities-finder-class-project"
PAGES_PER_CATEGORY = 5
RECENT_DAYS = 62
CATEGORIES = {"Auditions": "audition", "Choreographic-Opportunities": "open_call", "Funding-Opportunities": "grant"}

LISTING_LINK = re.compile(r'href="(/for-artists/listings/(20\d\d)/(\d\d)/[^"]+)"')
FIELD = re.compile(r"(?:Company|Location|Compensation):")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(text):
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", text or "", flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text)).replace("\xa0", " ")).strip()


def listing_urls(page, today, recent_days=RECENT_DAYS):
    """Links on a category page to listings posted in the last recent_days days."""
    cutoff = today - timedelta(days=recent_days)
    found = []
    for path, year, month in LISTING_LINK.findall(page):
        if date(int(year), int(month), 1) >= date(cutoff.year, cutoff.month, 1) and path not in found:
            found.append(path)
    return found


def parse_listing(page):
    """Title, company, location, compensation and body of one listing page.

    The page runs the labels together ('Company: X Location: Y Compensation: Z' and then the description with
    nothing between), so company and location end at the next label, and compensation is its first few words.
    """
    text = clean(page)
    title = clean(re.search(r"<title[^>]*>(.*?)</title>", page, re.S).group(1)).split(" | Dance/NYC")[0] if "<title" in page else ""
    start = text.find("Share | Print | Download")
    body = text[start + len("Share | Print | Download"):] if start >= 0 else text
    end = body.find("< back")
    body = (body[:end] if end >= 0 else body).strip()
    head = body[:700]
    fields = {}
    m = re.search(r"Company:\s*(.*?)\s+(?=Location:|Compensation:)", head)
    if m:
        fields["company"] = m.group(1)
    m = re.search(r"Location:\s*(.*?)\s+(?=Compensation:)", head)
    if m:
        fields["location"] = m.group(1)
    labels = list(re.finditer(r"(?:Company|Location|Compensation):", head))
    rest = body[labels[-1].end():].strip() if labels else body
    if "Compensation:" in head:
        fields["compensation"] = rest[:90].rsplit(" ", 1)[0] if len(rest) > 90 else rest
    return {"title": title, **fields, "body": re.sub(r"\s+", " ", rest).strip()}


def borough_for(listing):
    """Borough from the Location line; for a listing with no Location, 'unknown' when the text says NYC."""
    place = listing.get("location", "")
    if place:
        return borough_of(place)
    return "unknown" if re.search(r"\bNYC\b|New York, NY|New York City", listing["body"][:700]) else None


def fetch(today=None):
    today = today or date.today()
    items = []
    for category in CATEGORIES:
        for n in range(1, PAGES_PER_CATEGORY + 1):
            time.sleep(0.8)
            try:
                page = get(f"{BASE}/for-artists/listings/{'' if n == 1 else str(n) + '/'}Category-{category}")
            except OSError:
                break
            urls = listing_urls(page, today)
            if not urls:
                break
            for path in urls:
                time.sleep(0.8)
                try:
                    listing = parse_listing(get(BASE + path))
                except OSError:
                    continue
                items.append({**listing, "category": category, "url": BASE + path})
    seen, out = set(), []
    for it in items:
        if it["url"] not in seen:
            seen.add(it["url"])
            out.append(it)
    return out


def to_record(item):
    borough = borough_for(item)
    if borough is None or not item.get("title"):
        return None
    where = f", {item['location']}" if item.get("location") else ""
    pay = f" Compensation: {item['compensation']}." if item.get("compensation") else ""
    return {
        "source": NAME,
        "title": item["title"],
        "opportunity_type": CATEGORIES[item["category"]],
        "borough": borough,
        "eligibility": [],
        "fee": "unknown",
        "deadline": explicit_deadline(item["body"]),
        "description": f"[category: Dance] {item.get('company', 'Posted on Dance/NYC')}{where}.{pay} {item['body'][:420]}",
        "source_url": item["url"],
    }
