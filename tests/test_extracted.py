import json
import os
import tempfile
import unittest

from backfill import extracted

URL = "https://example.org/grants/poets"
TEXT = "Poets Fellowship\nApplications are due   November 30, 2026 for NYC poets."


def pages_dir():
    folder = tempfile.mkdtemp()
    site = os.path.join(folder, "example.org")
    os.makedirs(site)
    with open(os.path.join(site, "_index.json"), "w", encoding="utf-8") as f:
        json.dump({"pages": [{"url": URL, "id": "abc"}]}, f)
    with open(os.path.join(site, "abc.json"), "w", encoding="utf-8") as f:
        json.dump({"url": URL, "text": TEXT}, f)
    return folder


def entry(**over):
    base = {"title": "Poets Fellowship", "type": "grant", "borough": "brooklyn", "category": "Poetry", "deadline": "2026-11-30",
            "source_url": URL, "quote": "Applications are due November 30, 2026 for NYC poets."}
    base.update(over)
    return base


class Extracted(unittest.TestCase):
    def test_supported_entry_passes_and_becomes_a_record(self):
        folder = pages_dir()
        self.assertEqual(extracted.problems(entry(), folder), [])
        original = extracted.PAGES_DIR
        extracted.PAGES_DIR = folder
        try:
            rec = extracted.to_record(entry(organization="Brooklyn Poets"))
        finally:
            extracted.PAGES_DIR = original
        self.assertEqual((rec["opportunity_type"], rec["borough"], rec["deadline"], rec["nyc_confirmed"]),
                         ("grant", "brooklyn", "2026-11-30", True))
        self.assertTrue(rec["description"].startswith("Brooklyn Poets"))

    def test_quote_not_on_the_page_is_rejected(self):
        why = extracted.problems(entry(quote="Applications are due December 15, 2026"), pages_dir())
        self.assertEqual(why, ["quote does not appear in the saved page"])

    def test_unsaved_page_is_rejected(self):
        why = extracted.problems(entry(source_url="https://example.org/other"), pages_dir())
        self.assertIn("page was not saved by the crawler, so the quote cannot be checked", why)

    def test_bad_fields_are_reported(self):
        why = extracted.problems(entry(type="party", borough="new jersey", deadline="soon", title=""), pages_dir())
        self.assertEqual(len(why), 4)

    def test_page_saved_by_hand_can_back_a_quote(self):
        folder = tempfile.mkdtemp()
        os.makedirs(os.path.join(folder, "manual"))
        with open(os.path.join(folder, "manual", "backstage-dance.txt"), "w", encoding="utf-8") as f:
            f.write("URL: https://www.backstage.com/casting/dance/\nDancers wanted for a music video, paid, Brooklyn.")
        item = entry(source_url="https://www.backstage.com/casting/dance", quote="Dancers wanted for a music video, paid, Brooklyn.")
        self.assertEqual(extracted.problems(item, folder), [])

    def test_rolling_and_null_deadlines_are_allowed(self):
        self.assertEqual(extracted.problems(entry(deadline="rolling"), pages_dir()), [])
        self.assertEqual(extracted.problems(entry(deadline=None), pages_dir()), [])


if __name__ == "__main__":
    unittest.main()
