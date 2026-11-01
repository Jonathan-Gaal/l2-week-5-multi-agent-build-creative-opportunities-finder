"""Run the golden set (agents/golden.json) against the snapshot and report the PRD section 9 metrics.

Modes:
    baseline         code ranker, no model calls (runs anywhere)
    ranker_only      Claude ranker, no Reviewer (always Tier 2 by design)
    ranker_reviewer  Claude ranker + Reviewer loop
The two Claude modes are the required comparison. They need Anthropic credentials and are skipped,
with a message, when none are set, or stopped (no metrics: a partial run isn't comparable) as soon as a call
finds the key unavailable (billing, credit or usage limit). Baseline always runs. Each request can make up
to 6 model calls in ranker_reviewer mode.

Usage:
    python -m agents.eval                                  # every mode that can run
    python -m agents.eval --modes baseline --out traces/eval.json
"""

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

from agents import filter as flt
from agents import pipeline
from agents.model import ClaudeModel, ModelError, missing_credentials, unavailable_reason
from agents.roles import BaselineRanker, Ranker, Reviewer

GOLDEN = Path(__file__).resolve().parent / "golden.json"
MODES = ("baseline", "ranker_only", "ranker_reviewer")


def _norm(text):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()


class StopOnUnavailable:
    """`model`, but once a call finds the key unavailable every later call fails at once, with no request."""
    def __init__(self, model):
        self.model, self.unavailable = model, None

    def call(self, system, user, schema):
        if self.unavailable:
            raise ModelError(self.unavailable)
        try:
            return self.model.call(system, user, schema)
        except ModelError as e:
            self.unavailable = unavailable_reason(e)
            raise


def roles_for(mode, model):
    if mode == "baseline":
        return BaselineRanker(), None
    return Ranker(model), (Reviewer(model) if mode == "ranker_reviewer" else None)


def score(case, out, records):
    """Grade one result against its golden expectations. Hard checks use the records' own fields."""
    exp, req = case["expect"], flt.Request(case["place"], case["type"], dt.date.fromisoformat(case["as_of"]))
    by_key = {r["dedupe_key"]: r for r in records}
    served = [r["dedupe_key"] for r in out["results"]]
    recs = [by_key[k] for k in served]
    titles = [(_norm(r["title"]), r.get("borough") or r.get("region")) for r in recs]
    cands = {r["dedupe_key"] for r in flt.select(records, req)[0]}
    s = {
        "id": case["id"], "category": case["category"], "tier": out["tier"], "served": served,
        "hard_filter_violations": sum(not flt.matches(r, req) for r in recs),
        "expired_shown": sum(flt.is_expired(r, req.as_of) for r in recs),
        "duplicates_shown": len(titles) - len(set(titles)),
        "tier_ok": (out["tier"] == 3) == exp["tier_3"],
        "removed_ok": (out.get("removed_counts") or {}).get("expired", 0) == exp["removed_expired"],
        "must_include_missing": [k for k in exp["must_include"] if k not in served],
        "must_exclude_shown": [k for k in exp["must_exclude"] if k in served],
        "candidate_missing": [k for k in exp["must_be_candidate"] if k not in cands],
    }
    s["pass"] = (not s["hard_filter_violations"] and not s["expired_shown"] and not s["duplicates_shown"] and s["tier_ok"]
                 and s["removed_ok"] and not s["must_include_missing"] and not s["must_exclude_shown"] and not s["candidate_missing"])
    if case["category"] == "adversarial":
        injected = {r["dedupe_key"] for r in case.get("inject", [])}
        s["adversarial_followed"] = bool(injected & set(served)) or bool(s["must_include_missing"]) or out["tier"] == 3
    return s


def summarize(rows):
    adv = [r for r in rows if "adversarial_followed" in r]
    return {
        "requests": len(rows), "passed": sum(r["pass"] for r in rows),
        "hard_filter_violations": sum(r["hard_filter_violations"] for r in rows),
        "expired_shown": sum(r["expired_shown"] for r in rows),
        "duplicates_shown": sum(r["duplicates_shown"] for r in rows),
        "adversarial_followed": sum(r["adversarial_followed"] for r in adv),
        "must_include_missing": sum(len(r["must_include_missing"]) for r in rows),
        "must_exclude_shown": sum(len(r["must_exclude_shown"]) for r in rows),
        "tier_counts": {t: sum(r["tier"] == t for r in rows) for t in (0, 2, 3)},
    }


def run_mode(mode, golden, records, trace_path=None, model=None):
    """Score every golden request. `model` (tests pass fakes) defaults to Claude; unused for baseline. A Claude mode
    whose key turns out unavailable returns {"skipped": reason, "completed": n} instead of metrics."""
    guard = StopOnUnavailable(model or ClaudeModel())
    ranker, reviewer = roles_for(mode, guard)
    rows = []
    for case in golden["requests"]:
        pool = records + case.get("inject", [])
        req = flt.Request(case["place"], case["type"], dt.date.fromisoformat(case["as_of"]))
        out = pipeline.run(req, pool, ranker, reviewer, trace_path)
        if guard.unavailable:
            return {"skipped": f"Claude unavailable: {guard.unavailable}", "completed": len(rows)}
        rows.append(score(case, out, pool))
    return {"summary": summarize(rows), "requests": rows}


def main(argv=None):
    p = argparse.ArgumentParser(description="Run the golden set.")
    p.add_argument("--modes", nargs="+", choices=MODES, default=list(MODES))
    p.add_argument("--golden", default=GOLDEN)
    p.add_argument("--snapshot", default=flt.SNAPSHOT)
    p.add_argument("--out", help="write full results as JSON")
    a = p.parse_args(argv)
    golden, records = json.loads(Path(a.golden).read_text(encoding="utf-8")), flt.load(a.snapshot)
    trace_path = pipeline.TRACE_DIR / f"eval-{dt.date.today().isoformat()}.jsonl"
    report = {}
    for mode in a.modes:
        blocked = mode != "baseline" and missing_credentials()
        if blocked:
            print(f"{mode}: skipped, {blocked}", file=sys.stderr)
            report[mode] = {"skipped": blocked, "completed": 0}
            continue
        report[mode] = run_mode(mode, golden, records, trace_path)
        if "skipped" in report[mode]:
            print(f"{mode}: stopped, {report[mode]['skipped']} after {report[mode]['completed']} of "
                  f"{len(golden['requests'])} requests; no metrics for this mode", file=sys.stderr)
            continue
        print(f"{mode}: {json.dumps(report[mode]['summary'])}")
        for r in report[mode]["requests"]:
            if not r["pass"]:
                problems = {k: v for k, v in r.items() if k in ("must_include_missing", "must_exclude_shown", "candidate_missing") and v}
                flags = [k for k in ("tier_ok", "removed_ok") if not r[k]]
                print(f"  FAIL {r['id']} ({r['category']}) tier {r['tier']} {flags or ''} {problems}")
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
