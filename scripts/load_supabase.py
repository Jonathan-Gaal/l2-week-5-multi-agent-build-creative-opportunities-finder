"""Load a snapshot from data/snapshots/<id> into Supabase, and optionally publish it (PRD section 4a).

The loader is the only writer. It uses the project's secret key from SUPABASE_SECRET_KEY (Supabase
dashboard > Project Settings > API Keys); never put that key in the app. A snapshot that is already
published in the database is never rewritten.

Usage:
    python3 scripts/load_supabase.py 2026-10-27              # load or reload as staging
    python3 scripts/load_supabase.py 2026-10-27 --publish    # then publish it in one transaction
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agents.filter import last_date  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
URL = os.environ.get("SUPABASE_URL", "https://ofjwdioysmzfeiqlfrkl.supabase.co")
BATCH = 200
COLUMNS = ("dedupe_key", "title", "org", "opportunity_type", "subtype", "borough", "region", "deadline", "recurrence",
           "event_dates", "opens_at", "fee", "award", "location", "eligibility", "disciplines", "source", "source_url",
           "event_website", "extraction", "caveat", "checked_at", "fetched_at")


def row(rec, snapshot_id):
    out = {c: rec.get(c) for c in COLUMNS}
    end = last_date(rec)
    out.update(snapshot_id=snapshot_id, last_date=end.isoformat() if end else None,
               eligibility=rec.get("eligibility") or [], disciplines=rec.get("disciplines") or [],
               event_dates=rec.get("event_dates") or None)
    return out


def api(method, path, key, body=None, prefer=None):
    headers = {"apikey": key, "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(URL + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path.split('?')[0]} failed: HTTP {e.code} {e.read().decode()[:400]}")


def load(snapshot_id, key):
    folder = REPO / "data/snapshots" / snapshot_id
    records = json.loads((folder / "records.json").read_text())["records"]
    manifest = json.loads((folder / "manifest.json").read_text())
    q = urllib.parse.quote(snapshot_id)
    existing = api("GET", f"/rest/v1/snapshots?id=eq.{q}&select=status", key)
    if existing and existing[0]["status"] != "staging":
        sys.exit(f"snapshot {snapshot_id} is {existing[0]['status']} in the database; it will not be rewritten")
    api("POST", "/rest/v1/snapshots", key, {
        "id": snapshot_id, "status": "staging", "snapshot_date": manifest.get("snapshot_date", snapshot_id),
        "record_count": len(records), "manifest": manifest}, prefer="resolution=merge-duplicates")
    api("DELETE", f"/rest/v1/opportunities?snapshot_id=eq.{q}", key)       # staging reload replaces every row
    rows = [row(r, snapshot_id) for r in records]
    for i in range(0, len(rows), BATCH):
        api("POST", "/rest/v1/opportunities", key, rows[i:i + BATCH])
    print(f"loaded {len(rows)} records into staging snapshot {snapshot_id}")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("snapshot_id")
    p.add_argument("--publish", action="store_true")
    a = p.parse_args(argv)
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not key:
        sys.exit("SUPABASE_SECRET_KEY is not set")
    load(a.snapshot_id, key)
    if a.publish:
        api("POST", "/rest/v1/rpc/publish_snapshot", key, {"target": a.snapshot_id})
        print(f"published {a.snapshot_id}")


if __name__ == "__main__":
    main()
