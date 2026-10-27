import unittest

from backfill import a4

CARD_HTML = """
<div class="opportunity py-3 pl-3 light-orange-scheme">
    <a href="/opportunities/triangle-2027-2028-open-call">
      <div class="row mr-0 mb-3 tiny-title">
        <div class="col-md-6">
            TRIANGLE ARTS ASSOCIATION
        </div>
        <div class="col-md-3 d-none d-md-flex">
          Residency
        </div>
        <div class="col-md-3 d-none d-md-flex">
          Dec 15
        </div>
      </div>
      <h2 class="small-title">Triangle 2027-2028 Open Call</h2>
    </a></div>
"""

DETAIL = (
    "Triangle 2027-2028 Open Call - A4 Opportunities Residency Triangle 2027-2028 Open Call "
    "TRIANGLE ARTS ASSOCIATION 20 Jay st, Suite #318 Brooklyn, NY 11201 Deadline Dec 15, 2026 Posted Oct 20, 2026 "
    "Triangle is an artist residency program."
)


def item(**over):
    base = {"href": "/opportunities/x", "org": "ORG", "type": "Residency", "list_deadline": "Dec 15",
            "title": "T", "detail": DETAIL.replace("TRIANGLE ARTS ASSOCIATION", "ORG")}
    base.update(over)
    return base


class A4Parsing(unittest.TestCase):
    def test_card_fields(self):
        cards = a4.parse_cards(CARD_HTML)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["org"], "TRIANGLE ARTS ASSOCIATION")
        self.assertEqual(cards[0]["type"], "Residency")
        self.assertEqual(cards[0]["title"], "Triangle 2027-2028 Open Call")

    def test_deadline_gets_its_year(self):
        self.assertEqual(a4.parse_deadline(DETAIL), "2026-12-15")
        self.assertEqual(a4.parse_deadline("x Deadline Rolling Posted"), "rolling")
        self.assertIsNone(a4.parse_deadline("no deadline here"))

    def test_brooklyn_zip_is_nyc(self):
        self.assertEqual(a4.location_of(item()), (True, "brooklyn"))

    def test_new_york_ny_address_without_zip_is_nyc(self):
        detail = "T ORG New York, NY xxxxx Deadline Rolling Posted"
        self.assertEqual(a4.location_of(item(detail=detail)), (True, "unknown"))

    def test_address_ignores_org_name_in_page_title(self):
        detail = ("Call - Panopticon Gallery - A4 Opportunities Call for Submissions Call Panopticon Gallery "
                  "502c Commonwealth Ave Boston, MA 02115 Deadline Dec 29, 2026 Posted Oct 23, 2026 Text")
        self.assertEqual(a4.address_of(item(org="Panopticon Gallery", detail=detail)), "502c Commonwealth Ave Boston, MA 02115")
        self.assertEqual(a4.location_of(item(org="Panopticon Gallery", detail=detail)), (False, "unknown"))

    def test_other_state_is_not_nyc(self):
        detail = "T ORG 500 Main St Wichita, KS 67260 Deadline Rolling Posted"
        self.assertEqual(a4.location_of(item(detail=detail)), (False, "unknown"))

    def test_nyc_wording_without_address_is_nyc_unknown_borough(self):
        detail = "T ORG Online Deadline Rolling Open to artists living in NYC."
        self.assertEqual(a4.location_of(item(detail=detail)), (True, "unknown"))

    def test_description_starts_after_the_posted_date(self):
        self.assertEqual(a4.body_of(DETAIL), "Triangle is an artist residency program.")
        self.assertEqual(a4.body_of("no posted marker"), "no posted marker")

    def test_jobs_are_skipped(self):
        self.assertIsNone(a4.to_record(item(type="Job")))

    def test_record_fields(self):
        rec = a4.to_record(item(href="/opportunities/triangle", title="Triangle Open Call"))
        self.assertEqual(rec["opportunity_type"], "residency")
        self.assertEqual(rec["deadline"], "2026-12-15")
        self.assertTrue(rec["nyc_confirmed"])
        self.assertEqual(rec["source_url"], "https://www.aaartsalliance.org/opportunities/triangle")


if __name__ == "__main__":
    unittest.main()
