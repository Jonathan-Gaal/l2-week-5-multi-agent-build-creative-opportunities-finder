"""One-time backfill: fetch every source, validate, dedupe, store to staging, publish.

Usage: python -m backfill.run [--db data/snapshot.db]
"""
import argparse
import os
import re
import sys
from datetime import datetime, timezone

from . import a4, craigslist, dancenyc, db, export, extracted, firemics, orgs, parks, playbill

# Add a source by adding a module with NAME, fetch() and to_record().
SOURCES = [parks, a4, firemics, orgs, extracted, craigslist, playbill, dancenyc]


def dedupe_key(rec):
    title = re.sub(r"[^a-z0-9]+", " ", rec["title"].lower()).strip()
    return f"{title}|{rec['borough']}|{rec['deadline'] or 'none'}"


def is_valid(rec):
    return bool(rec["title"] and rec["source_url"] and rec["checked_at"])


def is_expired(rec, today):
    """A deadline earlier than today. Rolling or missing deadlines are not expired."""
    return bool(rec["deadline"]) and rec["deadline"] != "rolling" and rec["deadline"] < today


def in_nyc(rec, source):
    """No confirmed NYC location, no record.

    Sources that only list NYC set NYC_ONLY. Any other source must have its records marked
    nyc_confirmed (the Extractor's job), so a record from a national site is dropped until then.
    """
    return bool(getattr(source, "NYC_ONLY", False) or rec.get("nyc_confirmed"))


def run(db_path, sources=SOURCES, now=None):
    now = now or datetime.now(timezone.utc).isoformat(timespec="seconds")
    snapshot_id = now
    conn = db.connect(db_path)
    db.create_staging(conn, snapshot_id, now)
    stats = {}
    for source in sources:
        s = stats[source.NAME] = {
            "fetched": 0, "not_opportunity": 0, "not_nyc": 0, "invalid": 0, "expired": 0, "stored": 0, "merged": 0,
        }
        for item in source.fetch():
            s["fetched"] += 1
            rec = source.to_record(item)
            if rec is None:
                s["not_opportunity"] += 1
                continue
            rec.update(checked_at=now, fetched_at=now)
            rec["dedupe_key"] = dedupe_key(rec)
            if not in_nyc(rec, source):
                s["not_nyc"] += 1
                continue
            if not is_valid(rec):
                s["invalid"] += 1
                continue
            if is_expired(rec, now[:10]):
                s["expired"] += 1
                continue
            s["stored" if db.upsert(conn, snapshot_id, rec) else "merged"] += 1
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM records WHERE snapshot_id = ?", (snapshot_id,)).fetchone()[0]
    if total == 0:
        # A failed run must not replace a working snapshot.
        print("No records stored; leaving the current snapshot in place.", file=sys.stderr)
        return stats, snapshot_id, 0
    db.publish(conn, snapshot_id)
    return stats, snapshot_id, total


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/snapshot.db")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.db) or ".", exist_ok=True)
    stats, snapshot_id, total = run(args.db)
    for name, s in stats.items():
        print(name, s)
    print(f"snapshot {snapshot_id}: {total} records")
    paths = export.export(args.db)
    if paths:
        print("readable copies:", *paths)
