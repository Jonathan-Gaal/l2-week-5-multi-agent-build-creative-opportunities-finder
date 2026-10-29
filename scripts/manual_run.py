"""Claude Code plays the model, no API key needed. Each model call writes its prompt to p<N>.txt and stops until
a<N>.json (the model's reply) exists. Whoever runs this reads the prompt and writes the reply.

Usage: MANUAL_SHOWN=15 python scripts/manual_run.py <case>     (c1, c2, c3, c4, a01, a03, a04)
Rerun after writing each answer; a finished case prints the result. Saved runs: runs/claude-code-as-model/.
"""
import datetime as dt
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
from agents import filter as flt
from agents import pipeline
from agents.roles import Ranker, Reviewer

ROOT = REPO / "runs/claude-code-as-model"
DAY = dt.date(2026, 10, 28)
import os
SHOWN = int(os.environ.get("MANUAL_SHOWN", "25"))     # candidates sent to the ranker (pipeline default is 80); keeps each prompt readable


class NeedAnswer(Exception):
    pass


class ManualModel:
    def __init__(self, d):
        self.d, self.n = d, 0

    def call(self, system, user, schema):
        self.n += 1
        a = self.d / f"a{self.n}.json"
        if a.exists():
            return json.loads(a.read_text(encoding="utf-8")), {"input_tokens": 0, "output_tokens": 0}
        (self.d / f"p{self.n}.txt").write_text(
            f"SYSTEM:\n{system}\n\nUSER:\n{user}\n\nREPLY WITH JSON MATCHING:\n{json.dumps(schema)}\n", encoding="utf-8")
        raise NeedAnswer(self.n)


golden = json.loads((REPO / "agents/golden.json").read_text(encoding="utf-8"))
G = {c["id"]: c for c in golden["requests"]}
CASES = {
    "c1": (flt.Request("brooklyn", "open_call", DAY), []),
    "c2": (flt.Request("manhattan", "grant", DAY), []),
    "c3": (flt.Request("queens", "event", DAY), []),
    "c4": (flt.Request("staten_island", "job", DAY), []),
}
for gid in ("a01", "a03", "a04"):
    c = G[gid]
    CASES[gid] = (flt.Request(c["place"], c["type"], DAY), c.get("inject", []))

case = sys.argv[1]
req, inject = CASES[case]
d = ROOT / case
d.mkdir(parents=True, exist_ok=True)
model = ManualModel(d)
records = flt.load() + inject
try:
    out = pipeline.run(req, records, Ranker(model), Reviewer(model), d / "trace.jsonl", max_candidates=SHOWN)
except NeedAnswer as e:
    print(f"NEED ANSWER {e.args[0]}: read {d / f'p{e.args[0]}.txt'}")
    sys.exit(0)
print(f"DONE {case}: {req.place}/{req.type} -> Tier {out['tier']}  removed: {out['removed']}")
for r in out["results"]:
    print(f"  - {r['title'][:75]} | {r['place']} | {r['deadline']} | {r['label']} | {r['source']}")
t = json.loads((d / "trace.jsonl").read_text(encoding="utf-8").splitlines()[-1])
for a in t["attempts"]:
    print("  attempt", {k: v for k, v in a.items()})
print("  downgraded:", t.get("downgraded"), "| fallback:", t.get("fallback"))
