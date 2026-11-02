"""Writes web/src/data/read-details.json from a snapshot's records.retagged.json: what was read on each listing's own page
(pay, fee, dates, where, the exact deadline time), for the results cards. Only what adds to the stored record is kept, and a
field the page did not give is left out. Usage: python3 scripts/build_read_details.py [snapshot id with a records.retagged.json]"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
snap = sys.argv[1] if len(sys.argv) > 1 else "2026-11-01b"
recs = json.loads((REPO / "data/snapshots" / snap / "records.retagged.json").read_text(encoding="utf-8"))
recs = recs if isinstance(recs, list) else recs["records"]
norm = lambda s: re.sub(r"\W+", "", (s or "").lower())
out = {}
for r in recs:
    if (r.get("read_notes") or "").startswith("Details are from the stored record"):
        continue  # nothing was read from the page, so there is nothing to add
    e = {}
    if r.get("read_pay") and norm(r["read_pay"]) != norm(r.get("award")):
        e["pay"] = r["read_pay"]
    if r.get("read_fee") and norm(r["read_fee"]) != norm(r.get("fee")):
        e["fee"] = r["read_fee"]
    if r.get("read_dates"):
        e["dates"] = r["read_dates"]
    if r.get("read_location"):
        e["where"] = r["read_location"]
    if r.get("read_deadline") and re.search(r"\d\s*(am|pm|a\.m|p\.m)|\bET\b", r["read_deadline"], re.I):
        e["by"] = r["read_deadline"]
    if e:
        out[r["dedupe_key"]] = e
target = REPO / "web/src/data/read-details.json"
target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"{len(out)} listings with page details -> {target}")
