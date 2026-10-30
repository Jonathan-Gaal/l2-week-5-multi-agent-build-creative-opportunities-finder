"""Builds the review report from records.json + records.recategorized.json. Never writes to records.json."""
import json, csv, random, collections as C
B = "data/snapshots/2026-10-27/"
o = json.load(open(B + "records.json", encoding="utf8"))["records"]
n = json.load(open(B + "records.recategorized.json", encoding="utf8"))["records"]
TC = {"music":"music","sound":"music","comedy":"comedy","dance":"dance","theater":"theater","performance":"theater","performing_arts":"theater","literary":"writing","writing":"writing","visual":"visual","sculpture":"visual","lens-based":"visual","curatorial":"visual","textiles":"visual","film":"film","media":"film","digital":"film","transmission":"film","technology":"film","craft":"craft","design":"craft","architecture":"craft","all":"all","model":"model","photographer":"photographer","videographer":"videographer","crew":"crew","singer":"singer","poet":"poet"}
KNOWN = set(TC)
cs = lambda t: sorted({TC[x] for x in t if x in TC})
def osub(a):
    return a["subtype"] or {"grant":"grant","residency":"residency","open_call":"general_call","job":"full_time"}.get(a["opportunity_type"], "none")
rows = []; flagged = set()
for i, (a, b) in enumerate(zip(o, n)):
    ca, cb = cs(a["disciplines"]) != cs(b["disciplines"]), a["opportunity_type"] != b["opportunity_type"]
    cc = osub(a) != b["subtype"]
    changed = ca or cb or cc
    if changed or b["category_confidence"] != "high": flagged.add(i)
    if changed or b["category_confidence"] == "low":
        rows.append([i, a["title"], a["source"], "; ".join(a["disciplines"]), f'{a["opportunity_type"]}/{a["subtype"]}',
                     "; ".join(b["disciplines"]), f'{b["opportunity_type"]}/{b["subtype"]}', b["category_confidence"],
                     "CHANGED" if changed else "same", b["category_reason"], a["source_url"]])
with open("reports/recategorize/review_changed_and_low.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f); w.writerow(["row","title","source","old artist types","old kind","new artist types","new kind","confidence","changed?","reason","link"]); w.writerows(rows)
L = []
P = L.append
P("# Recategorization report\n")
P(f"Total listings: {len(n)} (original {len(o)})\n")
chg = C.Counter(); 
for r in rows:
    pass
ch = [r for r in rows if r[8] == "CHANGED"]
P(f"Listings changed (artist type, broad type or kind): {len(ch)}")
P(f"Rows in the review CSV (changed or low confidence): {len(rows)}\n")
P("Confidence: " + str(dict(C.Counter(b["category_confidence"] for b in n))) + "\n")
P("## Kind: was -> now (counts)\n")
t = C.Counter((f'{a["opportunity_type"]}/{a["subtype"]}', f'{b["opportunity_type"]}/{b["subtype"]}') for a, b in zip(o, n))
P("| was | now | count |\n|---|---|---|")
for (x, y), v in sorted(t.items(), key=lambda kv: -kv[1]): 
    if x != y: P(f"| {x} | {y} | {v} |")
P("\n(rows where only 'None' became an explicit kind with the same meaning are included above; they are not real changes)\n")
P("## Artist type: was -> now (counts)\n")
t = C.Counter((" + ".join(cs(a["disciplines"])), " + ".join(cs(b["disciplines"]))) for a, b in zip(o, n) if cs(a["disciplines"]) != cs(b["disciplines"]))
P("| was | now | count |\n|---|---|---|")
for (x, y), v in sorted(t.items(), key=lambda kv: -kv[1])[:40]: P(f"| {x} | {y} | {v} |")
P("\n## Artist type by kind (a listing with 2 types counts under each)\n")
kinds = sorted({b["subtype"] for b in n}); cats = ["music","comedy","dance","theater","writing","visual","film","craft","model","photographer","videographer","crew","singer","poet","all"]
P("| kind | " + " | ".join(cats) + " | total |\n|---|" + "---|" * (len(cats) + 1))
for k in kinds:
    xs = [b for b in n if b["subtype"] == k]
    P(f"| {k} | " + " | ".join(str(sum(1 for b in xs if c in cs(b["disciplines"]))) for c in cats) + f" | {len(xs)} |")
for k, name in (("festival", "Festivals"), ("gallery_submission", "Gallery submissions")):
    xs = [(i, b) for i, b in enumerate(n) if b["subtype"] == k]
    P(f"\n## {name}: {len(xs)}\n")
    for i, b in xs: P(f"- row {i}: {b['title']} ({b['opportunity_type']}, {', '.join(b['disciplines'])}, {b['category_confidence']})")
P("\n## Self-check\n")
bad = [b["title"] for b in n for d in b["disciplines"] if d not in KNOWN]
P(f"- Unknown artist-type values: {len(bad)}")
P(f"- Listings with no artist type: {sum(1 for b in n if not b['disciplines'])}")
P(f"- Count matches original: {len(n) == len(o) == 1526}")
P(f"- Same order and titles as original: {all(a['title'] == b['title'] and a['dedupe_key'] == b['dedupe_key'] for a, b in zip(o, n))}")
P(f"- Duplicate dedupe_keys: new {len(n)-len({b['dedupe_key'] for b in n})} vs original {len(o)-len({a['dedupe_key'] for a in o})}")
P(f"- Blank or 'none' kinds: {sum(1 for b in n if not b['subtype'])}")
P(f"- Exactly one broad type each: {all(b['opportunity_type'] in ('open_call','event','grant','residency','job') for b in n)}")
P(f"- Other fields unchanged: {all(all(a[k] == b[k] for k in a if k not in ('disciplines','opportunity_type','subtype')) for a, b in zip(o, n))}")
random.seed(7)
un = [i for i in range(len(n)) if i not in flagged]
P(f"\n## 40 random listings I did NOT flag (high confidence, unchanged) out of {len(un)}\n")
P("| row | title | artist types | kind |\n|---|---|---|---|")
for i in sorted(random.sample(un, 40)): P(f"| {i} | {n[i]['title'][:70]} | {', '.join(n[i]['disciplines'])} | {n[i]['opportunity_type']}/{n[i]['subtype']} |")
open("reports/recategorize/REPORT.md", "w", encoding="utf8").write("\n".join(L))
print("\n".join(L[:12])); print("..."); print("\n".join(l for l in L if l.startswith("- ")  and "row" not in l[:8]))
