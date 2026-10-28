"""Verify held seed sources and add their opportunities to the staging snapshot (data/seeds/INVALIDATORS.md).

Three steps, run in order:

  fetch   Crawl held sources through the project crawler (paid denylist, robots.txt for the exact URL,
          bot challenge, terms restriction), one link deep, and write a triage of what each source returned.
  verify  Check candidate records extracted from the fetched pages: the page returns 200 today, the title is
          on the page, the date is on the page with its year, eligibility quotes match verbatim, the date
          has not passed, the place is in scope, and the record is not already in the snapshot.
  merge   Add verified records to the staging snapshot, recount the manifest, move sources that produced
          records from hold to keep, and log every held or dropped item with its reason.

Extraction (fetched page -> candidate record) sits between fetch and verify. It is the PRD's Extractor step:
a person or the Extractor reads the page and writes candidates in the snapshot schema; verify trusts none of it.

Usage:
    python3 scripts/verify_sources.py fetch --category residency grant fellowship --out data/research/verify-2026-10-28
    python3 scripts/verify_sources.py verify candidates.json --pages data/research/verify-2026-10-28
    python3 scripts/verify_sources.py merge data/research/verify-2026-10-28/verified.json
"""

import argparse
import collections
import concurrent.futures as cf
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crawl_opportunity_sources as crawler  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
SNAPSHOT = REPO / "data/snapshots/2026-10-27"
SEEDS = REPO / "data/seeds/seed-sources.json"
TODAY = dt.date.today().isoformat()
MONTHS = "January February March April May June July August September October November December".split()
REGIONS = {"nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut", "pennsylvania",
           "massachusetts", "rhode_island", "vermont", "new_hampshire", "maine", "delaware", "maryland", "dc"}
BOROUGHS = {"manhattan", "brooklyn", "queens", "bronx", "staten_island", "citywide", "unknown"}
TYPES = {"event", "open_call", "grant", "residency", "job"}
REQUIRED = ("title", "org", "opportunity_type", "region", "source", "source_url", "disciplines")


# ---- text comparison -------------------------------------------------------------------------------

def flat(text):
    """Quote comparison: unicode-normalized, straight quotes, collapsed whitespace, case-folded."""
    t = unicodedata.normalize("NFKC", text or "")
    for a, b in (("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'), ("–", "-"), ("—", "-")):
        t = t.replace(a, b)
    return " ".join(t.split()).casefold()


def words(text):
    """Title and dedupe comparison: letters and digits only."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", flat(text)).split())


def dedupe_key(rec):
    return f"{words(rec['title'])}|{rec.get('borough') or rec['region']}|{rec.get('deadline')}"


def same_listing(a, b):
    """Same date and place, and one title's words mostly contained in the other's. Not source_url alone:
    one calendar page often lists many different events. Only for dated listings: undated ones share no
    date, so short similar titles ("drummer wanted") would fold different listings together."""
    if not str(a.get("deadline") or "").startswith("20"):
        return False
    if a.get("source") and a.get("source") == b.get("source") and a.get("extraction") == b.get("extraction"):
        return False    # one collection run was already de-duplicated; different titles there are different listings
    if a.get("deadline") != b.get("deadline") or (a.get("borough") or a["region"]) != (b.get("borough") or b["region"]):
        return False
    wa, wb = _distinctive(a["title"]), _distinctive(b["title"])
    shared = wa & wb
    return bool(shared) and len(shared) / min(len(wa), len(wb)) >= 0.6


# Words that every listing of a kind shares; matching on them folds different venues or shows together.
FILLER = set("a an and at by for in of on the to with open mic mics call calls audition auditions grant grants "
             "program programs series night presents wanted seeking nyc new york ny epa".split())


def _distinctive(title):
    return {w for w in words(title).split() if w not in FILLER and not w.isdigit()}


def date_patterns(iso):
    d = dt.date.fromisoformat(iso)
    mon = MONTHS[d.month - 1]
    return [rf"\b{mon}\s*\.?\s*{d.day}(?:st|nd|rd|th)?\b", rf"\b{mon[:3]}\.?\s*{d.day}(?:st|nd|rd|th)?\b",
            rf"\b{d.day}(?:st|nd|rd|th)?\s+(?:of\s+)?{mon}\b", rf"\b0?{d.month}/0?{d.day}\b", rf"\b{iso}\b"]


def date_quote(text, iso):
    """The page line stating the date, trimmed to a quotable span; None when the date or its year is absent."""
    if iso[:4] not in text:
        return None
    for line in text.splitlines():
        for pat in date_patterns(iso):
            m = re.search(pat, line, re.I)
            if m:
                s, e = max(0, m.start() - 140), min(len(line), m.end() + 140)
                return " ".join(line[s:e].split())
    return None


# ---- record checks (pure; the page text is passed in) ---------------------------------------------

def check_record(rec, page_text, today=TODAY):
    """Return (record ready for the snapshot, None) or (None, reason it is held)."""
    missing = [f for f in REQUIRED if not rec.get(f)]
    if missing:
        return None, f"missing {', '.join(missing)}"
    if rec["opportunity_type"] not in TYPES:
        return None, f"unknown type {rec['opportunity_type']}"
    if rec["region"] not in REGIONS or (rec["region"] == "nyc") != bool(rec.get("borough")) \
            or (rec.get("borough") and rec["borough"] not in BOROUGHS):
        return None, "place out of scope or inconsistent (nyc needs a borough; elsewhere borough is null)"
    deadline = rec.get("deadline")
    dates = [d for d in (rec.get("event_dates") or []) if d]
    for d in [deadline, *dates]:
        if str(d or "")[:2] == "20":
            try:
                dt.date.fromisoformat(d)
            except ValueError:
                return None, "date is not a real calendar date"
    last = max(dates) if dates else (deadline if deadline and deadline[:2] == "20" else None)
    if last and last < today:
        return None, "past"
    if words(rec["title"]) not in words(page_text):
        return None, "title not on page"
    out = dict(rec)
    if deadline and deadline[:2] == "20":
        q = date_quote(page_text, deadline)
        if not q:
            return None, "date not on page"
        if not any(flat(q) in flat(e.get("quote")) or flat(e.get("quote")) in flat(q) for e in rec.get("eligibility") or []):
            out["eligibility"] = (rec.get("eligibility") or []) + [{"requirement": "date as stated", "quote": q}]
    kept = [e for e in out.get("eligibility") or [] if e.get("quote") and flat(e["quote"]) in flat(page_text)]
    dropped = len(out.get("eligibility") or []) - len(kept)
    out["eligibility"] = kept
    out.setdefault("fee", "unknown")
    for f in ("award", "subtype", "location", "event_dates", "recurrence", "opens_at", "caveat", "event_website"):
        out.setdefault(f, None)
    out.setdefault("extraction", "crawl_reviewed")
    out.update(snapshot_id=SNAPSHOT.name, checked_at=today, fetched_at=today, dedupe_key=dedupe_key(out))
    return out, (f"{dropped} quote(s) not on page, removed" if dropped else None)


def find_duplicate(rec, existing):
    return next((x for x in existing if x["dedupe_key"] == rec["dedupe_key"] or same_listing(x, rec)), None)


# ---- steps -----------------------------------------------------------------------------------------

def _seeds():
    doc = json.loads(SEEDS.read_text())
    return doc, (doc["sources"] if isinstance(doc, dict) else doc)


def _crawler(out, depth=1, per_source=6):
    crawler.DISPLAY_ONLY_HOSTS.update(h for s in json.loads(crawler.PAID_SOURCE_FILE.read_text()).get("sources", [])
                                      for h in s.get("hosts", []))
    return crawler.Crawler(out, depth, per_source, 40)


def select_held(seeds, categories=None, statuses=None, ids=None):
    return [s for s in seeds if s.get("verdict") == "hold" and s.get("url")
            and (not ids or s["id"] in ids)
            and (not categories or s.get("category") in categories)
            and (not statuses or s.get("status") in statuses)]


def triage(source_result, page_log):
    """One source's gate outcome from its crawl: blocked (with reason) or readable (with page artifacts)."""
    pages = source_result["pages"]
    first = pages[0].get("resolved_status", pages[0]["status"]) if pages else "no_pages"
    fetched = [page_log[p.get("resolved_url", p["url"])] for p in pages
               if p.get("resolved_status", p["status"]) == "fetched" and p.get("resolved_url", p["url"]) in page_log]
    if any(f.get("terms_restriction_detected") for f in fetched):
        return {"id": source_result["source_id"], "outcome": "blocked", "reason": "terms restrict automated access"}
    if first != "fetched":
        return {"id": source_result["source_id"], "outcome": "blocked", "reason": first}
    return {"id": source_result["source_id"], "outcome": "readable",
            "pages": [{"url": f["url"], "artifact": f["artifact"], "title": f.get("title"),
                       "dated_lines": [e["text"][:300] for e in f.get("evidence", []) if re.search(r"\b202[67]\b", e["text"])][:12]}
                      for f in fetched]}


def cmd_fetch(a):
    _, seeds = _seeds()
    chosen = select_held(seeds, a.category, a.status, a.ids)
    out = Path(a.out)
    cr = _crawler(out, a.depth, a.per_source)
    # access, tier and scrape_policy let the crawler refuse paid display-only sources outright.
    jobs = [{"id": s["id"], "name": s["name"], "source_url": s["url"], "access": s.get("access"), "tier": s.get("tier"),
             "scrape_policy": s.get("scrape_policy")} for s in chosen]
    with cf.ThreadPoolExecutor(8) as ex:
        results = list(ex.map(cr.crawl_source, jobs))
    cr.save(results)
    page_log = {p["url"]: p for p in cr.logs}
    tri = [triage(r, page_log) for r in results]
    (out / "triage.json").write_text(json.dumps(tri, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(chosen)} held sources;", dict(collections.Counter(t.get("reason", t["outcome"]) for t in tri)))


def cmd_verify(a):
    pages = Path(a.pages)
    cands = json.loads(Path(a.candidates).read_text())
    cands = cands["records"] if isinstance(cands, dict) else cands
    snap = json.loads((SNAPSHOT / "records.json").read_text())["records"]
    cr = _crawler(pages, 0, 1)

    def run(rec):
        page = cr.fetch(rec["source_url"])
        while page.get("target_result"):
            page = page["target_result"]
        if page["status"] != "fetched":
            return None, f"page {page['status']}"
        if page.get("terms_restriction_detected"):
            return None, "terms restriction on page"
        return check_record(rec, (pages / page["artifact"]).read_text())

    with cf.ThreadPoolExecutor(8) as ex:
        results = list(ex.map(run, cands))
    verified, held = [], []
    for cand, (rec, note) in zip(cands, results):
        dup = rec and find_duplicate(rec, snap + verified)
        if rec and not dup:
            verified.append(rec)
            if note:
                print(f"  note {rec['title'][:60]}: {note}")
        else:
            reason = f"duplicate of '{dup['title']}' ({dup['source']})" if dup else note
            held.append({"title": cand.get("title"), "source": cand.get("source"), "source_url": cand.get("source_url"),
                         "reason": "duplicate" if dup else reason, "detail": reason if dup else None})
    (pages / "verified.json").write_text(json.dumps(verified, indent=1, ensure_ascii=False) + "\n")
    (pages / "held.json").write_text(json.dumps(held, indent=1, ensure_ascii=False) + "\n")
    print(f"verified {len(verified)}, held {len(held)}:", dict(collections.Counter(h["reason"] for h in held)))


def recount(man, recs):
    man["record_count"] = len(recs)
    man["by_borough"] = dict(collections.Counter(r["borough"] for r in recs if r["region"] == "nyc").most_common())
    man["by_region"] = dict(collections.Counter(r["region"] for r in recs).most_common())
    man["by_type"] = dict(collections.Counter(r["opportunity_type"] + (f"/{r['subtype']}" if r.get("subtype") else "")
                                              for r in recs).most_common())
    man["by_extraction"] = dict(collections.Counter(r.get("extraction") or "manual" for r in recs).most_common())
    man["by_discipline"] = dict(collections.Counter(d for r in recs for d in r.get("disciplines") or []).most_common())


def cmd_merge(a):
    snap_path, man_path = SNAPSHOT / "records.json", SNAPSHOT / "manifest.json"
    snap, man = json.loads(snap_path.read_text()), json.loads(man_path.read_text())
    if man["status"] != "staging":
        sys.exit("refusing to change a published snapshot")
    seeds_doc, seeds = _seeds()
    by_id = {s["id"]: s for s in seeds}
    new = json.loads(Path(a.verified).read_text())
    unknown = sorted({r["source"] for r in new} - set(by_id))
    if unknown:
        sys.exit(f"records whose source is not in seed-sources.json: {unknown}")
    added = [r for r in new if not find_duplicate(r, snap["records"])]
    snap["records"] += added
    snap["count"] = len(snap["records"])
    recount(man, snap["records"])
    stamp = TODAY.replace("-", "_")
    for sid, n in collections.Counter(r["source"] for r in added).items():
        s = by_id[sid]
        if s.get("verdict") == "hold":
            s.update(verdict="keep", ingest=True)
        s["checked"] = f"verified {TODAY}"
        s["checks"] = (s.get("checks") or "") + (f" {TODAY}: robots allowed, no bot challenge or terms restriction; "
                                                 f"{n} record(s) verified on their own pages (scripts/verify_sources.py).")
        s[f"records_{stamp}"] = n
    for t in json.loads(Path(a.triage).read_text()) if a.triage else []:
        s = by_id.get(t["id"])
        if s and t["outcome"] == "blocked" and s.get("verdict") == "hold":
            s["checks"] = (s.get("checks") or "") + f" {TODAY}: held, {t['reason']}."
    for sid in a.checked_no_records or []:
        if by_id[sid].get("verdict") == "hold":
            by_id[sid]["checks"] = (by_id[sid].get("checks") or "") + f" {TODAY}: readable; nothing open and in scope on the pages read."
    ingested = man["sources"].setdefault("ingested_with_records", [])
    ingested += sorted({r["source"] for r in added} - set(ingested))
    held = json.loads(Path(a.held).read_text()) if a.held else []
    man["dropped_records"] += [{**h, "checked": TODAY} for h in held]
    man["verification"].append(
        f"{TODAY} held-source pass: {len(added)} records from {len({r['source'] for r in added})} sources. Each source_url returned 200 "
        f"through the crawler (paid denylist, robots.txt, bot challenge, terms); title and dated line found on the record's own page; "
        f"eligibility quotes matched verbatim (scripts/verify_sources.py).")
    snap_path.write_text(json.dumps(snap, indent=2, ensure_ascii=False) + "\n")
    man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
    SEEDS.write_text(json.dumps(seeds_doc, indent=2, ensure_ascii=False) + "\n")
    print(f"added {len(added)} (skipped {len(new) - len(added)} already present); snapshot now {snap['count']}")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--category", nargs="*")
    f.add_argument("--status", nargs="*")
    f.add_argument("--ids", nargs="*")
    f.add_argument("--depth", type=int, default=1)
    f.add_argument("--per-source", type=int, default=6)
    f.add_argument("--out", required=True)
    v = sub.add_parser("verify")
    v.add_argument("candidates")
    v.add_argument("--pages", required=True, help="the fetch output directory")
    m = sub.add_parser("merge")
    m.add_argument("verified")
    m.add_argument("--held")
    m.add_argument("--triage")
    m.add_argument("--checked-no-records", nargs="*", help="source ids that were readable but had nothing to add")
    a = p.parse_args(argv)
    {"fetch": cmd_fetch, "verify": cmd_verify, "merge": cmd_merge}[a.cmd](a)


if __name__ == "__main__":
    main()
