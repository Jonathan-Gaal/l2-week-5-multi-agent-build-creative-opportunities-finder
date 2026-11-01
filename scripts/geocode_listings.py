"""Turn the places in a snapshot's listings into map points. Free, no key.

Two lookups, in this order, for each listing:
  1. a street address -> the US Census Bureau's address lookup;
  2. otherwise a venue name ("Chelsea Recreation Center, Manhattan") -> OpenStreetMap's search (Nominatim), at most one request a second.
A result is kept only when it lands in the listing's own borough (NYC); a place that is only a city or town is not a point.

Writes data/geo/<snapshot id>.json: {dedupe_key: {"lat": ..., "lng": ..., "matched": "...", "how": "address" | "venue"}}.
Every answer (including "no match") is remembered in data/geo/_lookups.json, so a later snapshot only looks up what is new.
Nothing in the snapshot or the database changes; the map reads the snapshot file. Listings with no usable place get no point.

Usage:
    python3 scripts/geocode_listings.py 2026-11-01b --limit 20 --dry-run     # try 20 lookups, print, write nothing
    python3 scripts/geocode_listings.py 2026-11-01b                          # every listing
"""

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "ArtistAtlas/1.0 (class project; address lookup for a map of arts listings)"
CACHE = REPO / "data/geo/_lookups.json"
STATE = {"nyc": "NY", "long_island": "NY", "westchester_hudson": "NY", "upstate_ny": "NY", "new_jersey": "NJ", "connecticut": "CT",
         "pennsylvania": "PA", "massachusetts": "MA", "rhode_island": "RI", "vermont": "VT", "new_hampshire": "NH", "maine": "ME",
         "maryland": "MD", "dc": "DC", "delaware": "DE"}
STATE_NAME = {"NY": "New York", "NJ": "New Jersey", "CT": "Connecticut", "PA": "Pennsylvania", "MA": "Massachusetts", "RI": "Rhode Island",
              "VT": "Vermont", "NH": "New Hampshire", "ME": "Maine", "MD": "Maryland", "DC": "District of Columbia", "DE": "Delaware"}
CITY = {"manhattan": "New York", "brooklyn": "Brooklyn", "queens": "Queens", "bronx": "Bronx", "staten_island": "Staten Island"}
# Rough boxes (south, north, west, east) around each borough, used only to throw out a point that landed in the wrong place.
BOX = {"manhattan": (40.68, 40.885, -74.03, -73.90), "brooklyn": (40.56, 40.74, -74.06, -73.83), "queens": (40.54, 40.81, -73.97, -73.69),
       "bronx": (40.78, 40.92, -73.94, -73.74), "staten_island": (40.48, 40.66, -74.27, -74.04)}
NYC_BOX = (40.48, 40.92, -74.27, -73.69)
SUFFIX = r"(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Pl|Place|Dr|Drive|Way|Ln|Lane|Pkwy|Parkway|Sq|Square|Ct|Court|Hwy|Broadway|Terrace|Plaza)"
STREET = re.compile(rf"\b(\d{{1,5}}(?:-\d{{1,5}})?[A-Za-z]?\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9.'-]+\s+){{0,4}}?{SUFFIX}\b\.?)", re.I)
TAIL = re.compile(r"^[,\s]*([A-Za-z][A-Za-z .'-]{1,28}?)?[,\s]*\b([A-Z]{2})\b[,\s]*(\d{5})?", re.U)
NOT_A_PLACE = re.compile(r"^\s*(online|virtual|zoom|tbd|tba|various|multiple|n/?a|please\b.*)\s*$", re.I)


def extract_address(location, region, borough=None):
    """A one-line street address from messy location text, or None when there is no street address in it."""
    m = STREET.search(location or "")
    if not m:
        return None
    street = m.group(1).strip().rstrip(".")
    rest = (location or "")[m.end():]
    t = TAIL.match(rest)
    city = state = zip_ = ""
    if t:
        city, state, zip_ = (t.group(1) or "").strip(" ,"), t.group(2) or "", t.group(3) or ""
    if not zip_:                                    # a unit like "Suite 4W" can sit between the street and the ZIP
        z = re.search(r"\b(\d{5})(?:-\d{4})?\b", rest[:90])
        zip_ = z.group(1) if z else ""
    state = state if state in STATE.values() else STATE.get(region, "")
    if not city and region == "nyc":
        city = CITY.get(borough or "", "New York")     # without a city the lookup can pick the wrong borough
    if not city and not zip_ and region != "nyc":     # a street and state alone can match a same-named street in the wrong town
        return None
    parts = [street, city, f"{state} {zip_}".strip()]
    return ", ".join(p for p in parts if p)


def venue_query(location, region, borough=None):
    """A search phrase for a venue named in the location text ("Media Lab (in Chelsea Recreation Center) , Manhattan"), or None."""
    loc = (location or "").strip()
    if not loc or NOT_A_PLACE.match(loc):
        return None
    inside = re.search(r"\(\s*in\s+([^)]+)\)", loc, re.I)
    name = inside.group(1) if inside else re.sub(r"\(.*?\)", "", loc)
    parts = [p.strip() for p in name.split(",") if p.strip()]
    state = STATE.get(region, "")
    if parts and parts[-1].upper() in STATE.values():
        state = parts.pop().upper()
    if not parts:
        return None
    place = ""
    if region == "nyc":
        place = CITY.get(borough or "", "New York")
        if len(parts) > 1 and parts[-1].lower().replace(" ", "_") in CITY:
            parts.pop()
    elif len(parts) > 1:
        place = parts.pop()
    venue = parts[0]
    return ", ".join(p for p in [venue, place, STATE_NAME.get(state, "")] if p)


def plausible(hit, region, borough):
    """False when the point is outside the listing's borough (or outside NYC for an NYC listing)."""
    if region != "nyc":
        return True
    s, n, w, e = BOX.get(borough or "", NYC_BOX)
    return s <= hit["lat"] <= n and w <= hit["lng"] <= e


def _get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
        return json.load(r)


def lookup_address(address):
    q = urllib.parse.urlencode({"address": address, "benchmark": "Public_AR_Current", "format": "json"})
    matches = _get(f"{CENSUS}?{q}")["result"]["addressMatches"]
    if not matches:
        return None
    m = matches[0]
    return {"lat": round(m["coordinates"]["y"], 6), "lng": round(m["coordinates"]["x"], 6), "matched": m["matchedAddress"], "how": "address"}


def lookup_venue(query):
    q = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "us"})
    hits = _get(f"{NOMINATIM}?{q}")
    if not hits:
        return None
    h = hits[0]
    if h.get("category") in ("boundary", "place"):       # a city, town or neighborhood is not a venue
        return None
    return {"lat": round(float(h["lat"]), 6), "lng": round(float(h["lon"]), 6), "matched": h["display_name"][:120], "how": "venue"}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("snapshot_id")
    p.add_argument("--limit", type=int)
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)
    records = json.loads((REPO / "data/snapshots" / a.snapshot_id / "records.json").read_text(encoding="utf-8"))["records"]
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    wanted, todo = [], {}                      # wanted: (dedupe_key, cache key, region, borough); todo: cache key -> (kind, text)
    for r in records:
        addr = extract_address(r.get("location"), r.get("region"), r.get("borough"))
        venue = None if addr else venue_query(r.get("location"), r.get("region"), r.get("borough"))
        if not (addr or venue):
            continue
        ck = ("address|" + addr) if addr else ("venue|" + venue)
        wanted.append((r["dedupe_key"], ck, r.get("region"), r.get("borough")))
        if ck not in cache:
            todo[ck] = ("address", addr) if addr else ("venue", venue)
    todo_keys = list(todo)[: a.limit] if a.limit else list(todo)
    print(f"{len(wanted)} listings have an address or venue name ({len({w[1] for w in wanted})} different places); "
          f"{len(todo)} not looked up before; looking up {len(todo_keys)}")
    found = 0
    for ck in todo_keys:
        kind, text = todo[ck]
        try:
            cache[ck] = (lookup_address if kind == "address" else lookup_venue)(text)
        except Exception as e:           # a failed lookup is just a listing with no point; not remembered, so it is tried again later
            print(f"  error for {text!r}: {type(e).__name__}")
            continue
        hit = cache[ck]
        found += bool(hit)
        print(f"  {'ok ' if hit else 'no '} [{kind}] {text}  ->  {hit['matched'] + ' ' + str((hit['lat'], hit['lng'])) if hit else 'no match'}")
        time.sleep(0.4 if kind == "address" else 1.1)
    print(f"{found} of {len(todo_keys)} places found")
    if not a.dry_run:
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        out, dropped = {}, 0
        for key, ck, region, borough in wanted:
            hit = cache.get(ck)
            if hit and plausible(hit, region, borough):
                out[key] = hit
            elif hit:
                dropped += 1
        print(f"{dropped} points were outside their borough and were dropped")
        path = REPO / "data/geo" / f"{a.snapshot_id}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {len(out)} points to {path}")


if __name__ == "__main__":
    main()
