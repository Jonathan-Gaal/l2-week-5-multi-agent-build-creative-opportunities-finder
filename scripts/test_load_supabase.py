import unittest

import load_supabase as ls


class Row(unittest.TestCase):
    def test_expiry_uses_last_event_date_and_defaults_lists(self):
        rec = {"title": "Series", "dedupe_key": "k", "deadline": "2026-10-20", "event_dates": ["2026-10-20", "2026-11-05"],
               "eligibility": None, "disciplines": None, "unexpected_field": "dropped"}
        r = ls.row(rec, "2026-10-27")
        self.assertEqual((r["snapshot_id"], r["last_date"], r["eligibility"], r["disciplines"]), ("2026-10-27", "2026-11-05", [], []))
        self.assertNotIn("unexpected_field", r)

    def test_rolling_never_expires(self):
        self.assertIsNone(ls.row({"title": "x", "deadline": "rolling"}, "s")["last_date"])


if __name__ == "__main__":
    unittest.main()
