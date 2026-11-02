"""Give every listing in a snapshot the current artist types and kinds. No model calls.

Listings already settled in an earlier retagged snapshot (matched by dedupe_key) keep those labels, which includes
every hand decision made in reports/recategorize/classify.py. Listings not seen before get the rule-based layers
from that script (photographer, videographer, production crew, singer, poet, designer folding, also_subtypes) and
are marked for review, so nothing is guessed silently.

Usage:
    python3 scripts/recategorize_snapshot.py <records.json> <out.json> [--reference <retagged records.json>]
The reference defaults to the newest data/snapshots/*/records.json that already carries the new artist types.
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ALL = "all"
LABEL_FIELDS = ("opportunity_type", "subtype", "disciplines", "also_subtypes", "category_confidence", "category_reason")

# Old snapshot tag -> the tag we now write. Same mapping as reports/recategorize/classify.py.
TAG_TO_NEW = {"music": "music", "sound": "music", "comedy": "comedy", "dance": "dance", "theater": "theater",
              "performance": "theater", "performing_arts": "theater", "literary": "literary", "writing": "literary",
              "visual": "visual", "sculpture": "visual", "lens-based": "visual", "curatorial": "visual", "textiles": "visual",
              "film": "film", "media": "film", "digital": "film", "transmission": "film", "technology": "film",
              "craft": "craft", "design": "craft", "architecture": "craft", "model": "model", "photographer": "photographer",
              "videographer": "videographer", "crew": "crew", "singer": "singer", "poet": "poet"}
NEW_TAGS = {"model", "photographer", "videographer", "crew", "singer", "poet"}

INFER = [
    ("music", r"music|choir|chorale|chorus|\bsinging\b|sing-?along|\bsing\b|jazz|drum|guitar|band\b|violin|piano|ukulele|song|harmon|orchestra|dj\b"),
    ("dance", r"dance|dancing|swing|ballroom|movement|salsa|tango"),
    ("theater", r"acting|actor|improv|theat|puppet|stage|cabaret"),
    ("literary", r"writ|poet|story|storytell|verse|memoir|essay|novel|book"),
    ("visual", r"paint|draw|watercolor|sketch|print|photo|camera|portrait|mural|mixed media|collage|marbling|figure|color|sculpt|illustrat|calligraph|art making"),
    ("craft", r"weav|crochet|knit|stitch|embroider|ceramic|wheel|pottery|wood|craft|quill|basket|sew|glass|needle|terrarium|cutting board|pens|wreath|ornament"),
    ("film", r"film|video|movie|cinema|screen"),
]
PHOTO = re.compile(r"photograph|photo editor|photo/video|photo and video|santa photos|camera club|\bphoto\b.*shooter", re.I)
VIDEO = re.compile(r"videograph|cinematograph|video editor|video needed|video assignment|video shooter|photo/video|youtube|creative video", re.I)
CREATIVE = re.compile(r"web series|short film|film noir|documentary|docu|music video|feature|comedy shoot|spec commercial", re.I)
CREW = re.compile(r"production assistant|\bpa\b|set dresser|gimbal|crew|backstage|makeup|sfx|hairstylist|stylist needed|activity host", re.I)
FILMY = re.compile(r"film|series|movie|cinematic|video|commercial|camera", re.I)
DESIGNY = re.compile(r"graphic design|designer|director of design|\bcad\b|bathroom design|apparel|ipa 2027|data vis|multimedia", re.I)
SING = re.compile(r"singer|singing|\bsing\b|sing-?along|vocal|choir|chorus|chorale|glee|a cappella|sacred harp|christian harmony|voice teacher|voice lessons|male voice", re.I)
INSTR = re.compile(r"musician|guitar|drum|bass|keyboard|\bkeys\b|piano|sax|horn|trumpet|violin|player|pianist|band members", re.I)
POET = re.compile(r"poet|poetry|slam|spoken word|verse|laureate", re.I)
SPECIFIC_WRITING = re.compile(r"copywrit|article|journalis|author|true crime|essay|criticism|critical review|comedy writer|screenplay|script|content writ|storytell|memoir|comics|narrative|staff writer", re.I)
WRITERY = re.compile(r"writers?\b|prose|fiction|essay|novel|storytell", re.I)


def uniq(items):
    return list(dict.fromkeys(items))


def infer(title):
    t = title.lower()
    return [c for c, rx in INFER if re.search(rx, t)]


def rule_labels(rec):
    """Labels for a listing never seen before. Returns the label fields; confidence is never higher than medium."""
    title = rec.get("title") or ""
    ot, st = rec["opportunity_type"], rec.get("subtype")
    tags = rec.get("disciplines") or []
    disc = uniq(TAG_TO_NEW[t] for t in tags if t in TAG_TO_NEW) if ALL not in tags else [ALL]
    conf, why = "medium", "Auto-tagged by rules (new listing); not reviewed by hand."
    if ot == "event" and ALL in tags:
        guess = infer(title)
        if guess:
            disc, why = guess[:3], "Auto-tagged by rules; artist type guessed from the title (source said 'all')."
    if ot == "grant":
        st = "fellowship" if st == "fellowship" else "grant"
    elif ot == "residency":
        st = "residency"
    elif ot == "job" and st != "internship":
        st = "full_time"
    elif ot == "open_call" and st == "fellowship":
        ot, st = "grant", "fellowship"
    elif ot == "open_call" and not st:
        st, conf, why = "general_call", "low", "Auto-tagged by rules; no clear kind, left as general call."
    if not disc:
        disc, conf, why = [ALL], "low", "Auto-tagged by rules; no artist type given."

    # photographers, video shooters and crew
    if st != "model_call" and PHOTO.search(title):
        disc = uniq(["photographer"] + [t for t in disc if t not in ("visual", ALL)])
    if ot == "open_call" and st in ("paid_gig", "general_call", "collaboration"):
        rest = [t for t in disc if t not in ("film", "visual", ALL, "craft")]
        if VIDEO.search(title) and not re.search(r"haircut", title, re.I):
            disc = uniq(["videographer"] + (["film"] if CREATIVE.search(title) else []) + rest)
        elif CREW.search(title) and not re.search(r"haircut|hair stylist instagram|photography/design student", title, re.I):
            disc = uniq(["crew"] + (["film"] if FILMY.search(title) else []) + rest)
    # designers fold into visual
    if "craft" in disc and DESIGNY.search(title):
        disc = uniq(["visual" if t == "craft" else t for t in disc])
    elif "craft" in disc and "photograph" in title.lower():
        disc = [t for t in disc if t != "craft"]
    # singers
    if "music" in disc and not re.search(r"\bdj\b", title, re.I):
        if st == "open_mic":
            disc = uniq(disc + ["singer"])
        elif SING.search(title):
            disc = uniq(disc + ["singer"]) if INSTR.search(title) else uniq(["singer" if t == "music" else t for t in disc])
    # poets
    if "literary" in disc:
        if POET.search(title):
            disc = uniq(["poet"] + [t for t in disc if t != "literary"] + (["literary"] if WRITERY.search(title) else []))
        elif not SPECIFIC_WRITING.search(title):
            disc = uniq(disc + ["poet"])
    # a second kind that still shows once in results
    extra = []
    if ot == "open_call" and st in ("casting_call", "audition", "collaboration") and re.search(r"paid|\$\d", title, re.I):
        extra.append("paid_gig")
    if ot == "event" and st == "jam" and re.search(r"open mic", title, re.I):
        extra.append("open_mic")
    return dict(opportunity_type=ot, subtype=st, disciplines=disc, also_subtypes=[k for k in uniq(extra) if k != st],
                category_confidence=conf, category_reason=why)


def newest_retagged():
    for p in sorted((REPO / "data/snapshots").glob("*/records.json"), reverse=True):
        recs = json.loads(p.read_text(encoding="utf-8"))["records"]
        if any(t in NEW_TAGS for r in recs for t in (r.get("disciplines") or [])):
            return p
    sys.exit("no retagged snapshot found to use as a reference; pass --reference")


def recategorize(records, reference):
    known = {r["dedupe_key"]: r for r in reference}
    out, stats, review = [], Counter(), []
    for rec in records:
        ref = known.get(rec["dedupe_key"])
        labels = {f: ref[f] for f in LABEL_FIELDS if f in ref} if ref and "category_confidence" in ref else None
        if labels is None:
            labels = rule_labels(rec)
            stats["new, tagged by rules"] += 1
            review.append(dict(dedupe_key=rec["dedupe_key"], title=rec.get("title"), disciplines=labels["disciplines"],
                               subtype=labels["subtype"], confidence=labels["category_confidence"]))
        else:
            stats["kept earlier labels"] += 1
        out.append({**rec, **labels})
    return out, stats, review


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("records")
    p.add_argument("out")
    p.add_argument("--reference")
    a = p.parse_args(argv)
    src = json.loads(Path(a.records).read_text(encoding="utf-8"))
    ref_path = Path(a.reference) if a.reference else newest_retagged()
    reference = json.loads(ref_path.read_text(encoding="utf-8"))["records"]
    out, stats, review = recategorize(src["records"], reference)
    res = {**src, "count": len(out), "records": out}
    Path(a.out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    review_path = Path(a.out).with_suffix(".review.json")
    review_path.write_text(json.dumps(review, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"reference: {ref_path}")
    for k, v in stats.items():
        print(f"{k}: {v}")
    print(f"wrote {a.out}; {len(review)} new listings listed for review in {review_path.name}")


if __name__ == "__main__":
    main()
