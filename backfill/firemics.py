"""FireMics NYC open mic schedule (about a week of mics, all boroughs). Source id: firemics.

The page lists one row per mic per day under day headers. A mic that repeats on several days becomes one
record with its next date and its days listed. FireMics' terms prohibit scraping; see source-research.md
section 7 for the decision to proceed. Its robots.txt disallows /api/, which this source never touches.
"""
import html
import re
import urllib.request
from datetime import date

NAME = "firemics"
URL = "https://www.firemics.com/new-york-open-mics"
BASE = "https://www.firemics.com"
NYC_ONLY = True
USER_AGENT = "creative-opportunities-finder-class-project"

BOROUGH_NAMES = {"manhattan": "manhattan", "brooklyn": "brooklyn", "queens": "queens", "bronx": "bronx",
                 "staten island": "staten_island"}
DAY_BADGE = re.compile(
    r'Badge-label">\s*(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day(?:<!--.*?-->|\s)*(\d{1,2})/(\d{1,2})\s*</span>', re.S)
WEEKDAY = {"Mon": "Mon", "Tue": "Tue", "Wed": "Wed", "Thu": "Thu", "Fri": "Fri", "Sat": "Sat", "Sun": "Sun"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(text):
    text = re.sub(r"<!--.*?-->", "", text or "")
    text = re.sub(r"<svg.*?</svg>|<[^>]+>", " ", text, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(text).replace("\xa0", " ")).strip()


def infer_date(month, day, today):
    """The next date on or after today for a month and day (a week-long page never spans more than a year)."""
    year = today.year
    try:
        d = date(year, month, day)
    except ValueError:
        return None
    return d if (today - d).days <= 180 else date(year + 1, month, day)


def last_day(text, today):
    """The date of the last day header in a piece of HTML, or None."""
    found = DAY_BADGE.findall(text)
    return infer_date(int(found[-1][0]), int(found[-1][1]), today) if found else None


def parse_rows(page, today):
    """Every mic occurrence on the page as a dict. A day header is a badge that ends the previous day's
    last row (the first one sits before the first row), so a row takes the date in force before it."""
    parts = re.split(r"<tr\b", page)
    current, rows = last_day(parts[0], today), []
    for row in ["<tr" + part for part in parts[1:]]:
        link = re.search(r'href="(/events/(?!create)[^"]+)"', row)
        paragraphs = [clean(p) for p in re.findall(r"<p [^>]*>(.*?)</p>", row, re.S)]
        badges = [clean(b) for b in re.findall(r'Badge-label">(.*?)</span>', row, re.S)]
        badges = [b for b in badges if b and "Items" not in b and not DAY_BADGE.search(f'Badge-label">{b}</span>')]
        if link and current is not None and len(paragraphs) >= 3:
            borough = next((BOROUGH_NAMES[b.lower()] for b in badges if b.lower() in BOROUGH_NAMES), "unknown")
            rest = [b for b in badges if b.lower() not in BOROUGH_NAMES and b != "Unknown"]
            genre = next((b for b in rest if not re.match(r"^[$£€]|Free|See Price", b)), "")
            cost = next((b for b in rest if re.match(r"^[$£€]|Free|See Price", b)), "")
            rows.append({"time": paragraphs[0], "title": paragraphs[1], "venue": paragraphs[2], "borough": borough,
                         "genre": genre, "cost": cost, "href": link.group(1), "date": current})
        current = last_day(row, today) or current
    return rows


def collapse(rows):
    """One item per recurring mic (same title, venue and borough), with its dates and times."""
    series = {}
    for r in rows:
        key = (r["title"].lower(), r["venue"].lower())
        item = series.setdefault(key, {**r, "dates": [], "times": []})
        if item["borough"] == "unknown":  # the page's second layout leaves the borough badge out
            item["borough"] = r["borough"]
        if r["date"] not in item["dates"]:
            item["dates"].append(r["date"])
        if r["time"] not in item["times"]:
            item["times"].append(r["time"])
    items = []
    for item in series.values():
        item["dates"].sort()
        items.append(item)
    return items


def fetch(today=None):
    today = today or date.today()
    return collapse(parse_rows(get(URL), today))


def to_record(item):
    """Map one recurring mic to a record, or None when it has no upcoming date."""
    if not item["dates"]:
        return None
    title = item["title"] if item["venue"].lower() in item["title"].lower() else f"{item['title']} at {item['venue']}"
    days = sorted({d.strftime("%a") for d in item["dates"]}, key=list(WEEKDAY).index)
    times = sorted(set(item["times"]))
    cost = item["cost"]
    fee = "none" if cost == "Free" else cost if cost.startswith(("$", "£", "€")) else "unknown"
    description = (f"{item['genre'] or 'Open mic'} at {item['venue']}, {item['borough'].replace('_', ' ').title()}. "
                   f"Seen on {', '.join(days)} at {', '.join(times)}. Next: {item['dates'][0].isoformat()}.")
    return {
        "source": NAME,
        "title": title,
        "opportunity_type": "open_mic",
        "borough": item["borough"],
        "eligibility": [],
        "fee": fee,
        "deadline": item["dates"][0].isoformat(),
        "description": description,
        "source_url": BASE + item["href"],
    }
