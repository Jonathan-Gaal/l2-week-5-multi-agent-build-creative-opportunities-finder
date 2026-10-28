"""API adapters for creative opportunities within reach of an NYC artist (NY, NJ, CT, PA, MA, RI, VT, NH, ME, DE, MD, DC).

Each adapter calls one documented API, filters to creative work an artist can apply to
or take part in, and returns candidate records in the snapshot schema. Candidates still
go through verification (quote on the record's own page, URL returns 200) before they
join a snapshot.

Keyless sources run as-is: city_record, nyc_jobs, grants_gov, and tribe_events (organizer sites listed in
data/api/tribe_origins.json). Keyed sources read their key from an environment variable and
are skipped, with a message, when it is not set:
    NYC_API_KEY       - NYC Event Calendar API (register at https://api-portal.nyc.gov)
    SAM_API_KEY       - SAM.gov Contract Opportunities (register at https://sam.gov)
    EVENTBRITE_TOKEN  - Eventbrite private token (Account Settings > Developer Links > API Keys)

Not built: USAJOBS (its API host's robots.txt disallows all agents) and Ticketmaster
(attendee tickets, not opportunities for artists).

Every request passes the same gate: the paid display-only denylist, then robots.txt for
the exact URL (query string included) for ClaudeBot, anthropic-ai, Claude-User and *.

Usage:
    python -m ingest.apis city_record grants_gov tribe_events --out data/api/2026-10-28/candidates.json
"""

import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DENYLIST = REPO / "data/seeds/paid-display-only-sources.json"
UA = "OpportunityResearch/1.0 (read-only arts opportunity research; robots respected)"   # same identity as scripts/crawl_opportunity_sources.py
AGENTS = ("ClaudeBot", "anthropic-ai", "Claude-User", "*")
TODAY = dt.date.today()

# Creative work, matched on whole words so "apartments" never matches "art".
CREATIVE = re.compile(
    r"\b(arts?|artists?|artwork|mural|murals|sculpture|public art|percent for art|music|musicians?|"
    r"theat(?:er|re)|dance|dancers?|performing arts|film|filmmak\w*|video production|photograph\w*|"
    r"poet(?:ry|s)?|writers?|cultural programs?|craft|ceramics?|exhibition|choreograph\w*|"
    r"illustrat\w*|animation|media arts|storytell\w*)\b", re.I)
NOT_CREATIVE = re.compile(r"\b(floor tile|petroleum|sewer|asbestos|hvac|roofing|elevator|plumbing|paving|janitorial)\b", re.I)

# Scope: anywhere an NYC artist can reasonably reach. State code -> snapshot region when no ZIP is available
# (NY is split by place, so it has no single region).
STATE_REGION = {"NJ": "new_jersey", "CT": "connecticut", "PA": "pennsylvania", "MA": "massachusetts", "RI": "rhode_island",
                "VT": "vermont", "NH": "new_hampshire", "ME": "maine", "DE": "delaware", "MD": "maryland", "DC": "dc"}
SCOPE_STATES = ("NY", *STATE_REGION)


class Blocked(Exception):
    pass


_robots_cache = {}


def _denied_hosts():
    try:
        data = json.loads(DENYLIST.read_text())
    except (OSError, ValueError):
        return set()
    return {h.removeprefix("www.") for s in data.get("sources", []) for h in s.get("blocked_hosts", [])}


DENIED = _denied_hosts()


def allowed(url):
    """True only when the host is not denylisted and robots.txt allows this exact URL for every agent."""
    parts = urllib.parse.urlparse(url)
    host = parts.netloc.lower()
    if host.removeprefix("www.") in DENIED:
        return False
    if host not in _robots_cache:
        rp = urllib.robotparser.RobotFileParser()
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{parts.scheme}://{host}/robots.txt", headers={"User-Agent": UA}), timeout=20) as r:
                rp.parse(r.read().decode(errors="ignore").splitlines())
        except urllib.error.HTTPError as e:
            rp.parse([] if e.code in (401, 403, 404, 410) else ["User-agent: *", "Disallow: /"])
        except (urllib.error.URLError, TimeoutError):
            rp.parse(["User-agent: *", "Disallow: /"])
        _robots_cache[host] = rp
    return all(_robots_cache[host].can_fetch(a, url) for a in AGENTS)


def redact(url):
    """The URL with any api_key value hidden, for messages and logs."""
    return re.sub(r"(api_key=)[^&]+", r"\1REDACTED", url)


def request_json(url, data=None, headers=None):
    if not allowed(url):
        raise Blocked(redact(url))
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"User-Agent": UA, "Accept": "application/json", **({"Content-Type": "application/json"} if data is not None else {}), **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read().decode())
    time.sleep(1)
    return body


def parse_date(text):
    """Dates arrive as ISO, MM/DD/YYYY or ISO with time; returns a date or None."""
    if not text:
        return None
    text = str(text).strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", text)
    if m:
        return dt.date.fromisoformat(m.group(1))
    for fmt, token in (("%m/%d/%Y", text.split()[0]), ("%b %d, %Y", text), ("%d-%b-%Y", text.split()[0])):
        try:
            return dt.datetime.strptime(token, fmt).date()
        except ValueError:
            pass
    return None


def is_creative(*texts):
    blob = " ".join(t for t in texts if t)
    return bool(CREATIVE.search(blob)) and not NOT_CREATIVE.search(blob)


def record(title, org, url, deadline, borough, region, typ, sub, disciplines, quote, source, fee="unknown", award=None, **extra):
    return dict(title=title[:160], org=org, opportunity_type=typ, subtype=sub, borough=borough, region=region,
                deadline=deadline.isoformat() if isinstance(deadline, dt.date) else deadline, recurrence=None, fee=fee, award=award,
                eligibility=[{"requirement": "as stated", "quote": quote}] if quote else [], source=source, source_url=url,
                disciplines=disciplines, extraction="api", **extra)


# --- NYC City Record Online (keyless, Socrata) ------------------------------------------------

def city_record():
    """Open NYC agency solicitations whose title or description names creative work."""
    q = urllib.parse.urlencode({"$where": f"due_date >= '{TODAY.isoformat()}' AND type_of_notice_description = 'Solicitation'", "$limit": 1000})
    rows = request_json(f"https://data.cityofnewyork.us/resource/dg92-zbpx.json?{q}")
    out = []
    for r in rows:
        title, desc = r.get("short_title", ""), r.get("additional_description_1", "")
        # Titles decide: procurement descriptions use "creative" and "culture" loosely (marketing, outside counsel).
        if not is_creative(title):
            continue
        due = parse_date(r.get("due_date"))
        if not due or due.year > TODAY.year + 2:   # placeholder dates such as 2999-09-09 mark open-ended extensions
            continue
        url = f"https://a856-cityrecord.nyc.gov/RequestDetail/{r['request_id']}"
        out.append(record(title, r.get("agency_name", "NYC agency"), url, due, "citywide", "nyc", "open_call", "commission",
                          ["all"], desc[:300] if desc else None, "api-nyc-city-record", pin=r.get("pin")))
    return out


# --- NYC Jobs (keyless, Socrata) ---------------------------------------------------------------

JOB_DESIGN = re.compile(r"\b(graphic|multimedia|visual|ux|ui|web|exhibit\w*|data visualization|motion|art|creative)\s+(designer|director)\b|\bdirector of design\b", re.I)
# Engineering "design" and procurement, policy or technical "writer" titles are not creative work.
NOT_CREATIVE_JOB = re.compile(r"\b(engineer\w*|construction|reviewer|structural|civil|electrical|mechanical|plumb\w*|solicitation|proposal|policy|technical|grants?)\b", re.I)
JOB_DISCIPLINE = [(re.compile(r"design", re.I), "design"), (re.compile(r"video|film|media", re.I), "film"), (re.compile(r"photo", re.I), "visual"),
                  (re.compile(r"music", re.I), "music"), (re.compile(r"theat|dance|perform", re.I), "theater"), (re.compile(r"writer|poet|editor", re.I), "literary")]
QUEENS = re.compile(r"\b(queens|long island city|jamaica|flushing|astoria|kew gardens|corona|ridgewood|far rockaway)\b", re.I)


def _job_borough(location):
    loc = location or ""
    for name, key in BOROUGH.items():
        if re.search(rf"\b{name}\b", loc, re.I):
            return key
    if re.search(r"\bbklyn\b", loc, re.I):
        return "brooklyn"
    if QUEENS.search(loc):
        return "queens"
    return "manhattan" if re.search(r"\bN\.?\s?Y\.?\b|\bNew York\b", loc, re.I) else "unknown"   # "New York, NY" is the Manhattan postal name


def _salary(j):
    lo, hi, unit = j.get("salary_range_from"), j.get("salary_range_to"), (j.get("salary_frequency") or "").lower()
    try:
        lo, hi = float(lo), float(hi or lo)
    except (TypeError, ValueError):
        return None
    per = {"annual": "per year", "hourly": "per hour", "daily": "per day"}.get(unit, unit)
    amount = f"${lo:,.0f}" if lo == hi else f"${lo:,.0f}–${hi:,.0f}"
    return f"{amount} {per}".strip()


def _job_record(j):
    """Candidate for one NYC job posting, or None when it is internal-only, closed or not creative work."""
    title = (j.get("business_title") or "").strip()
    if j.get("posting_type") != "External" or NOT_CREATIVE_JOB.search(title) or not (is_creative(title) or JOB_DESIGN.search(title)):
        return None
    closes = parse_date(j.get("post_until"))
    if closes and closes < TODAY:
        return None
    r = record(title, (j.get("agency") or "NYC agency").title(), f"https://cityjobs.nyc.gov/job/{j['job_id']}", closes,
               _job_borough(j.get("work_location")), "nyc", "job", "full_time" if j.get("full_time_part_time_indicator") == "F" else "part_time",
               sorted({d for rx, d in JOB_DISCIPLINE if rx.search(title)}) or ["all"], None, "api-nyc-jobs", fee="none", award=_salary(j),
               location=j.get("work_location"), job_id=j["job_id"])
    r["eligibility"] = [{"requirement": req, "quote": first_sentence(j.get(field)) or (j.get(field) or "")[:300]}
                        for req, field in (("minimum qualifications", "minimum_qual_requirements"), ("residency", "residency_requirement")) if j.get(field)]
    return r


def nyc_jobs():
    """Open external NYC government jobs doing creative work, with salary."""
    rows = request_json("https://data.cityofnewyork.us/resource/kpav-sd4t.json?" + urllib.parse.urlencode({"posting_type": "External", "$limit": 50000}))
    out, seen = [], set()
    for j in rows:
        if j.get("job_id") in seen:
            continue
        seen.add(j.get("job_id"))
        rec = _job_record(j)
        if rec:
            out.append(rec)
    return out


# --- Grants.gov (keyless) ----------------------------------------------------------------------

INDIVIDUALS = "21"   # Grants.gov applicant type "Individuals"


def grants_gov():
    """Posted federal Arts and Humanities grants that individuals may apply for.

    Federal calls are national, so they reach NYC artists by eligibility, not place; most are open only
    to organizations, and those are dropped. Keyword search is not used: "arts" also matches "parts".
    """
    body = request_json("https://api.grants.gov/v1/api/search2", data={"fundingCategories": "AR|HU", "oppStatuses": "posted", "rows": 500})
    out = []
    for h in body.get("data", {}).get("oppHits", []):
        close = parse_date(h.get("closeDate"))
        if close and close < TODAY:
            continue
        synopsis = request_json("https://api.grants.gov/v1/api/fetchOpportunity", data={"opportunityId": int(h["id"])}).get("data", {}).get("synopsis", {})
        if not any(str(t.get("id")) == INDIVIDUALS for t in synopsis.get("applicantTypes") or []):
            continue
        if close and close.year > TODAY.year + 2:   # 2099 marks a standing annual program statement
            close = None
        quote = (synopsis.get("applicantEligibilityDesc") or "").strip()[:300] or None
        out.append(record(h.get("title", ""), h.get("agency", h.get("agencyCode", "")), f"https://www.grants.gov/search-results-detail/{h['id']}",
                          close, None, "national", "grant", None, ["all"], quote, "api-grants-gov",
                          award=synopsis.get("awardCeiling") or None))
    return out


# --- NYC Event Calendar (needs NYC_API_KEY) ----------------------------------------------------

PARTICIPATE = re.compile(r"\b(workshops?|class(?:es)?|open mic|jam|drum circle|sing-?along|drawing|sketch|audition|open call|lesson|"
                         r"open studio|craft|dance (?:class|party|social)|salsa|tango|swing|poetry|writing|choir|chorus)\b", re.I)
# Audience or shopping events whose titles still trip PARTICIPATE ("Holiday Swing" concert, "Craft Fair").
SPECTATOR = re.compile(r"\b(concerts?|craft fair|conversation|book sale|reading by|recital)\b", re.I)
BOROUGH = {"manhattan": "manhattan", "brooklyn": "brooklyn", "queens": "queens", "bronx": "bronx", "staten island": "staten_island"}


NYC_BOROUGH = {"mn": "manhattan", "bk": "brooklyn", "qn": "queens", "bx": "bronx", "si": "staten_island", **BOROUGH}
NYC_MAX_PAGES = 100   # 12 events a page; about 57 pages cover 90 days


def _nyc_event_record(e):
    """Candidate for one calendar occurrence, or None when cancelled, not creative or not hands-on."""
    name, desc = _text(e.get("name")), _text(e.get("shortDesc") or e.get("desc"))
    website = e.get("website") or ""
    # Prefer the organizer's own event page (usually nycgovparks.org) over the calendar's copy; a bare homepage is not an event page.
    url = website if urllib.parse.urlparse(website).path.strip("/") else e.get("permalink")
    # The calendar's category filter is ignored server-side and it has no arts category, so filter on the text.
    if e.get("canceled") or not url or not PARTICIPATE.search(name) or SPECTATOR.search(name) or not is_creative(name, desc):
        return None
    start = parse_date(e.get("startDate"))
    if not start or start < TODAY:
        return None
    typ = event_type(name)
    boroughs = e.get("boroughs") or []
    boro = NYC_BOROUGH.get(boroughs[0].strip().lower(), "unknown") if len(boroughs) == 1 else ("citywide" if boroughs else "unknown")
    free = "free" in (e.get("categories") or "").lower()
    return record(name, e.get("agencyName") or "NYC", url, None if typ == "open_call" else start,   # an open call's listing dates are not its deadline
                  boro, "nyc", typ, event_subtype(name), ["all"], first_sentence(desc), "api-nyc-event-calendar",
                  fee="none" if free else "unknown", location=_text(e.get("location") or e.get("address")) or None)


def nyc_events():
    key = os.environ.get("NYC_API_KEY")
    if not key:
        print("nyc_events: skipped, set NYC_API_KEY (register at https://api-portal.nyc.gov)", file=sys.stderr)
        return []
    window = {"startDate": TODAY.strftime("%m/%d/%Y 12:00 AM"), "endDate": (TODAY + dt.timedelta(days=90)).strftime("%m/%d/%Y 11:59 PM")}
    recs, seen = [], set()
    for page in range(1, NYC_MAX_PAGES + 1):
        body = request_json("https://api.nyc.gov/calendar/search?" + urllib.parse.urlencode({**window, "pageNumber": page}),
                            headers={"Ocp-Apim-Subscription-Key": key})
        for e in body.get("items", []):
            if (e.get("id"), e.get("startDate")) not in seen:
                seen.add((e.get("id"), e.get("startDate")))
                recs.append(_nyc_event_record(e))
        pages = body.get("pagination") or {}
        if pages.get("isLastPage") or page >= (pages.get("numPages") or 1):
            break
    return _group_occurrences([r for r in recs if r])


# --- SAM.gov contract opportunities (needs SAM_API_KEY) ----------------------------------------

# A personal key without a SAM.gov role allows 10 requests a day, so search by creative industry (one request each)
# nationwide and filter to scope locally, rather than one request per state.
# Title searches catch creative work filed under unrelated codes (a mural under construction). 9 requests, leaving 1 spare.
SAM_NAICS = {"711510": ["all"], "711130": ["music"], "541430": ["design"], "512110": ["film"], "541922": ["visual"], "611610": ["all"]}
SAM_TITLES = ("art in architecture", "mural", "artist")
SAM_QUERIES = [({"ncode": code}, disc) for code, disc in SAM_NAICS.items()] + [({"title": t}, ["all"]) for t in SAM_TITLES]


def _sam_place(o):
    """(borough, region) from place of performance, or None when outside scope or unknown."""
    pop = o.get("placeOfPerformance") or {}
    where = place((pop.get("zip") or "")[:5])
    if where:
        return where
    state = (pop.get("state") or {}).get("code") if isinstance(pop.get("state"), dict) else pop.get("state")
    return (None, STATE_REGION[state]) if state in STATE_REGION else None   # NY without a ZIP could be NYC, Long Island or upstate


def sam_gov():
    key = os.environ.get("SAM_API_KEY")
    if not key:
        print("sam_gov: skipped, set SAM_API_KEY (register at https://sam.gov)", file=sys.stderr)
        return []
    out, seen = [], set()
    for query, disciplines in SAM_QUERIES:
        q = urllib.parse.urlencode({"api_key": key, "postedFrom": (TODAY - dt.timedelta(days=60)).strftime("%m/%d/%Y"),
                                    "postedTo": TODAY.strftime("%m/%d/%Y"), **query, "ptype": "o,k", "limit": 1000})
        for o in request_json(f"https://api.sam.gov/opportunities/v2/search?{q}").get("opportunitiesData", []):
            due = parse_date(o.get("responseDeadLine"))
            where = _sam_place(o)
            title = o.get("title", "")
            if o.get("noticeId") in seen or (due and due < TODAY) or not where or NOT_CREATIVE.search(title):
                continue
            if "title" in query and not is_creative(title):   # title search is substring-loose; industry codes already imply creative work
                continue
            seen.add(o.get("noticeId"))
            out.append(record(title, o.get("fullParentPathName", "Federal agency"), o.get("uiLink"), due, where[0], where[1],
                              "open_call", "commission", disciplines, None, "api-sam-opportunities"))
    return out


# --- Eventbrite (needs EVENTBRITE_TOKEN) -------------------------------------------------------
# Eventbrite has no public search; the API returns any public event, or an organizer's public events.
# IDs come from venue pages we crawled that link to eventbrite.com/e/...-<id> or /o/...-<id>.

EVENTBRITE_IDS = REPO / "data/api/eventbrite_ids.json"
ZIP_REGION = [(range(10000, 10300), "manhattan", "nyc"), (range(10300, 10400), "staten_island", "nyc"), (range(10400, 10500), "bronx", "nyc"),
              (range(11200, 11300), "brooklyn", "nyc"), (range(11100, 11200), "queens", "nyc"), (range(11300, 11500), "queens", "nyc"),
              (range(11600, 11700), "queens", "nyc"), (range(11000, 11100), None, "long_island"), (range(11500, 11600), None, "long_island"),
              (range(11700, 12000), None, "long_island"), (range(10500, 11000), None, "westchester_hudson"), (range(12400, 12800), None, "westchester_hudson"),
              (range(12000, 12400), None, "upstate_ny"), (range(12800, 15000), None, "upstate_ny"),
              (range(7000, 9000), None, "new_jersey"), (range(6000, 7000), None, "connecticut"),
              (range(15000, 19700), None, "pennsylvania"), (range(19700, 20000), None, "delaware"),
              (range(20000, 20100), None, "dc"), (range(20200, 20600), None, "dc"), (range(20600, 22000), None, "maryland"),
              (range(5500, 5600), None, "massachusetts"), (range(1000, 2800), None, "massachusetts"), (range(2800, 3000), None, "rhode_island"),
              (range(3000, 3900), None, "new_hampshire"), (range(3900, 5000), None, "maine"), (range(5000, 6000), None, "vermont")]


def place(zip_code):
    try:
        z = int(str(zip_code)[:5])
    except (TypeError, ValueError):
        return None
    return next(((b, r) for rng, b, r in ZIP_REGION if z in rng), None)


def first_sentence(text):
    """A verbatim sentence short enough to quote as the record's evidence."""
    return next((s for s in re.split(r"(?<=[.!?])\s+", text or "") if 25 < len(s) < 300), None)


def event_type(title):
    return "open_call" if re.search(r"audition|open call|casting", title, re.I) else "event"


EVENT_SUBTYPES = [(r"audition|casting", "audition"), (r"open call", None), (r"open mic", "open_mic"), (r"\bjams?\b|drum circle", "jam"),
                  (r"swing|salsa|tango|dance (?:party|social|night)|\bdj\b", "dance_night"), (r"drawing|sketch|figure", "drawing_session"),
                  (r"\bclass(?:es)?\b|lesson|course|intensive", "class")]


def event_subtype(title):
    """The snapshot's subtypes (open_mic, jam, class, ...); None for a plain open call, workshop when nothing more specific matches."""
    return next((sub for rx, sub in EVENT_SUBTYPES if re.search(rx, title, re.I)), "workshop")


def _eventbrite_record(e):
    name = (e.get("name") or {}).get("text") or ""
    desc = (e.get("summary") or (e.get("description") or {}).get("text") or "").strip()
    start = parse_date((e.get("start") or {}).get("local"))
    if not start or start < TODAY or e.get("online_event") or e.get("status") not in ("live", "started"):
        return None
    if not PARTICIPATE.search(name) or not is_creative(name, desc):
        return None
    venue = e.get("venue") or {}
    where = place((venue.get("address") or {}).get("postal_code"))
    if not where:
        return None
    fee = "none" if e.get("is_free") else "unknown"
    return record(name, (e.get("organizer") or {}).get("name") or "Eventbrite organizer", e.get("url"), start, where[0], where[1],
                  event_type(name), event_subtype(name), ["all"], first_sentence(desc),
                  "api-eventbrite", fee=fee, location=", ".join(x for x in [venue.get("name"), (venue.get("address") or {}).get("localized_address_display")] if x) or None,
                  eventbrite_id=e.get("id"))


def eventbrite():
    token = os.environ.get("EVENTBRITE_TOKEN")
    if not token:
        print("eventbrite: skipped, set EVENTBRITE_TOKEN (Eventbrite: Account Settings > Developer Links > API Keys > private token)", file=sys.stderr)
        return []
    try:
        ids = json.loads(EVENTBRITE_IDS.read_text())
    except (OSError, ValueError):
        print(f"eventbrite: no ID list at {EVENTBRITE_IDS}", file=sys.stderr)
        return []
    headers = {"Authorization": f"Bearer {token}"}
    base, out, seen = "https://www.eventbriteapi.com/v3", [], set()
    events = []
    for oid in ids.get("organizers", []):
        try:
            body = request_json(f"{base}/organizers/{oid}/events/?status=live&order_by=start_asc&expand=venue,organizer", headers=headers)
            events += body.get("events", [])
        except urllib.error.HTTPError as err:
            print(f"eventbrite organizer {oid}: HTTP {err.code}", file=sys.stderr)
    for eid in ids.get("events", []):
        try:
            events.append(request_json(f"{base}/events/{eid}/?expand=venue,organizer", headers=headers))
        except urllib.error.HTTPError as err:
            if err.code not in (403, 404):   # deleted, private or past events
                print(f"eventbrite event {eid}: HTTP {err.code}", file=sys.stderr)
    for e in events:
        if e.get("id") in seen:
            continue
        seen.add(e.get("id"))
        rec = _eventbrite_record(e)
        if rec:
            out.append(rec)
    return out


# --- The Events Calendar (keyless, per organizer site) -----------------------------------------
# WordPress sites running The Events Calendar expose /wp-json/tribe/events/v1/events. There is no
# central index, so origins come from crawled organizer sites; each passes the robots gate per URL.

TRIBE_ORIGINS = REPO / "data/api/tribe_origins.json"
TRIBE_DAYS, TRIBE_MAX_PAGES = 90, 20


def _text(html_text):
    """Plain text with tags stripped, entities decoded and whitespace collapsed."""
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", html_text or "")).split())


def _tribe_fee(e):
    cost = _text(e.get("cost"))
    if not cost:
        return "unknown"
    if re.fullmatch(r"free\.?", cost, re.I):
        return "none"
    money = e.get("cost_details") or {}
    vals, symbol = money.get("values") or [], money.get("currency_symbol")
    if vals and symbol:   # sites that place the symbol after the amount render "135$"; write "$135"
        return " – ".join(symbol + v for v in dict.fromkeys((vals[0], vals[-1])))
    return cost


def _tribe_record(e, site):
    """Candidate for one occurrence, or None when it is past, unlisted, not participatory or out of scope."""
    title = _text(e.get("title"))
    start = parse_date(e.get("start_date"))
    if not start or start < TODAY or e.get("status") != "publish" or e.get("hide_from_listings") or re.match(r"cancell?ed\b", title, re.I):
        return None
    categories = " ".join(c.get("name", "") for c in e.get("categories") or [])
    if not PARTICIPATE.search(f"{title} {html.unescape(categories)}") or SPECTATOR.search(title):
        return None
    venue = e.get("venue") if isinstance(e.get("venue"), dict) else {}
    state = (venue.get("stateprovince") or venue.get("state") or "").upper()
    if venue.get("zip"):
        where = place(venue["zip"])
    elif len(state) == 2 and state not in SCOPE_STATES:
        where = None
    else:
        where = (site.get("borough"), site["region"])
    if not where:   # touring dates and other venues outside the 12 jurisdictions
        return None
    fee = _tribe_fee(e)
    location = ", ".join(x for x in (venue.get("venue"), venue.get("address"), venue.get("city")) if x) or ("Online" if e.get("is_virtual") else None)
    return record(title, site["org"], e.get("url"), start, where[0], where[1], event_type(title), event_subtype(title), site.get("disciplines", ["all"]),
                  first_sentence(_text(e.get("excerpt") or e.get("description"))), site["source"], fee=fee, location=location)


def _group_occurrences(recs):
    """Recurring events arrive once per date; keep the first occurrence and list every date, as the snapshot does."""
    groups = {}
    for r in recs:
        key = (r["source"], r["title"].lower(), r["region"], r["borough"])
        if key in groups:
            groups[key]["event_dates"].append(r["deadline"])
        else:
            groups[key] = {**r, "event_dates": [r["deadline"]]}
    for g in groups.values():
        g["event_dates"] = sorted({d for d in g["event_dates"] if d})   # open calls carry no date
        if len(g["event_dates"]) > 1:
            g["recurrence"] = f"{len(g['event_dates'])} dates through {g['event_dates'][-1]}"
    return list(groups.values())


def tribe_events():
    try:
        sites = json.loads(TRIBE_ORIGINS.read_text())["origins"]
    except (OSError, ValueError, KeyError) as err:
        print(f"tribe_events: cannot read origin list {TRIBE_ORIGINS}: {err!r}", file=sys.stderr)
        return []
    recs = []
    for site in sites:
        for page in range(1, TRIBE_MAX_PAGES + 1):
            q = urllib.parse.urlencode({"start_date": TODAY.isoformat(), "end_date": (TODAY + dt.timedelta(days=TRIBE_DAYS)).isoformat(),
                                        "per_page": 50, "page": page})
            try:
                body = request_json(f"{site['origin']}/wp-json/tribe/events/v1/events?{q}")
            except Blocked:
                print(f"tribe_events {site['source']}: blocked by robots.txt or denylist", file=sys.stderr)
                break
            except (urllib.error.URLError, TimeoutError, ValueError) as err:   # one site down must not stop the rest
                print(f"tribe_events {site['source']}: {err}", file=sys.stderr)
                break
            recs += filter(None, (_tribe_record(e, site) for e in body.get("events", [])))
            if page >= (body.get("total_pages") or 1):
                break
    return _group_occurrences(recs)


ADAPTERS = {"city_record": city_record, "nyc_jobs": nyc_jobs, "grants_gov": grants_gov, "nyc_events": nyc_events, "sam_gov": sam_gov, "eventbrite": eventbrite,
            "tribe_events": tribe_events}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("sources", nargs="*", default=list(ADAPTERS), choices=list(ADAPTERS))
    p.add_argument("--out", required=True, help="where to write candidate records (JSON)")
    a = p.parse_args(argv)
    results, summary = [], {}
    for name in a.sources:
        try:
            recs = ADAPTERS[name]()
        except Blocked as e:
            print(f"{name}: blocked by robots.txt or denylist: {e}", file=sys.stderr)
            recs = []
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            print(f"{name}: request failed: {e}", file=sys.stderr)
            recs = []
        summary[name] = len(recs)
        results += recs
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"generated": TODAY.isoformat(), "by_source": summary, "records": results}, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
