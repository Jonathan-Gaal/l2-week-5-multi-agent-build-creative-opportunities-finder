import csv
import json
import os
import tempfile
import unittest

from backfill import db, export


def rec(title, borough="manhattan", kind="grant", deadline=None, description="Desc"):
    return {
        "source": "fake", "title": title, "opportunity_type": kind, "borough": borough, "eligibility": [],
        "fee": "unknown", "deadline": deadline, "description": description, "source_url": "http://example.org/" + title,
        "checked_at": "2026-10-27T00:00:00+00:00", "fetched_at": "2026-10-27T00:00:00+00:00", "dedupe_key": title,
    }


def build(records, publish=True):
    folder = tempfile.mkdtemp()
    path = os.path.join(folder, "t.db")
    conn = db.connect(path)
    db.create_staging(conn, "snap1", "2026-10-27T00:00:00+00:00")
    for r in records:
        db.upsert(conn, "snap1", r)
    conn.commit()
    if publish:
        db.publish(conn, "snap1")
    conn.close()
    return folder, path


class Export(unittest.TestCase):
    def test_writes_both_files_in_borough_then_deadline_order(self):
        folder, path = build([
            rec("Queens Grant", borough="queens"),
            rec("Rolling One", deadline="rolling"),
            rec("Soon", deadline="2026-11-01"),
            rec("Later", deadline="2026-12-01"),
        ])
        csv_path, md_path = export.export(path)
        titles = [r["title"] for r in csv.DictReader(open(csv_path, encoding="utf-8-sig"))]
        self.assertEqual(titles, ["Soon", "Later", "Rolling One", "Queens Grant"])
        md = open(md_path, encoding="utf-8").read()
        self.assertIn("## Manhattan (3)", md)
        self.assertIn("## Queens (1)", md)
        self.assertIn("- Deadline: Rolling", md)
        self.assertLess(md.index("**Soon**"), md.index("**Later**"))

    def test_markdown_starts_with_the_dashboard_link(self):
        folder, path = build([rec("A")])
        _, md_path = export.export(path)
        lines = open(md_path, encoding="utf-8").read().splitlines()
        self.assertEqual(lines[0], "# Opportunity snapshot")
        self.assertIn(export.DASHBOARD_URL, lines[2])

    def test_summary_table_counts_by_category_and_borough(self):
        rows = [rec("A", kind="grant"), rec("B", kind="grant", borough="queens"), rec("C", kind="open_call"),
                rec("D", kind="open_call", borough="unknown")]
        table = export.summary_table(rows)
        self.assertEqual([c.strip() for c in table[0].strip("|").split("|")],
                         ["Category", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Borough unknown", "Total"])
        cells = lambda line: [c.strip() for c in line.strip("|").split("|")]
        self.assertEqual(cells(table[2]), ["Open calls", "1", "0", "0", "0", "0", "1", "2"])
        self.assertEqual(cells(table[3]), ["Grants", "1", "0", "1", "0", "0", "0", "2"])
        self.assertEqual(cells(table[4]), ["Total", "2", "0", "1", "0", "0", "1", "4"])

    def test_artist_category_uses_hand_label_then_keywords(self):
        hand = {"http://example.org/Labeled": "Dance"}
        self.assertEqual(export.artist_category(rec("Labeled"), hand), "Dance")
        self.assertEqual(export.artist_category(rec("Call for Musicians"), {}), "Music")
        self.assertEqual(export.artist_category(rec("Open to all disciplines grant"), {}), "All disciplines")
        self.assertEqual(export.artist_category(rec("Unmatched", description="Nothing here"), {}), "Needs review")

    def test_json_uses_display_labels(self):
        folder, path = build([rec("Dancers", borough="staten_island", kind="open_call", deadline="rolling")])
        export.export(path)
        row = json.load(open(os.path.join(folder, "snapshot.json"), encoding="utf-8"))[0]
        self.assertEqual((row["borough"], row["opportunity_type"], row["deadline"]), ("Staten Island", "Open call", "Rolling"))

    def test_missing_deadline_and_long_description(self):
        folder, path = build([rec("No Date", description="word " * 200)])
        _, md_path = export.export(path)
        md = open(md_path, encoding="utf-8").read()
        self.assertIn("Deadline not listed", md)
        self.assertIn("...", md)

    def test_nothing_published_writes_nothing(self):
        folder, path = build([rec("A")], publish=False)
        self.assertIsNone(export.export(path))
        self.assertFalse(os.path.exists(os.path.join(folder, "snapshot.md")))


if __name__ == "__main__":
    unittest.main()
