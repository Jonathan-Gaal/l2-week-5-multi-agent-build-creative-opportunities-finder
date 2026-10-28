"""Filter (code): select snapshot records for a request and drop expired or failed-schema ones.

A request is a place and an opportunity type. The place is an NYC borough or one of the snapshot
regions outside NYC. Hard filters are never relaxed:
- borough requests match that borough or 'citywide' (open to any NYC resident); 'unknown' never matches;
- region requests match the record's region;
- type must equal the record's opportunity_type;
- expired: the record's last date is earlier than the request date. For events with several
  occurrences that is the last occurrence, so a series that has started but not ended is kept.
  'recurring', 'rolling' and a missing deadline never expire.
"""

import datetime as dt
import json
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SNAPSHOT = REPO / "data/snapshots/2026-10-27"

BOROUGHS = ("manhattan", "brooklyn", "queens", "bronx", "staten_island")
REGIONS = ("nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut", "pennsylvania",
           "massachusetts", "rhode_island", "vermont", "new_hampshire", "maine", "delaware", "maryland", "dc")
TYPES = ("event", "open_call", "grant", "residency", "job")
REQUIRED = ("title", "source_url", "checked_at", "snapshot_id", "dedupe_key", "source")


@dataclass(frozen=True)
class Request:
    place: str
    type: str
    as_of: dt.date = field(default_factory=dt.date.today)

    def problem(self):
        """Why the request can't be served, or None."""
        if self.place not in BOROUGHS + REGIONS:
            return f"unknown place '{self.place}'"
        if self.type not in TYPES:
            return f"unknown opportunity type '{self.type}'"
        return None

    def label(self):
        return f"{self.place.replace('_', ' ').title()} {self.type.replace('_', ' ')}"


def load(snapshot_dir=SNAPSHOT):
    return json.loads((Path(snapshot_dir) / "records.json").read_text())["records"]


def last_date(rec):
    """The date after which the record is gone, or None if it never expires."""
    dates = [d for d in rec.get("event_dates") or [] if d]
    if dates:
        return dt.date.fromisoformat(max(dates))
    try:
        return dt.date.fromisoformat(rec.get("deadline") or "")
    except ValueError:
        return None      # recurring, rolling, or not listed


def is_expired(rec, as_of):
    d = last_date(rec)
    return d is not None and d < as_of


def schema_ok(rec):
    return all(rec.get(f) for f in REQUIRED)


def matches(rec, req):
    """Place and type hard filters (not expiry)."""
    if rec.get("opportunity_type") != req.type:
        return False
    if req.place in BOROUGHS:
        return rec.get("borough") in (req.place, "citywide")
    return rec.get("region") == req.place


def select(records, req):
    """Return (candidates, removed) where removed counts excluded matches by reason."""
    candidates, removed, seen = [], {"expired": 0, "failed_schema": 0, "duplicate": 0}, set()
    for rec in records:
        if not matches(rec, req):
            continue
        if not schema_ok(rec):
            removed["failed_schema"] += 1
        elif is_expired(rec, req.as_of):
            removed["expired"] += 1
        elif rec["dedupe_key"] in seen:
            removed["duplicate"] += 1
        else:
            seen.add(rec["dedupe_key"])
            candidates.append(rec)
    return candidates, removed
