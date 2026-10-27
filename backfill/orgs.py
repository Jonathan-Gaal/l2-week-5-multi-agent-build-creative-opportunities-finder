"""Single-page opportunities at NYC arts organizations. Source id: orgs.

Each entry in PAGES is one page for one program, chosen by hand after reading it. The borough, the type and the
artist category are written down here; the title and the deadline are read from the page. A page whose text gives
no deadline can carry one in the entry ("deadline"), and a program that keeps its deadline in an unusual phrase
does the same. Pages are fetched once, a second apart. Several of these organizations' terms are unread or
restrictive; see source-research.md section 7 for the decision to proceed.
"""
import html
import re
import time
import urllib.request
from datetime import date

NAME = "orgs"
NYC_ONLY = True
USER_AGENT = "creative-opportunities-finder-class-project"
DELAY_SECONDS = 1.0

BRONX = "https://www.bronxarts.org"
LMCC = "https://lmcc.net"
SIA = "https://statenislandarts.org/grants/5-kinds-of-grants-find-yours"
BAC = "https://www.brooklynartscouncil.org"

# category is the artist discipline, written by hand until the Extractor does it.
PAGES = [
    # Bronx Council on the Arts
    {"url": f"{BRONX}/cegs", "borough": "bronx", "type": "grant", "category": "All disciplines"},
    {"url": f"{BRONX}/grants/new-work", "borough": "bronx", "type": "grant", "category": "All disciplines"},
    {"url": f"{BRONX}/grants/arts-fund-grant", "borough": "bronx", "type": "grant", "category": "All disciplines"},
    {"url": f"{BRONX}/grants/community-arts-grant", "borough": "bronx", "type": "grant", "category": "All disciplines"},
    {"url": f"{BRONX}/grants/bronx-dance-fund", "borough": "bronx", "type": "grant", "category": "Dance"},
    {"url": f"{BRONX}/grants/bronx-cultural-visions", "borough": "bronx", "type": "grant", "category": "All disciplines"},
    {"url": f"{BRONX}/grants/arts-on-the-block", "borough": "bronx", "type": "grant", "category": "All disciplines"},
    # Lower Manhattan Cultural Council
    {"url": f"{LMCC}/resources/manhattan-arts-grants/creative-engagement/", "borough": "manhattan", "type": "grant", "category": "All disciplines"},
    {"url": f"{LMCC}/resources/manhattan-arts-grants/creative-learning/", "borough": "manhattan", "type": "grant", "category": "All disciplines"},
    {"url": f"{LMCC}/resources/manhattan-arts-grants/umez-arts-engagement/", "borough": "manhattan", "type": "grant", "category": "All disciplines"},
    {"url": f"{LMCC}/resources/manhattan-arts-grants/creative-unrestricted/", "borough": "manhattan", "type": "grant", "category": "All disciplines"},
    # Staten Island Arts
    {"url": f"{SIA}/department-of-cultural-affairs-art-fund-grant/", "borough": "staten_island", "type": "grant", "category": "All disciplines"},
    {"url": f"{SIA}/department-of-cultural-affairs-premier-grants/", "borough": "staten_island", "type": "grant", "category": "All disciplines"},
    {"url": f"{SIA}/nysca-encore-grant/", "borough": "staten_island", "type": "grant", "category": "All disciplines"},
    {"url": f"{SIA}/arts-in-education-grants/", "borough": "staten_island", "type": "grant", "category": "All disciplines"},
    # Queens
    {"url": "https://www.flushingtownhall.org/grants", "borough": "queens", "type": "grant", "category": "All disciplines"},
    # Brooklyn Arts Council (the 2027 cycle closed Oct 11, 2026, so these drop out until the next cycle opens)
    {"url": f"{BAC}/what-we-do/grants/brooklyn-arts-fund", "borough": "brooklyn", "type": "grant", "category": "All disciplines"},
    {"url": f"{BAC}/what-we-do/grants/local-arts-support", "borough": "brooklyn", "type": "grant", "category": "All disciplines"},
    {"url": f"{BAC}/what-we-do-grants-cef", "borough": "brooklyn", "type": "grant", "category": "All disciplines"},
    {"url": f"{BAC}/what-we-do/grants/cultural-entrepreneur-fund", "borough": "brooklyn", "type": "grant", "category": "All disciplines"},
    # Brooklyn
    {"url": "https://www.smackmellon.org/opportunities/artist-studio-program-2027-28/", "borough": "brooklyn", "type": "residency", "category": "Visual art"},
    {"url": "https://www.smackmellon.org/opportunities/open-call-summer-2027-group-show/", "borough": "brooklyn", "type": "open_call", "category": "Visual art"},
    # Manhattan
    {"url": "https://apexart.org/nyc/submit.php", "borough": "manhattan", "type": "open_call", "category": "Visual art",
     "deadline": "2026-10-31", "note": "NYC proposals are accepted Oct. 1 to Oct. 31, 2026"},
    {"url": "https://movementresearch.org/artist-opportunities-and-programs/residency-programs/artist-in-residence/",
     "borough": "manhattan", "type": "residency", "category": "Dance"},
    {"url": "https://here.org/programs/performance-lab/", "borough": "manhattan", "type": "open_call", "category": "Performing arts"},
    {"url": "https://www.printshop.org/keyholder-residency", "borough": "manhattan", "type": "residency", "category": "Visual art"},
    {"url": "https://www.printshop.org/summer-keyholder-residency", "borough": "manhattan", "type": "residency", "category": "Visual art"},
    {"url": "https://www.coloredcolors.com/projects/holidays-at-the-park", "borough": "manhattan", "type": "open_call",
     "category": "Visual art", "deadline": "2026-11-01", "note": "Vendor applications for artists, Hudson Yards; due Nov 1"},
]

TITLES = {
    f"{BRONX}/cegs": "Bronx Council on the Arts: Community Engagement Grants",
    f"{BRONX}/grants/new-work": "Bronx Council on the Arts: New Work grant",
    f"{BRONX}/grants/arts-fund-grant": "Bronx Council on the Arts: Arts Fund grant",
    f"{BRONX}/grants/community-arts-grant": "Bronx Council on the Arts: Community Arts grant",
    f"{BRONX}/grants/bronx-dance-fund": "Bronx Council on the Arts: Bronx Dance Fund",
    f"{BRONX}/grants/bronx-cultural-visions": "Bronx Council on the Arts: Bronx Cultural Visions Fund",
    f"{BRONX}/grants/arts-on-the-block": "Bronx Council on the Arts: Arts on the Block",
    f"{BAC}/what-we-do/grants/brooklyn-arts-fund": "Brooklyn Arts Council: Brooklyn Arts Fund",
    f"{BAC}/what-we-do/grants/local-arts-support": "Brooklyn Arts Council: Local Arts Support",
    f"{BAC}/what-we-do-grants-cef": "Brooklyn Arts Council: Creative Equations Fund",
    f"{BAC}/what-we-do/grants/cultural-entrepreneur-fund": "Brooklyn Arts Council: Cultural Entrepreneur Fund",
    f"{LMCC}/resources/manhattan-arts-grants/creative-engagement/": "LMCC Manhattan Arts Grants: Creative Engagement",
    f"{LMCC}/resources/manhattan-arts-grants/creative-learning/": "LMCC Manhattan Arts Grants: Creative Learning",
    f"{LMCC}/resources/manhattan-arts-grants/umez-arts-engagement/": "LMCC Manhattan Arts Grants: UMEZ Arts Engagement",
    f"{LMCC}/resources/manhattan-arts-grants/creative-unrestricted/": "LMCC Manhattan Arts Grants: Creative Unrestricted",
    f"{SIA}/department-of-cultural-affairs-art-fund-grant/": "Staten Island Arts: DCLA Art Fund Grant",
    f"{SIA}/department-of-cultural-affairs-premier-grants/": "Staten Island Arts: DCLA Premier Grants",
    f"{SIA}/nysca-encore-grant/": "Staten Island Arts: NYSCA Encore Grant",
    f"{SIA}/arts-in-education-grants/": "Staten Island Arts: Arts-in-Education Grants",
    "https://www.flushingtownhall.org/grants": "Flushing Town Hall: Arts Grants",
    "https://apexart.org/nyc/submit.php": "apexart NYC Open Call: exhibition proposals",
    "https://here.org/programs/performance-lab/": "HERE Performance Lab",
    "https://www.printshop.org/keyholder-residency": "Lower East Side Printshop: Keyholder Residency",
    "https://www.printshop.org/summer-keyholder-residency": "Lower East Side Printshop: Summer Keyholder Residency",
    "https://www.coloredcolors.com/projects/holidays-at-the-park": "Holidays at the Park, Hudson Yards: vendor applications for artists",
    "https://www.smackmellon.org/opportunities/artist-studio-program-2027-28/": "Smack Mellon: 2027-28 Artist Studio Program",
    "https://www.smackmellon.org/opportunities/open-call-summer-2027-group-show/": "Smack Mellon: Emerging Artist Summer 2027 Group Exhibition",
}

KEY = re.compile(r"deadline|due (?:by|on)\b|apply by|applications? (?:close|due)|submit(?:ted)? by|closes?", re.I)
DATE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (20\d\d))?", re.I)
MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split()


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(text):
    text = re.sub(r"<(script|style|nav|header|footer)\b.*?</\1>", " ", text or "", flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text).replace("\xa0", " ")).strip()


def find_deadline(text, today):
    """The first date written after a deadline phrase, as ISO. A date with no year takes the next one coming."""
    for k in KEY.finditer(text):
        m = DATE.search(text[k.end():k.end() + 110])
        if not m:
            continue
        month, day = MONTHS.index(m.group(1).lower()[:3]) + 1, int(m.group(2))
        try:
            if m.group(3):
                return date(int(m.group(3)), month, day).isoformat()
            d = date(today.year, month, day)
            return (d if d >= today else date(today.year + 1, month, day)).isoformat()
        except ValueError:
            continue
    return None


def title_of(page):
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    title = re.search(r"<title[^>]*>(.*?)</title>", page, re.S)
    text = clean(h1.group(1)) if h1 and clean(h1.group(1)) else clean(title.group(1)) if title else ""
    return re.split(r"\s+(?:\||::|–|—)\s+", text)[0]


def fetch():
    items = []
    for entry in PAGES:
        time.sleep(DELAY_SECONDS)
        try:
            page = get(entry["url"])
        except OSError:
            continue
        items.append({**entry, "title": title_of(page), "text": clean(page)})
    return items


def to_record(item, today=None):
    today = today or date.today()
    text = item["text"]
    start = text.find("Home >")
    body = text[start:] if start >= 0 else text
    return {
        "source": NAME,
        "title": TITLES.get(item["url"], item["title"]),
        "opportunity_type": item["type"],
        "borough": item["borough"],
        "eligibility": [],
        "fee": "unknown",
        "deadline": item.get("deadline") or find_deadline(body, today),
        "description": item.get("note") or body[:600],
        "source_url": item["url"],
    }
