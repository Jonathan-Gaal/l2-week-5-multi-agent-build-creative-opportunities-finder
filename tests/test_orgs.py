import unittest
from datetime import date

from backfill import export, orgs

TODAY = date(2026, 10, 27)


class Orgs(unittest.TestCase):
    def test_deadline_with_year(self):
        self.assertEqual(orgs.find_deadline("The deadline to apply is Friday, October 30, 2026, at 11:59 PM.", TODAY), "2026-10-30")

    def test_deadline_without_year_takes_next_one_coming(self):
        self.assertEqual(orgs.find_deadline("Applications close Nov 1.", TODAY), "2026-11-01")
        self.assertEqual(orgs.find_deadline("Applications close Jan 15.", TODAY), "2027-01-15")

    def test_no_deadline_phrase_gives_none(self):
        self.assertIsNone(orgs.find_deadline("We hold events every Saturday, Nov 7.", TODAY))

    def test_entry_deadline_wins_over_page_text(self):
        item = {"url": "https://apexart.org/nyc/submit.php", "title": "apexart", "type": "open_call", "borough": "manhattan",
                "deadline": "2026-10-31", "note": "Proposals Oct. 1 to Oct. 31, 2026", "text": "Deadline Dec 1, 2030"}
        rec = orgs.to_record(item, TODAY)
        self.assertEqual((rec["deadline"], rec["borough"], rec["opportunity_type"]), ("2026-10-31", "manhattan", "open_call"))

    def test_every_page_has_borough_type_and_category(self):
        for page in orgs.PAGES:
            self.assertIn(page["borough"], {"manhattan", "brooklyn", "queens", "bronx", "staten_island"}, page["url"])
            self.assertIn(page["type"], {"open_call", "residency", "grant"}, page["url"])
            self.assertTrue(page["category"], page["url"])

    def test_org_categories_reach_the_export(self):
        page = orgs.PAGES[0]
        rec = {"title": "x", "description": "", "source_url": page["url"]}
        self.assertEqual(export.artist_category(rec), page["category"])


if __name__ == "__main__":
    unittest.main()
