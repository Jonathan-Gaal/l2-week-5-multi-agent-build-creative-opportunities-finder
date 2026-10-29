"""Write the published snapshot as readable files: snapshot.csv (spreadsheet) and snapshot.md (reading)."""
import csv
import json
import os
import re
import sqlite3

BOROUGH_ORDER = ["manhattan", "brooklyn", "queens", "bronx", "staten_island", "citywide", "unknown"]
BOROUGH_LABEL = {"staten_island": "Staten Island", "unknown": "Borough unknown"}
TYPE_LABEL = {"open_call": "Open calls", "residency": "Residencies", "grant": "Grants", "audition": "Auditions",
              "open_mic": "Open mics", "space": "Spaces", "gig": "Gigs"}
FIELDS = ["title", "opportunity_type", "artist_category", "borough", "deadline", "fee", "eligibility", "source",
          "source_url", "checked_at", "fetched_at", "description"]

# Stand-in for the Extractor. Labels read by hand from each listing live in artist_categories.json,
# keyed by source_url. A record with no hand label falls back to keyword rules. First matching rule wins.
CATEGORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artist_categories.json")
NEEDS_REVIEW = "Needs review"
ARTIST_RULES = [
    ("Comedy", r"\bcomedy\b|\bcomedians?\b|stand-up|\bimprov\b|\bsketch\b"),
    ("Dance", r"\bdanc(e|er|ers|ing)\b|choreograph"),
    ("Singing", r"\bsingers?\b|\bvocal(ist|ists|s)?\b|\bchoir\b|\bopera\b|\bchorus\b"),
    ("Music", r"\bmusic(ian|ians|al)?\b|\bband\b|\bcomposers?\b|orchestra|\bchamber\b|\bconcerts?\b"),
    ("Film & media", r"\bfilms?\b|\bvideos?\b|documentary|screening|\btv\b|television|\bpilot\b"),
    ("Poetry", r"\bpoets?\b|\bpoetry\b"),
    ("Performing arts", r"\bactors?\b|\bactress|casting|theat(er|re)|storytell|\bperformers?\b|\bvariety\b"),
    ("Writing & publishing", r"\bwriters?\b|\bwriting\b|\bessays?\b|literary|literature|\bjournal\b|\bfiction\b"),
    ("Visual art", r"\bvisual\b|\bpaint|sculpt|exhibit|\bgallery\b|installation|photograph|mural|\bart\b|\bartists?\b"),
]
SNIPPET_CHARS = 280
DASHBOARD_URL = "https://claude.ai/artifact/1KJoDsygR95xDTkuCN2dwU"


def load_categories(path=CATEGORY_FILE):
    """Hand labels: the labels file, plus the category written beside each organization page in orgs.PAGES."""
    from . import extracted, orgs  # imported here so export has no import-time dependency on the sources
    labels = {page["url"]: page["category"] for page in orgs.PAGES}
    labels.update(extracted.categories())
    try:
        with open(path, encoding="utf-8") as f:
            labels.update(json.load(f))
    except OSError:
        pass
    return labels


def artist_category(rec, curated=None):
    """The listing's artist discipline: a hand label if one exists, else keyword rules, else Needs review."""
    curated = load_categories() if curated is None else curated
    if rec["source_url"] in curated:
        return curated[rec["source_url"]]
    marked = re.search(r"\[category: ([^\]]+)\]", rec["description"])  # a source that knows the category writes it here
    if marked:
        return marked.group(1)
    text = f"{rec['title']} {rec['description']}".lower()
    if "all disciplines" in text or "all artistic" in text:
        return "All disciplines"
    for scope in (rec["title"].lower(), text):
        for label, pattern in ARTIST_RULES:
            if re.search(pattern, scope):
                return label
    return NEEDS_REVIEW


def load(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    snap = conn.execute("SELECT snapshot_id FROM snapshots WHERE status = 'published'").fetchone()
    if snap is None:
        conn.close()
        return None, []
    rows = [dict(r) for r in conn.execute("SELECT * FROM records WHERE snapshot_id = ?", (snap["snapshot_id"],))]
    conn.close()
    return snap["snapshot_id"], rows


def sort_key(rec):
    borough = BOROUGH_ORDER.index(rec["borough"]) if rec["borough"] in BOROUGH_ORDER else len(BOROUGH_ORDER)
    deadline = rec["deadline"]
    # dated deadlines first (earliest first), then rolling, then none
    when = (0, deadline) if deadline and deadline != "rolling" else (1, "") if deadline == "rolling" else (2, "")
    return borough, rec["opportunity_type"], when, rec["title"].lower()


def deadline_label(deadline):
    if deadline == "rolling":
        return "Rolling"
    return deadline or "Deadline not listed"


def snippet(text):
    text = " ".join((text or "").split())
    return text if len(text) <= SNIPPET_CHARS else text[:SNIPPET_CHARS].rsplit(" ", 1)[0] + "..."


def write_csv(rows, path):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig so Excel reads accents
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for rec in rows:
            writer.writerow({**rec, "eligibility": "; ".join(json.loads(rec["eligibility"])),
                             "artist_category": artist_category(rec)})


def summary_table(rows):
    """Counts by opportunity type (down) and borough (across), padded so it also reads as plain text."""
    boroughs = BOROUGH_ORDER[:4] + ["staten_island"] + [b for b in ("citywide", "unknown") if any(r["borough"] == b for r in rows)]
    kinds = sorted({r["opportunity_type"] for r in rows}, key=lambda k: list(TYPE_LABEL).index(k) if k in TYPE_LABEL else len(TYPE_LABEL))
    header = ["Category"] + [BOROUGH_LABEL.get(b, b.title()) for b in boroughs] + ["Total"]
    body = []
    for kind in kinds:
        counts = [sum(1 for r in rows if r["opportunity_type"] == kind and r["borough"] == b) for b in boroughs]
        body.append([TYPE_LABEL.get(kind, kind.replace("_", " ").title())] + [str(c) for c in counts] + [str(sum(counts))])
    totals = [sum(1 for r in rows if r["borough"] == b) for b in boroughs]
    body.append(["Total"] + [str(t) for t in totals] + [str(sum(totals))])
    widths = [max(len(row[i]) for row in [header] + body) for i in range(len(header))]
    line = lambda row: "| " + " | ".join(cell.ljust(widths[i]) if i == 0 else cell.rjust(widths[i]) for i, cell in enumerate(row)) + " |"
    divider = "| " + " | ".join("-" * widths[0] if i == 0 else "-" * (widths[i] - 1) + ":" for i in range(len(header))) + " |"
    return [line(header), divider] + [line(row) for row in body]


def write_markdown(snapshot_id, rows, path):
    lines = ["# Opportunity snapshot", "", f"**[See this snapshot as a dashboard]({DASHBOARD_URL})**", "",
             f"Snapshot {snapshot_id} · {len(rows)} records", "",
             "## Summary", ""] + summary_table(rows) + [""]
    borough = kind = None
    for rec in rows:
        if rec["borough"] != borough:
            borough, kind = rec["borough"], None
            count = sum(1 for r in rows if r["borough"] == borough)
            lines += [f"## {BOROUGH_LABEL.get(borough, borough.title())} ({count})", ""]
        if rec["opportunity_type"] != kind:
            kind = rec["opportunity_type"]
            lines += [f"### {TYPE_LABEL.get(kind, kind.replace('_', ' ').title())}", ""]
        lines += [
            f"**{rec['title']}**",
            f"- Deadline: {deadline_label(rec['deadline'])}",
            f"- Source: {rec['source']} · [link]({rec['source_url']}) · checked {rec['checked_at'][:10]}",
            f"- Artist category: {artist_category(rec)}",
            f"- Fee: {'Fee unknown' if rec['fee'] == 'unknown' else rec['fee']}",
            f"- {snippet(rec['description'])}",
            "",
        ]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_json(rows, path):
    """Records for the dashboard, with display-ready labels. No listing text: the title, labels and the source link."""
    borough_names = {"staten_island": "Staten Island", "unknown": "Unknown"}
    type_names = {"open_call": "Open call", "residency": "Residency", "grant": "Grant", "audition": "Audition",
                  "open_mic": "Open mic", "space": "Space", "gig": "Gig"}
    out = []
    for rec in rows:
        deadline = rec["deadline"]
        out.append({
            "title": rec["title"],
            "artist_category": artist_category(rec),
            "opportunity_type": type_names.get(rec["opportunity_type"], rec["opportunity_type"].replace("_", " ").title()),
            "borough": borough_names.get(rec["borough"], rec["borough"].title()),
            "deadline": "Rolling" if deadline == "rolling" else deadline or "Not listed",
            "source": rec["source"],
            "source_url": rec["source_url"],
            "checked_at": rec["checked_at"],
        })
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


def export(db_path, out_dir=None):
    out_dir = out_dir or os.path.dirname(os.path.abspath(db_path))
    snapshot_id, rows = load(db_path)
    if snapshot_id is None:
        return None
    rows.sort(key=sort_key)
    csv_path, md_path = os.path.join(out_dir, "snapshot.csv"), os.path.join(out_dir, "snapshot.md")
    write_csv(rows, csv_path)
    write_markdown(snapshot_id, rows, md_path)
    write_json(rows, os.path.join(out_dir, "snapshot.json"))
    return csv_path, md_path
