import unittest

import load_supabase as ls


class Row(unittest.TestCase):
    def test_expiry_uses_last_event_date_and_defaults_lists(self):
        rec = {"title": "Series", "dedupe_key": "k", "deadline": "2026-10-20", "event_dates": ["2026-10-20", "2026-11-05"],
               "eligibility": None, "disciplines": None, "unexpected_field": "dropped"}
        r = ls.row(rec, "2026-10-27")
        self.assertEqual((r["snapshot_id"], r["last_date"], r["eligibility"], r["disciplines"]), ("2026-10-27", "2026-11-05", [], []))
        self.assertNotIn("unexpected_field", r)

    def test_also_subtypes_round_trips_and_defaults_to_empty(self):
        self.assertIn("also_subtypes", ls.COLUMNS)
        self.assertEqual(ls.row({"title": "x", "also_subtypes": ["paid_gig"]}, "s")["also_subtypes"], ["paid_gig"])
        self.assertEqual(ls.row({"title": "x"}, "s")["also_subtypes"], [])
        self.assertEqual(ls.row({"title": "x", "also_subtypes": None}, "s")["also_subtypes"], [])

    def test_rolling_never_expires(self):
        self.assertIsNone(ls.row({"title": "x", "deadline": "rolling"}, "s")["last_date"])


if __name__ == "__main__":
    unittest.main()
