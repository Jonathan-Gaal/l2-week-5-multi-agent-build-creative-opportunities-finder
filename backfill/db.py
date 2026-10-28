"""Snapshot storage. The backfill is the only writer; everything else reads the published snapshot."""
import json
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id TEXT PRIMARY KEY,
    status      TEXT NOT NULL CHECK (status IN ('staging', 'published', 'retired')),
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
    snapshot_id      TEXT NOT NULL REFERENCES snapshots(snapshot_id),
    dedupe_key       TEXT NOT NULL,
    source           TEXT NOT NULL,
    title            TEXT NOT NULL,
    opportunity_type TEXT NOT NULL,
    borough          TEXT NOT NULL,
    eligibility      TEXT NOT NULL DEFAULT '[]',
    fee              TEXT NOT NULL DEFAULT 'unknown',
    deadline         TEXT,
    description      TEXT NOT NULL DEFAULT '',
    source_url       TEXT NOT NULL,
    checked_at       TEXT NOT NULL,
    fetched_at       TEXT NOT NULL,
    provenance       TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (snapshot_id, dedupe_key)
);
"""


def connect(path):
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    return conn


def create_staging(conn, snapshot_id, created_at):
    conn.execute(
        "INSERT INTO snapshots (snapshot_id, status, created_at) VALUES (?, 'staging', ?)",
        (snapshot_id, created_at),
    )
    conn.commit()


def upsert(conn, snapshot_id, rec):
    """Insert a record. A repeat dedupe_key merges its provenance into the existing row.

    Returns True if a new row was stored, False if it was merged into an existing one.
    """
    entry = {"source": rec["source"], "source_url": rec["source_url"], "fetched_at": rec["fetched_at"]}
    row = conn.execute(
        "SELECT provenance FROM records WHERE snapshot_id = ? AND dedupe_key = ?",
        (snapshot_id, rec["dedupe_key"]),
    ).fetchone()
    if row:
        prov = json.loads(row[0])
        if entry not in prov:
            prov.append(entry)
        conn.execute(
            "UPDATE records SET provenance = ? WHERE snapshot_id = ? AND dedupe_key = ?",
            (json.dumps(prov), snapshot_id, rec["dedupe_key"]),
        )
        return False
    conn.execute(
        """INSERT INTO records (snapshot_id, dedupe_key, source, title, opportunity_type, borough,
               eligibility, fee, deadline, description, source_url, checked_at, fetched_at, provenance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            snapshot_id, rec["dedupe_key"], rec["source"], rec["title"], rec["opportunity_type"],
            rec["borough"], json.dumps(rec["eligibility"]), rec["fee"], rec["deadline"],
            rec["description"], rec["source_url"], rec["checked_at"], rec["fetched_at"],
            json.dumps([entry]),
        ),
    )
    return True


def publish(conn, snapshot_id):
    """Atomically point readers at this snapshot and retire the old one."""
    with conn:
        conn.execute("UPDATE snapshots SET status = 'retired' WHERE status = 'published'")
        conn.execute("UPDATE snapshots SET status = 'published' WHERE snapshot_id = ?", (snapshot_id,))
