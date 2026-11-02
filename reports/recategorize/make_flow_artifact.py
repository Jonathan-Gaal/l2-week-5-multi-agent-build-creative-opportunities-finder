"""Builds the clickable 3-step find-flow artifact (one HTML file) from the corrected data and the real chip lists."""
import json, re, sys
TODAY = "2026-10-30"
recs = json.load(open("data/snapshots/2026-10-27/records.recategorized.json", encoding="utf8"))["records"]

# --- pills, read from the real typePills.ts so the artifact never drifts from the app ---
src = open("web/src/lib/typePills.ts", encoding="utf8").read()
pills = []
for m in re.finditer(r'\{ id: "(\w+)", label: "([^"]+)", type: "(\w+)", subtypes: \[([^\]]*)\](, rest: true)?, explain: "([^"]+)" \}', src):
    pid, label, typ, subs, rest, explain = m.groups()
    pills.append(dict(id=pid, label=label, type=typ, subs=re.findall(r'"(\w+)"', subs), rest=bool(rest), explain=explain))
assert len(pills) == 12, len(pills)

# --- artist chips, read from disciplineWords.ts ---
dw = open("web/src/lib/disciplineWords.ts", encoding="utf8").read()
chips = [dict(id=i, word=w) for i, w in [(a, c) for a, k, c in re.findall(r'\{ id: "(\w+)", key: "([^"]+)", word: "([^"]+)" \}', dw)]]
assert len(chips) == 14, len(chips)
TAG = {"writing": "literary", "theater": "theater", "comedy": "comedy"}  # chip id -> tag in the data
ID2TAG = {c["id"]: TAG.get(c["id"], c["id"]) for c in chips}
CHIP_IDX = {ID2TAG[c["id"]]: i for i, c in enumerate(chips)}

def pill_of(typ, sub):
    for i, p in enumerate(pills):
        if p["type"] == typ and sub is not None and sub in p["subs"]: return i
    for i, p in enumerate(pills):
        if p["type"] == typ and p["rest"]: return i
    return -1

KIND = {"festival": "Festival call", "gallery_submission": "Gallery submission", "casting_call": "Casting call", "model_call": "Model call",
        "writing_submission": "Writing submission", "collaboration": "Collaboration", "service_ad": "Service ad", "performance_call": "Call to perform",
        "general_call": "Open call", "competition": "Competition or prize", "commission": "Commission", "teaching_artist": "Teaching artist job",
        "show": "Show or festival to attend", "meetup": "Meetup", "open_studio": "Open studio", "jam": "Jam", "dance_night": "Dance night"}
kind = lambda s: KIND.get(s) or s.replace("_", " ").capitalize()

def expired(r):
    dl = r.get("deadline"); ev = [d for d in (r.get("event_dates") or []) if d]
    last = max(ev) if ev else (dl if isinstance(dl, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", dl) else None)
    return bool(last and last < TODAY)

rows = []
for r in recs:
    if expired(r): continue
    a = sorted({CHIP_IDX[t] for t in r["disciplines"] if t in CHIP_IDX})
    allart = 1 if "all" in r["disciplines"] else 0
    ps = sorted(({pill_of(r["opportunity_type"], r["subtype"])} | {pill_of(r["opportunity_type"], k) for k in r.get("also_subtypes", [])}) - {-1})
    t = r["title"][:90]
    rows.append([t, kind(r["subtype"]), a, allart, ps, r.get("borough") or "", r.get("region") or ""])

data = dict(chips=chips, pills=pills, rows=rows)
html = open("reports/recategorize/flow_template.html", encoding="utf8").read()
blob = json.dumps(data, ensure_ascii=True, separators=(",", ":")).replace("</", "<\/")
out = html.replace("/*DATA*/null", blob)
open(sys.argv[1], "w", encoding="utf8").write(out)
print(len(rows), "live listings;", len(out) // 1024, "KB")
