"""API adapters for creative opportunities in the NYC tri-state area.

Each adapter calls one documented API, filters to creative work an artist can apply to
or take part in, and returns candidate records in the snapshot schema. Candidates still
go through verification (quote on the record's own page, URL returns 200) before they
join a snapshot.

Keyless sources run as-is. Keyed sources read their key from an environment variable and
are skipped, with a message, when it is not set:
    NYC_API_KEY       - NYC Event Calendar API (register at https://api-portal.nyc.gov)
    SAM_API_KEY       - SAM.gov Contract Opportunities (register at https://sam.gov)
    EVENTBRITE_TOKEN  - Eventbrite private token (Account Settings > Developer Links > API Keys)

Not built: USAJOBS (its API host's robots.txt disallows all agents) and Ticketmaster
(attendee tickets, not opportunities for artists).

Every request passes the same gate: the paid display-only denylist, then robots.txt for
the exact URL (query string included) for ClaudeBot, anthropic-ai, Claude-User and *.

Usage:
    python -m ingest.apis city_record grants_gov --out data/api/2026-10-27/candidates.json
"""

import argparse
import datetime as dt
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
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
AGENTS = ("ClaudeBot", "anthropic-ai", "Claude-User", "*")
TODAY = dt.date.today()

# Creative work, matched on whole words so "apartments" never matches "art".
CREATIVE = re.compile(
    r"\b(arts?|artists?|artwork|mural|murals|sculpture|public art|percent for art|music|musicians?|"
    r"theat(?:er|re)|dance|dancers?|performing arts|film|filmmak\w*|video production|photograph\w*|"
    r"poet(?:ry|s)?|writers?|cultural programs?|craft|ceramics?|exhibition|choreograph\w*|"
    r"illustrat\w*|animation|media arts|storytell\w*)\b", re.I)
NOT_CREATIVE = re.compile(r"\b(floor tile|petroleum|sewer|asbestos|hvac|roofing|elevator|plumbing|paving|janitorial)\b", re.I)
TRI_STATE = re.compile(r"\b(NY|NJ|CT|New York|New Jersey|Connecticut)\b")


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


def request_json(url, data=None, headers=None):
    if not allowed(url):
        raise Blocked(url)
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
    for fmt, token in (("%m/%d/%Y", text.split()[0]), ("%b %d, %Y", text)):
        try:
            return dt.datetime.strptime(token, fmt).date()
        except ValueError:
            pass
    return None


def is_creative(*texts):
    blob = " ".join(t for t in texts if t)
    return bool(CREATIVE.search(blob)) and not NOT_CREATIVE.search(blob)


def record(title, org, url, deadline, borough, region, typ, sub, disciplines, quote, source, fee="unknown", **extra):
    return dict(title=title[:160], org=org, opportunity_type=typ, subtype=sub, borough=borough, region=region,
                deadline=deadline.isoformat() if isinstance(deadline, dt.date) else deadline, recurrence=None, fee=fee, award=None,
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


# --- Grants.gov (keyless) ----------------------------------------------------------------------

def grants_gov():
    """Posted federal arts grants; kept only when the listing itself names NY, NJ or CT, since national calls are out of scope."""
    body = request_json("https://api.grants.gov/v1/api/search2", data={"keyword": "arts", "oppStatuses": "posted", "rows": 200})
    out = []
    for h in body.get("data", {}).get("oppHits", []):
        title = h.get("title", "")
        if not is_creative(title) or not TRI_STATE.search(title):
            continue
        close = parse_date(h.get("closeDate"))
        if close and close < TODAY:
            continue
        out.append(record(title, h.get("agency", h.get("agencyCode", "")), f"https://www.grants.gov/search-results-detail/{h['id']}",
                          close, None, "tri_state", "grant", None, ["all"], None, "api-grants-gov"))
    return out


# --- NYC Event Calendar (needs NYC_API_KEY) ----------------------------------------------------

PARTICIPATE = re.compile(r"\b(workshop|class(?:es)?|open mic|jam|drum circle|sing-?along|drawing|sketch|audition|open call|lesson|"
                         r"open studio|craft|dance (?:class|party|social)|salsa|tango|swing|poetry|writing|choir|chorus)\b", re.I)
BOROUGH = {"manhattan": "manhattan", "brooklyn": "brooklyn", "queens": "queens", "bronx": "bronx", "staten island": "staten_island"}


def nyc_events():
    key = os.environ.get("NYC_API_KEY")
    if not key:
        print("nyc_events: skipped, set NYC_API_KEY (register at https://api-portal.nyc.gov)", file=sys.stderr)
        return []
    out, start = [], TODAY
    end = TODAY + dt.timedelta(days=90)
    q = urllib.parse.urlencode({"startDate": start.strftime("%m/%d/%Y 12:00 AM"), "endDate": end.strftime("%m/%d/%Y 11:59 PM"), "categories": "Arts and Culture"})
    body = request_json(f"https://api.nyc.gov/calendar/search?{q}", headers={"Ocp-Apim-Subscription-Key": key})
    for e in body.get("items", []):
        name, desc = e.get("name", ""), re.sub(r"<[^>]+>", " ", e.get("shortDesc") or e.get("desc") or "")
        if not PARTICIPATE.search(name):
            continue
        boro = BOROUGH.get((e.get("boroughs") or [""])[0].lower(), "unknown") if e.get("boroughs") else "unknown"
        url = e.get("permalink") or e.get("website")
        if not url:
            continue
        out.append(record(name, e.get("organizer") or "NYC", url, parse_date(e.get("startDate")), boro, "nyc", "event", "workshop",
                          ["all"], desc.strip()[:300] or None, "api-nyc-event-calendar", fee="none" if e.get("free") else "unknown"))
    return out


# --- SAM.gov contract opportunities (needs SAM_API_KEY) ----------------------------------------

def sam_gov():
    key = os.environ.get("SAM_API_KEY")
    if not key:
        print("sam_gov: skipped, set SAM_API_KEY (register at https://sam.gov)", file=sys.stderr)
        return []
    out = []
    for state in ("NY", "NJ", "CT"):
        q = urllib.parse.urlencode({"api_key": key, "postedFrom": (TODAY - dt.timedelta(days=60)).strftime("%m/%d/%Y"),
                                    "postedTo": TODAY.strftime("%m/%d/%Y"), "state": state, "ptype": "o,k", "limit": 1000})
        body = request_json(f"https://api.sam.gov/opportunities/v2/search?{q}")
        for o in body.get("opportunitiesData", []):
            title = o.get("title", "")
            if not is_creative(title):
                continue
            due = parse_date(o.get("responseDeadLine"))
            if due and due < TODAY:
                continue
            out.append(record(title, o.get("fullParentPathName", "Federal agency"), o.get("uiLink"), due, None,
                              "nyc" if state == "NY" else {"NJ": "new_jersey", "CT": "connecticut"}[state],
                              "open_call", "commission", ["all"], None, "api-sam-opportunities"))
    return out


# --- Eventbrite (needs EVENTBRITE_TOKEN) -------------------------------------------------------
# Eventbrite has no public search; the API returns any public event, or an organizer's public events.
# IDs come from venue pages we crawled that link to eventbrite.com/e/...-<id> or /o/...-<id>.

EVENTBRITE_IDS = REPO / "data/api/eventbrite_ids.json"
ZIP_REGION = [(range(10000, 10300), "manhattan", "nyc"), (range(10300, 10400), "staten_island", "nyc"), (range(10400, 10500), "bronx", "nyc"),
              (range(11200, 11300), "brooklyn", "nyc"), (range(11100, 11200), "queens", "nyc"), (range(11300, 11500), "queens", "nyc"),
              (range(11600, 11700), "queens", "nyc"), (range(11000, 11100), None, "long_island"), (range(11500, 11600), None, "long_island"),
              (range(11700, 12000), None, "long_island"), (range(10500, 11000), None, "westchester_hudson"), (range(12400, 12800), None, "westchester_hudson"),
              (range(7000, 8000), None, "new_jersey"), (range(8800, 9000), None, "new_jersey"), (range(6400, 7000), None, "connecticut")]


def place(zip_code):
    try:
        z = int(str(zip_code)[:5])
    except (TypeError, ValueError):
        return None
    return next(((b, r) for rng, b, r in ZIP_REGION if z in rng), None)


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
    sentence = next((s for s in re.split(r"(?<=[.!?])\s+", desc) if 25 < len(s) < 300), None)
    return record(name, (e.get("organizer") or {}).get("name") or "Eventbrite organizer", e.get("url"), start, where[0], where[1],
                  "open_call" if re.search(r"audition|open call|casting", name, re.I) else "event", "workshop", ["all"], sentence,
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


ADAPTERS = {"city_record": city_record, "grants_gov": grants_gov, "nyc_events": nyc_events, "sam_gov": sam_gov, "eventbrite": eventbrite}


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
