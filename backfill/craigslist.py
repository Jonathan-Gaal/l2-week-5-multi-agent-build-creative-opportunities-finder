"""Craigslist New York gig listings for artists, one search per borough and category. Source id: craigslist.

Craigslist splits New York into borough areas, so the borough comes from the address of the search page.
Categories: talent gigs, creative gigs, writing gigs and musicians. Search pages are read, not the posts
themselves, so a record has the title, pay, neighborhood and link. robots.txt allows search pages.
Craigslist's terms prohibit scraping; see source-research.md section 7 for the decision to proceed.
"""
import html
import re
import time
import urllib.request

NAME = "craigslist"
NYC_ONLY = True
BASE = "https://newyork.craigslist.org"
USER_AGENT = "creative-opportunities-finder-class-project"
DELAY_SECONDS = 1.2
PER_SEARCH = 60  # newest listings kept from each borough and category

BOROUGHS = {"mnh": "manhattan", "brk": "brooklyn", "que": "queens", "brx": "bronx", "stn": "staten_island"}
# category code -> (artist category, what the listing is)
CATEGORIES = {
    "tlg": ("Performing arts", "Talent gig"),
    "crg": ("Visual art", "Creative gig"),
    "wrg": ("Writing & publishing", "Writing gig"),
    "muc": ("Music", "Musician listing"),
}
# A listing is kept only if its title names the kind of work its category is for.
RELEVANT = {
    "tlg": re.compile(r"actor|actress|model|danc|perform|cast|talent|extra|sing|music|audition|comed|host|entertain|voice|film|video|shoot|"
                      r"commercial|stunt|drag|bartend\w* show|mc\b|dj\b|emcee|improv|theat|photo", re.I),
    "crg": re.compile(r"artist|illustrat|design|paint|mural|photograph|video|creative|animat|graphic|sculpt|\bart\b|draw|"
                      r"film|edit|logo|tattoo|craft|studio|exhibit|gallery|comic|storyboard", re.I),
    "wrg": re.compile(r"writ|editor|edit|copy|content|blog|journal|script|poet|author|ghost|story|book|screenplay|"
                      r"proofread|narrat|essay|lyric", re.I),
    "muc": re.compile(r"music|band|sing|drum|guitar|bass|vocal|keyboard|produc|\bdj\b|songwrit|rehears|jam|gig|piano|violin|"
                      r"cello|horn|sax|trumpet|choir|orchestra|session|composer|open mic|looking for", re.I),
}
RESULT = re.compile(r'<li class="cl-static-search-result"[^>]*title="([^"]*)"[^>]*>\s*<a href="([^"]+)">(.*?)</a>', re.S)
PRICE = re.compile(r'<div class="price">\s*([^<]*?)\s*</div>')
LOCATION = re.compile(r'<div class="location">\s*([^<]*?)\s*</div>')


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def parse_results(page, borough, category):
    items = []
    for title, link, inner in RESULT.findall(page):
        price = PRICE.search(inner)
        place = LOCATION.search(inner)
        items.append({"title": html.unescape(title).strip(), "url": html.unescape(link), "borough": borough,
                      "category": category, "price": html.unescape(price.group(1)) if price else "",
                      "hood": html.unescape(place.group(1)) if place else ""})
    return items[:PER_SEARCH]


def fetch():
    items = []
    for code, borough in BOROUGHS.items():
        for category in CATEGORIES:
            time.sleep(DELAY_SECONDS)
            try:
                items += parse_results(get(f"{BASE}/search/{code}/{category}"), borough, category)
            except OSError:
                continue
    return items


def to_record(item):
    label, kind = CATEGORIES[item["category"]]
    if len(item["title"]) < 8 or not RELEVANT[item["category"]].search(item["title"]):
        return None
    paid = re.fullmatch(r"\$\s?([\d,]+)(?:\.\d+)?", item["price"] or "")
    fee = f"pays ${paid.group(1)}" if paid and paid.group(1).strip("0,") else "unknown"
    place = f" in {item['hood']}" if item["hood"] else ""
    return {
        "source": NAME,
        "title": item["title"],
        "opportunity_type": "gig",
        "borough": item["borough"],
        "eligibility": [],
        "fee": fee,
        "deadline": None,
        "description": f"[category: {label}] {kind}{place}, {item['borough'].replace('_', ' ').title()}. {item['title']}",
        "source_url": item["url"],
    }
