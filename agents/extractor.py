"""Extractor: read a fetched listing page and write candidate records in the snapshot schema (PRD section 3).

It sits between `verify_sources.py fetch` and `verify_sources.py verify`. It never fetches anything: it reads
only pages the project crawler already cleared (paid denylist, robots.txt for the exact URL, bot challenge,
terms), listed as "readable" in triage.json. The model only proposes candidates; verify trusts none of it
(page returns 200, title and dated line are on the page, eligibility quotes match verbatim, date not past,
place in scope, not a duplicate). So the code here owns the fields a page must never choose: `source` is the
seed id and `source_url` is the page that was read. The record rules follow data/seeds/INVALIDATORS.md.

Usage:
    python -m agents.extractor --pages data/research/verify-2026-10-28 --out candidates.json
    python -m agents.extractor --pages data/research/verify-2026-10-28 --out candidates.json --ids some-seed-id --max-pages 5
    python3 scripts/verify_sources.py verify candidates.json --pages data/research/verify-2026-10-28
"""

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from agents.filter import BOROUGHS, REGIONS, REPO, TYPES
from agents.model import ClaudeModel, ModelError
from agents.roles import UNTRUSTED

SEEDS = REPO / "data/seeds/seed-sources.json"
MAX_PAGE_CHARS = 60000
# Never take a deadline from a list card on these (INVALIDATORS.md, "Aggregator dates"): cards omit the year
# and "Rolling" is often wrong. The record is kept without a date so the primary page can be read next.
# Subtypes already in the snapshot (manifest by_type); the Ranker and the type labels read them.
SUBTYPES = ("open_mic", "paid_gig", "audition", "workshop", "dance_night", "jam", "class", "drawing_session",
            "fellowship", "competition", "commission", "studio_access", "teaching_gig", "open_studio",
            "full_time", "internship")
LIST_CATEGORIES = ("aggregator", "newsletter", "discovery_source", "api_discovery_source")


def _text(nullable=True):
    return {"type": ["string", "null"]} if nullable else {"type": "string"}


RECORD_SCHEMA = {
    "type": "object",
    "properties": {
        "title": _text(False),
        "org": _text(),
        "opportunity_type": {"type": "string", "enum": list(TYPES)},
        "region": {"type": "string", "enum": list(REGIONS)},
        "subtype": {"type": ["string", "null"], "enum": [*SUBTYPES, None]},
        "borough": {"type": ["string", "null"], "enum": [*BOROUGHS, "citywide", "unknown", None]},
        "deadline": _text(),
        "fee": _text(),
        "award": _text(),
        "eligibility": {"type": "array", "items": {
            "type": "object",
            "properties": {"requirement": _text(False), "quote": _text(False)},
            "required": ["requirement", "quote"], "additionalProperties": False}},
        "disciplines": {"type": "array", "items": {"type": "string"}},
        "location": _text(),
        "event_dates": {"type": "array", "items": {"type": "string"}},
        "recurrence": _text(),
        "caveat": _text(),
    },
    "required": ["title", "org", "opportunity_type", "subtype", "region", "borough", "deadline", "fee", "award",
                 "eligibility", "disciplines", "location", "event_dates", "recurrence", "caveat"],
    "additionalProperties": False,
}
EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {"records": {"type": "array", "items": RECORD_SCHEMA}},
    "required": ["records"], "additionalProperties": False,
}

INSTRUCTIONS = f"""You extract open arts opportunities from the text of one web page into records.

Return one record for each opportunity an artist could still act on: an open call, grant, residency, job,
or event. Return an empty list when the page has none (closed, past, news only, or a list of links).

Rules for every field:
- Use only what the page says. Never guess. If the page does not state something, use null (or an empty
  list for eligibility, event_dates and disciplines), and fee "unknown" when no fee is stated.
- title: the opportunity's own name as the page writes it.
- opportunity_type: one of {", ".join(TYPES)}. A salaried or hourly position is "job"; put the pay in award.
- subtype: one of {", ".join(SUBTYPES)} when one fits (an open mic is an event with subtype open_mic; a paid
  gig or casting is an open_call with subtype paid_gig or audition), otherwise null.
- region: one of {", ".join(REGIONS)}. Skip opportunities outside these regions.
- borough: for region "nyc" give one of {", ".join(BOROUGHS)}, "citywide" (open to any NYC resident) or
  "unknown". For every other region use null.
- deadline: an ISO date (YYYY-MM-DD) only when the page states the day, month and year. "rolling" or
  "recurring" only when the page says so. Otherwise null. Skip anything whose date has passed.
- event_dates: ISO dates for events, as stated on the page. recurrence: a weekly or monthly schedule as the
  page words it (for example "Weekly Wednesday 8:00pm"), otherwise null.
- fee: the application or entry fee as written, "none" only when the page says there is no fee, otherwise "unknown".
- award: the pay, stipend, or prize as written, or null.
- eligibility: each stated requirement, with a quote copied word for word from the page. Never paraphrase a
  quote, and drop a requirement you cannot quote.
- disciplines: short lowercase words such as "visual", "music", "dance", "theater", "writing", or "all".
- caveat: a short note when the listing is unclear or partly missing, otherwise null.

Which listings to leave out (return nothing for them):
- closed cycles, cancelled instances, "applications open soon", and schedules the page does not confirm;
- paid reviews, features, or "evidence" services presented as open calls (pay-to-publish);
- listings limited to children or teens, and anything that is not an arts opportunity or arts participation;
- audience-only events an artist can only attend (a concert, a craft fair, a ticketed show). Keep events the
  artist can take part in: perform, show work, apply to, learn or make.

Which to keep: paid artist work, grants and stipends, and free hands-on participation such as open mics, jams,
drum circles, classes, workshops, writing groups and studio access. Record pay (award) and any participation
or application cost (fee) separately. A fee is "unknown" until the page states it, and unknown pay is never
paid. A series of dates for one program is one record with all dates in event_dates.
Eligibility: borough is the borough that eligibility is restricted to; if eligibility is not borough-restricted
it is the venue's borough.

{UNTRUSTED}"""


class Extractor:
    def __init__(self, model):
        self.model = model

    def extract(self, page_text, source, source_url):
        """Return (candidate records, usage). `source` is the seed entry (id, name, category, notes).
        `source` and `source_url` on each record come from the caller, never from the page."""
        text = page_text[:MAX_PAGE_CHARS]
        context = f"Source: {source.get('name') or source['id']} (category: {source.get('category')})"
        if source.get("notes"):
            context += f"\nProject notes on this source: {source['notes']}"
        user = f"{context}\nPage address: {source_url}\n\n<page>\n{text}\n</page>"
        out, usage = self.model.call(INSTRUCTIONS, user, EXTRACT_SCHEMA)
        from_list = source.get("category") in LIST_CATEGORIES
        records = []
        for r in out["records"]:
            if not (r.get("title") or "").strip():
                continue
            r = clean_dates({k: v for k, v in r.items() if v not in (None, [], "")})
            if from_list and r.pop("deadline", None):
                r["caveat"] = "deadline not taken from an aggregator list; read the primary page. " + r.get("caveat", "")
            r.update(source=source["id"], source_url=source_url, extraction="llm_extractor")
            records.append(r)
        return records, usage


def _is_date(value):
    try:
        dt.date.fromisoformat(value)
        return True
    except (TypeError, ValueError):
        return False


def clean_dates(r):
    """Keep only real ISO dates. A deadline that is not a date, "rolling" or "recurring" is dropped with a caveat,
    so a model slip like 2026-02-30 or 2026-12 never reaches verify as a date."""
    dropped = []
    if r.get("deadline") not in (None, "rolling", "recurring") and not _is_date(r.get("deadline")):
        dropped.append(r.pop("deadline"))
    if r.get("event_dates"):
        kept = [d for d in r["event_dates"] if _is_date(d)]
        dropped += [d for d in r["event_dates"] if d not in kept]
        r["event_dates"] = kept
    if dropped:
        r["caveat"] = f"date not usable as written ({', '.join(map(str, dropped))}); read the page. " + r.get("caveat", "")
    return {k: v for k, v in r.items() if v not in (None, [], "")}


def seed_sources(path=SEEDS):
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    return {s["id"]: s for s in (doc["sources"] if isinstance(doc, dict) else doc)}


def extract_pages(pages_dir, extractor, seeds=None, ids=None, max_pages=None):
    """Run the Extractor over every readable page in `pages_dir/triage.json`. Returns (candidates, stats)."""
    pages_dir = Path(pages_dir)
    triage = json.loads((pages_dir / "triage.json").read_text(encoding="utf-8"))
    seeds = seeds or {}
    candidates, errors, usage, pages = [], [], {"input_tokens": 0, "output_tokens": 0}, 0
    for t in triage:
        if t["outcome"] != "readable" or (ids and t["id"] not in ids):
            continue
        for page in t["pages"]:
            if max_pages is not None and pages >= max_pages:
                break
            pages += 1
            text = (pages_dir / page["artifact"]).read_text(encoding="utf-8", errors="replace")
            try:
                recs, u = extractor.extract(text, seeds.get(t["id"], {"id": t["id"]}), page["url"])
            except ModelError as e:
                errors.append({"source": t["id"], "url": page["url"], "error": str(e)})
                continue
            candidates += recs
            usage = {k: usage[k] + u.get(k, 0) for k in usage}
    return candidates, {"pages": pages, "records": len(candidates), "errors": errors, "usage": usage}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--pages", required=True, help="the verify_sources.py fetch output directory")
    p.add_argument("--out", required=True, help="candidates file for verify_sources.py verify")
    p.add_argument("--ids", nargs="*", help="only these seed source ids")
    p.add_argument("--max-pages", type=int, help="cap on model calls (one per page)")
    p.add_argument("--model", default=None)
    a = p.parse_args(argv)
    extractor = Extractor(ClaudeModel(a.model) if a.model else ClaudeModel())
    cands, stats = extract_pages(a.pages, extractor, seed_sources(), a.ids, a.max_pages)
    Path(a.out).write_text(json.dumps(cands, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{stats['pages']} pages -> {stats['records']} candidates, {len(stats['errors'])} failed pages, "
          f"tokens {stats['usage']['input_tokens']} in / {stats['usage']['output_tokens']} out")
    for e in stats["errors"]:
        print(f"  failed {e['source']} {e['url']}: {e['error']}", file=sys.stderr)


if __name__ == "__main__":
    main()
