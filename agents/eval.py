"""Run the golden set (agents/golden.json) against the snapshot and report the PRD section 9 metrics.

Modes:
    baseline         code ranker, no model calls (runs anywhere)
    ranker_only      Claude ranker, no Reviewer (always Tier 2 by design)
    ranker_reviewer  Claude ranker + Reviewer loop
The two Claude modes are the required comparison. They need Anthropic credentials and are skipped,
with a message, when none are set. Each request can make up to 6 model calls in ranker_reviewer mode.

Usage:
    python -m agents.eval                                  # every mode that can run
    python -m agents.eval --modes baseline --out traces/eval.json
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

from agents import filter as flt
from agents import pipeline
from agents.model import ClaudeModel
from agents.roles import BaselineRanker, Ranker, Reviewer

GOLDEN = Path(__file__).resolve().parent / "golden.json"
MODES = ("baseline", "ranker_only", "ranker_reviewer")


def _norm(text):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()


def roles_for(mode):
    if mode == "baseline":
        return BaselineRanker(), None
    model = ClaudeModel()
    return Ranker(model), (Reviewer(model) if mode == "ranker_reviewer" else None)


def has_credentials():
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_PROFILE")
            or Path.home().joinpath(".config/anthropic").exists()):
        return "no Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`)"
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return "anthropic SDK not installed (pip install anthropic)"
    return None


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


def run_mode(mode, golden, records, trace_path=None):
    ranker, reviewer = roles_for(mode)
    rows = []
    for case in golden["requests"]:
        pool = records + case.get("inject", [])
        req = flt.Request(case["place"], case["type"], dt.date.fromisoformat(case["as_of"]))
        out = pipeline.run(req, pool, ranker, reviewer, trace_path)
        rows.append(score(case, out, pool))
    return {"summary": summarize(rows), "requests": rows}


def main(argv=None):
    p = argparse.ArgumentParser(description="Run the golden set.")
    p.add_argument("--modes", nargs="+", choices=MODES, default=list(MODES))
    p.add_argument("--golden", default=GOLDEN)
    p.add_argument("--snapshot", default=flt.SNAPSHOT)
    p.add_argument("--out", help="write full results as JSON")
    a = p.parse_args(argv)
    golden, records = json.loads(Path(a.golden).read_text()), flt.load(a.snapshot)
    trace_path = pipeline.TRACE_DIR / f"eval-{dt.date.today().isoformat()}.jsonl"
    report = {}
    for mode in a.modes:
        blocked = mode != "baseline" and has_credentials()
        if blocked:
            print(f"{mode}: skipped, {blocked}", file=sys.stderr)
            continue
        report[mode] = run_mode(mode, golden, records, trace_path)
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
