"""Print a short digest of the pages the crawler saved, for the Extractor step (reading them).

Usage: python -m backfill.digest <site folder under data/pages> [--min-score 2] [--snippets 3] [--width 260]
Lists each page that mentions deadlines, applications or dates, with the passages around those mentions.
"""
import argparse
import json
import os
import re

from .crawler import DATE, SIGNAL

PAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "pages")


def snippets(text, count, width):
    """Passages around deadline or application wording that also contain a date."""
    flat = re.sub(r"\s+", " ", text)
    found, last = [], -10**9
    for m in SIGNAL.finditer(flat):
        window = flat[max(0, m.start() - width // 3): m.start() + width]
        if DATE.search(window) and m.start() - last > width:
            found.append(window)
            last = m.start()
        if len(found) >= count:
            break
    return found


def digest(host, min_score=2, count=3, width=260, pages_dir=PAGES_DIR):
    folder = os.path.join(pages_dir, host)
    with open(os.path.join(folder, "_index.json"), encoding="utf-8") as f:
        index = json.load(f)
    lines = [f"## {host}: {len(index['pages'])} pages" + (" (BLOCKED)" if index.get("blocked") else "")]
    for entry in sorted(index["pages"], key=lambda e: -(e["signals"] + min(e["dates"], 5))):
        if entry["signals"] + min(entry["dates"], 5) < min_score:
            continue
        with open(os.path.join(folder, entry["id"] + ".json"), encoding="utf-8") as f:
            page = json.load(f)
        lines.append(f"- {entry['url']}  | {entry['title'][:70]}  | signals {entry['signals']}, dates {entry['dates']}")
        for s in snippets(page["text"], count, width):
            lines.append(f"    > {s}")
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("host")
    ap.add_argument("--min-score", type=int, default=2)
    ap.add_argument("--snippets", type=int, default=3)
    ap.add_argument("--width", type=int, default=260)
    args = ap.parse_args()
    print(digest(args.host, args.min_score, args.snippets, args.width))
