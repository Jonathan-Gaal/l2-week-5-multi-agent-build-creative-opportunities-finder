"""Turn the places in a snapshot's listings into map points. Free, no key.

Two lookups, in this order, for each listing:
  1. a street address -> the US Census Bureau's address lookup;
  2. otherwise a venue name ("Chelsea Recreation Center, Manhattan") -> OpenStreetMap's search (Nominatim), at most one request a second.
A result is kept only when it lands in the listing's own borough (NYC); a place that is only a city or town is not a point.
  3. a listing with neither gets a point NEAR its main area ("how": "area"): a spot in its borough (spread over a few well-known
     neighbourhoods so the pins don't pile up), the town named in its location, or the middle of its state or region. The map says these
     are approximate. Listings that are online (Online, Virtual, Zoom, Remote...) get no point, and neither do NYC listings that name no
     borough ("citywide", "unknown").

Writes data/geo/<snapshot id>.json: {dedupe_key: {"lat": ..., "lng": ..., "matched": "...", "how": "address" | "venue"}}.
Every answer (including "no match") is remembered in data/geo/_lookups.json, so a later snapshot only looks up what is new.
Nothing in the snapshot or the database changes; the map reads the snapshot file. Listings with no usable place get no point.

Usage:
    python3 scripts/geocode_listings.py 2026-11-01b --limit 20 --dry-run     # try 20 lookups, print, write nothing
    python3 scripts/geocode_listings.py 2026-11-01b                          # every listing
"""

import argparse
import hashlib
import json
import math
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


# Where a listing with no address is put: scattered close to the middle of its borough, so the pins don't pile on one dot.
# (centre lat, centre lng, half-length km, half-width km, tilt in degrees from north towards east). Manhattan is a long thin
# island, so its area is a tilted strip.
BOROUGH_AREA = {
    "manhattan": (40.7831, -73.9712, 7.0, 1.0, 29),
    "brooklyn": (40.6501, -73.9496, 5.0, 4.0, 0),
    "queens": (40.7282, -73.7949, 6.5, 4.5, 0),
    "bronx": (40.8448, -73.8648, 4.0, 3.0, 0),
    "staten_island": (40.5795, -74.1502, 4.0, 2.8, 0),
}
# The middle of each region outside NYC, used when the location names no town.
REGION_CENTER = {
    "long_island": (40.79, -73.20), "westchester_hudson": (41.15, -73.85), "upstate_ny": (42.65, -73.76), "new_jersey": (40.22, -74.76),
    "connecticut": (41.60, -72.70), "pennsylvania": (40.00, -75.45), "massachusetts": (42.30, -71.80), "rhode_island": (41.68, -71.51),
    "vermont": (44.05, -72.70), "new_hampshire": (43.45, -71.55), "maine": (44.40, -69.20), "maryland": (39.05, -76.64),
    "dc": (38.9072, -77.0369), "delaware": (39.15, -75.50),
}
ONLINE = re.compile(r"\b(online|virtual|virtually|remote|remotely|zoom|webinar|livestream|live-stream)\b", re.I)


def is_online(r):
    """True for an online-only listing, by its location text or title."""
    loc = r.get("location") or ""
    return bool(ONLINE.search(loc) and not STREET.search(loc)) or bool(ONLINE.search(r.get("title") or ""))


def scatter(key, lat, lng, along_km, across_km, tilt=0):
    """A point inside an ellipse around (lat, lng), chosen from the listing's key so it is the same every run."""
    h = hashlib.md5(key.encode("utf-8")).digest()
    u, v = int.from_bytes(h[:4], "big") / 2**32, int.from_bytes(h[4:8], "big") / 2**32
    r, theta = math.sqrt(u), 2 * math.pi * v
    x, y = across_km * r * math.cos(theta), along_km * r * math.sin(theta)       # x across the area, y along it
    t = math.radians(tilt)
    east, north = x * math.cos(t) + y * math.sin(t), -x * math.sin(t) + y * math.cos(t)
    return round(lat + north / 111.0, 6), round(lng + east / (111.0 * math.cos(math.radians(lat))), 6)


def spot_in_borough(key, borough):
    lat, lng, along, across, tilt = BOROUGH_AREA[borough]
    la, ln = scatter(key, lat, lng, along, across, tilt)
    return {"lat": la, "lng": ln, "matched": f"near {borough.replace('_', ' ').title()} (approximate)", "how": "area"}


def town_query(r):
    """"Teaneck, New Jersey" for a location that is just a town (with or without its state), else None."""
    loc = (r.get("location") or "").strip()
    region = r.get("region")
    if not loc or region == "nyc" or STREET.search(loc) or NOT_A_PLACE.match(loc):
        return None
    parts = [p.strip() for p in loc.split(",") if p.strip()]
    state = STATE.get(region, "")
    if parts and re.fullmatch(r"[A-Z]{2}", parts[-1]):
        state = parts.pop()
    town = parts[-1] if parts else ""
    if not town or re.search(r"\d", town) or len(town.split()) > 3 or not re.fullmatch(r"[A-Za-z][A-Za-z .'-]+", town):
        return None
    return f"{town}, {STATE_NAME.get(state, state)}" if state else None


def lookup_town(query):
    q = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "us"})
    hits = _get(f"{NOMINATIM}?{q}")
    if not hits:
        return None
    h = hits[0]
    return {"lat": round(float(h["lat"]), 6), "lng": round(float(h["lon"]), 6), "matched": f"{h['display_name'][:100]} (approximate)", "how": "area"}


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
        # Listings still without a point: put them near their borough, town or region (online ones stay off the map).
        towns = {}
        for r in records:
            if r["dedupe_key"] in out or is_online(r):
                continue
            q = town_query(r)
            if q and ("area|" + q) not in cache:
                towns["area|" + q] = q
        print(f"{len(towns)} towns to look up for listings with no address")
        for ck, q in towns.items():
            try:
                cache[ck] = lookup_town(q)
            except Exception as e:
                print(f"  error for {q!r}: {type(e).__name__}")
                continue
            time.sleep(1.1)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        near, skipped = 0, 0
        for r in records:
            key = r["dedupe_key"]
            if key in out:
                continue
            if is_online(r):
                skipped += 1
                continue
            region, borough = r.get("region"), r.get("borough")
            if region == "nyc":
                if borough in BOROUGH_AREA:
                    out[key] = spot_in_borough(key, borough)
                    near += 1
                else:
                    skipped += 1
                continue
            q = town_query(r)
            hit = cache.get("area|" + q) if q else None
            if hit:
                out[key] = hit
            elif region in REGION_CENTER:
                lat, lng = scatter(key, *REGION_CENTER[region], 18, 18)     # close to the middle of the region, not all on one dot
                out[key] = {"lat": lat, "lng": lng, "matched": f"near {region.replace('_', ' ').title()} (approximate)", "how": "area"}
            else:
                skipped += 1
                continue
            near += 1
        print(f"{near} listings placed near their area; {skipped} left off (online, or no borough named)")
        path = REPO / "data/geo" / f"{a.snapshot_id}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {len(out)} points to {path}")


if __name__ == "__main__":
    main()
