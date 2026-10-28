"""Request path: Filter -> Ranker -> code checks -> Reviewer -> Output, with the loop contract (PRD sections 7-8).

- At most MAX_ATTEMPTS ranking attempts (1 initial, 2 retries); a rejected or failed attempt feeds its
  ranking and the critique back to the Ranker.
- Code checks run before the Reviewer on every attempt, so hard filters hold even if the model is wrong.
- Tier 0: an attempt passed the checks and the Reviewer accepted it.
- Tier 2: best attempt that passed the checks without an accept (Reviewer rejected every time, errored,
  or was not run); if no attempt passed, the code baseline ranking. Labeled "not fully checked".
- Tier 3: no result, with the reason.
Each request appends one JSON line to the trace file.

Usage:
    python -m agents.pipeline brooklyn open_call                 # Claude ranker + reviewer
    python -m agents.pipeline brooklyn open_call --baseline      # code ranker only, no model calls
"""

import argparse
import datetime as dt
import json
import sys
import uuid
from pathlib import Path

from agents import filter as flt
from agents.model import ClaudeModel, ModelError
from agents.roles import TOP_K, BaselineRanker, Ranker, Reviewer, baseline_order

MAX_ATTEMPTS = 3
MAX_CANDIDATES = 80
TRACE_DIR = flt.REPO / "traces"


def check_ranking(ranking, by_id, req):
    """Code checks on one attempt. Returns a list of problems (empty means it passes)."""
    if not ranking and by_id:
        return ["ranking is empty but there are candidates"]
    problems, ids, keys = [], set(), set()
    if len(ranking) > TOP_K:
        problems.append(f"more than {TOP_K} results")
    for item in ranking:
        rec = by_id.get(item.get("id"))
        if rec is None:
            problems.append(f"{item.get('id')}: not one of the candidate ids")
            continue
        if item["id"] in ids or rec["dedupe_key"] in keys:
            problems.append(f"{item['id']}: listed twice")
        ids.add(item["id"])
        keys.add(rec["dedupe_key"])
        if not flt.matches(rec, req) or flt.is_expired(rec, req.as_of) or not flt.schema_ok(rec):
            problems.append(f"{item['id']}: fails the place, type or expiry filter")
    return problems


def removed_note(removed):
    words = {"expired": "expired", "failed_schema": "incomplete", "duplicate": "duplicate"}
    parts = [f"{n} {words[k]} listing{'s' if n != 1 else ''} removed" for k, n in removed.items() if n]
    return ("; ".join(parts) + ".") if parts else None


UNVERIFIED = "mara_backfill_unverified"   # teammate-collected records never rechecked against the source page


def label(rec, tier):
    if rec.get("extraction") == UNVERIFIED:
        return "From a teammate's list, not rechecked against the source"
    return f"Checked {rec['checked_at']}" + ("" if tier == 0 else " · not fully checked")


def present(rec, tier):
    elig = rec.get("eligibility") or []
    fee = rec.get("fee")
    return {
        "title": rec["title"], "org": rec.get("org"), "type": rec["opportunity_type"], "subtype": rec.get("subtype"),
        "place": rec.get("borough") or rec.get("region"), "location": rec.get("location"),
        "deadline": rec.get("deadline") or "Deadline not listed",
        "event_dates": rec.get("event_dates") or None, "recurrence": rec.get("recurrence"),
        "fee": "Fee unknown" if fee in (None, "unknown") else fee, "award": rec.get("award"),
        "eligibility": [{"requirement": e["requirement"], "quote": e.get("quote")} for e in elig] or "Eligibility not stated",
        "source": rec["source"], "source_url": rec["source_url"],
        "label": label(rec, tier),
        "caveat": rec.get("caveat"), "dedupe_key": rec["dedupe_key"],
    }


def _add(total, usage):
    for k, v in usage.items():
        total[k] = total.get(k, 0) + v


def run(req, records, ranker, reviewer=None, trace_path=None, max_candidates=MAX_CANDIDATES):
    trace = {"request_id": uuid.uuid4().hex[:12], "at": dt.datetime.now().isoformat(timespec="seconds"),
             "request": {"place": req.place, "type": req.type, "as_of": req.as_of.isoformat()},
             "attempts": [], "tokens": {"input_tokens": 0, "output_tokens": 0}}

    def finish(result):
        trace.update(tier=result["tier"], served=[r["dedupe_key"] for r in result["results"]], reason=result.get("reason"))
        if trace_path:
            Path(trace_path).parent.mkdir(parents=True, exist_ok=True)
            with open(trace_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(trace) + "\n")
        result["request_id"] = trace["request_id"]
        return result

    problem = req.problem()
    if problem:
        return finish({"tier": 3, "results": [], "reason": problem, "removed": None, "removed_counts": None})

    cands, removed = flt.select(records, req)
    trace["filter"] = {"matched": len(cands), "removed": removed}
    note = removed_note(removed)
    if not cands:
        return finish({"tier": 3, "results": [], "reason": f"no records match {req.label()}", "removed": note,
                       "removed_counts": removed})

    ordered = baseline_order([(None, r) for r in cands])
    trace["filter"]["sent_to_ranker"] = min(len(ordered), max_candidates)
    shown = [(f"r{i + 1}", r) for i, (_, r) in enumerate(ordered[:max_candidates])]
    by_id = dict(shown)

    best, tier, previous, critique = None, 2, None, None
    for n in range(MAX_ATTEMPTS):
        attempt = {"n": n + 1}
        trace["attempts"].append(attempt)
        try:
            ranking, usage = ranker.rank(req, shown, previous, critique)
            _add(trace["tokens"], usage)
        except ModelError as e:
            attempt["ranker_error"] = str(e)
            continue
        attempt["ranking"] = [i.get("id") for i in ranking]
        problems = check_ranking(ranking, by_id, req)
        if problems:
            attempt["check_problems"] = problems
            previous, critique = ranking, "Code checks failed: " + "; ".join(problems)
            continue
        best = ranking
        if reviewer is None:
            attempt["review"] = "not run"
            break
        try:
            verdict, usage = reviewer.review(req, shown, ranking)
            _add(trace["tokens"], usage)
        except ModelError as e:
            attempt["reviewer_error"] = str(e)
            break
        attempt["verdict"], attempt["critique"] = verdict["verdict"], verdict["critique"]
        if verdict["verdict"] == "accept":
            tier = 0
            break
        previous, critique = ranking, verdict["critique"]

    if best is None:
        best, _ = BaselineRanker().rank(req, shown)
        trace["fallback"] = "code baseline"
    results = [present(by_id[i["id"]], tier) for i in best]
    return finish({"tier": tier, "results": results, "removed": note, "removed_counts": removed})


def main(argv=None):
    p = argparse.ArgumentParser(description="Serve one request against the snapshot.")
    p.add_argument("place", help="borough (brooklyn, staten_island, ...) or region (new_jersey, dc, ...)")
    p.add_argument("type", choices=flt.TYPES)
    p.add_argument("--as-of", type=dt.date.fromisoformat, default=dt.date.today())
    p.add_argument("--baseline", action="store_true", help="code ranker only, no model calls")
    p.add_argument("--no-review", action="store_true", help="Claude ranker without the Reviewer")
    p.add_argument("--snapshot", default=flt.SNAPSHOT)
    a = p.parse_args(argv)
    req = flt.Request(a.place, a.type, a.as_of)
    if a.baseline:
        ranker, reviewer = BaselineRanker(), None
    else:
        model = ClaudeModel()
        ranker, reviewer = Ranker(model), (None if a.no_review else Reviewer(model))
    trace_path = TRACE_DIR / f"{dt.date.today().isoformat()}.jsonl"
    out = run(req, flt.load(a.snapshot), ranker, reviewer, trace_path)
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
