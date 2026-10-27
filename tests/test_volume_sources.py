import unittest
from datetime import date

from backfill import craigslist, dancenyc, dates, playbill

CL_PAGE = """
<ul>
<li class="cl-static-search-result" title="Actors needed for indie short film">
  <a href="https://www.craigslist.org/view/d/brooklyn-actors-needed/abc123">
    <div class="title">Actors needed for indie short film</div>
    <div class="details"><div class="price">$150</div><div class="location">
        bushwick
    </div></div></a></li>
<li class="cl-static-search-result" title="RN Needed for Graduate Student: $98,000/year">
  <a href="https://www.craigslist.org/view/d/nurse/def456">
    <div class="title">RN Needed</div><div class="details"><div class="price">$0</div><div class="location">x</div></div></a></li>
</ul>
"""

PB_PAGE = """
<div class="loadmore-item"><div class="pb-tile-wrapper"><a href="https://playbill.com/job/actors-needed/111">
<div class="pb-tile-box"><div class="pb-tile-category">Performer</div><div class="pb-tile-tags"></div>
<div class="pb-tile-title">Actors Needed for Play (<em>Yet a Stranger</em>)</div>
<div class="pb-tile-location"> Dionysia Collective<br>New York, NY<br>US </div>
<div class="pb-tile-post-date"> 10/27/2026 </div></div></a></div></div>
<div class="loadmore-item"><div class="pb-tile-wrapper"><a href="https://playbill.com/job/tour/222">
<div class="pb-tile-box"><div class="pb-tile-category">Performer</div><div class="pb-tile-tags"></div>
<div class="pb-tile-title">Grease</div>
<div class="pb-tile-location"> City Springs<br>Sandy Springs, GA<br>US </div>
<div class="pb-tile-post-date"> 10/27/2026 </div></div></a></div></div>
<div class="loadmore-item"><div class="pb-tile-wrapper"><a href="https://playbill.com/job/carpenter/333">
<div class="pb-tile-box"><div class="pb-tile-category">Technical</div><div class="pb-tile-tags"></div>
<div class="pb-tile-title">Deck Carpenter</div>
<div class="pb-tile-location"> Soho Rep<br>New York, NY<br>US </div>
<div class="pb-tile-post-date"> 10/27/2026 </div></div></a></div></div>
"""

DANCE_LISTING = """
<html><head><title>Kizuna Dance Audition | Dance/NYC</title></head><body>
Menu Share | Print | Download Company: Kizuna Dance Location: Brooklyn, NY Compensation: $17/hr rehearsals
Kizuna Dance is looking for two dancers. Submissions are accepted through October 31, 2026. &lt; back previous listing
</body></html>
"""


class Craigslist(unittest.TestCase):
    def test_results_are_parsed_with_borough_and_pay(self):
        items = craigslist.parse_results(CL_PAGE, "brooklyn", "tlg")
        self.assertEqual(len(items), 2)
        rec = craigslist.to_record(items[0])
        self.assertEqual((rec["borough"], rec["opportunity_type"], rec["fee"]), ("brooklyn", "gig", "pays $150"))
        self.assertIn("[category: Performing arts]", rec["description"])
        self.assertIn("bushwick", rec["description"])

    def test_listing_that_does_not_fit_its_category_is_dropped(self):
        items = craigslist.parse_results(CL_PAGE, "brooklyn", "tlg")
        self.assertIsNone(craigslist.to_record(items[1]))


class Playbill(unittest.TestCase):
    def test_only_new_york_performers_are_kept(self):
        recs = [playbill.to_record(i) for i in playbill.parse_page(PB_PAGE)]
        kept = [r for r in recs if r]
        self.assertEqual(len(kept), 1)
        self.assertEqual((kept[0]["borough"], kept[0]["opportunity_type"]), ("unknown", "audition"))
        self.assertIn("Dionysia Collective", kept[0]["title"])

    def test_detail_stops_before_the_related_jobs_list(self):
        page = ("<html>Job Details DESCRIPTION Auditions are Friday, November 13th. APPLY BY EMAIL "
                "Related Jobs Performer Paid Much Ado - Submit for NYC Appointments (Deadline: 11.09.26) Northern Stage</html>")
        detail = playbill.detail_text(page)
        self.assertIn("Friday, November 13th", detail)
        self.assertNotIn("11.09.26", detail)
        self.assertIsNone(dates.explicit_deadline(detail))

    def test_vague_place_is_settled_by_the_description(self):
        item = {"title": "Auditions for a New Boricua Play", "place": "NY",
                "detail": "AUDITION INFORMATION WHERE AMDA Studios - 250 W 54th St, New York, NY 10019 WHEN November 15, 2026"}
        self.assertEqual(playbill.borough_for(item), "manhattan")
        self.assertEqual(playbill.borough_for({**item, "place": ""}), "manhattan")

    def test_a_listing_elsewhere_is_not_pulled_into_nyc_by_its_description(self):
        item = {"title": "Grease", "place": "Sandy Springs, GA", "detail": "cast members may live in Brooklyn"}
        self.assertIsNone(playbill.borough_for(item))
        self.assertEqual(playbill.borough_for({**item, "title": "Singers - New York City Auditions"}), "unknown")

    def test_title_deadline_beats_a_date_in_the_description(self):
        item = {"title": "Much Ado About Nothing - Submit for NYC Appointments (Deadline: 11.09.26)",
                "detail": "Appointments are held by Thursday, November 5, 2026 at the studio."}
        self.assertEqual(playbill.deadline_of(item), "2026-11-09")

    def test_equity_principal_audition_date_in_the_title_is_the_deadline(self):
        item = {"title": "The People's Theatre 2026-27 Season - NYC EPA (11.05.26) & (11.06.26)", "detail": ""}
        self.assertEqual(playbill.deadline_of(item), "2026-11-05")

    def test_a_show_run_is_not_a_deadline(self):
        item = {"title": "Unannounced Play", "detail": "Rehearsals begin in February and the play runs through March 14, 2027."}
        self.assertIsNone(playbill.deadline_of(item))
        self.assertEqual(playbill.deadline_of({"title": "x", "detail": "Submissions due by November 4th, 2026."}), "2026-11-04")

    def test_borough_words(self):
        self.assertEqual(playbill.borough_of("Staten Island, NY"), "staten_island")
        self.assertEqual(playbill.borough_of("Brooklyn , NY"), "brooklyn")
        self.assertEqual(playbill.borough_of("Rye, NY"), None)
        self.assertEqual(playbill.borough_of("Sandy Springs, GA"), None)


class DanceNYC(unittest.TestCase):
    def test_listing_fields_and_deadline(self):
        item = dancenyc.parse_listing(DANCE_LISTING)
        self.assertEqual((item["title"], item["company"], item["location"]), ("Kizuna Dance Audition", "Kizuna Dance", "Brooklyn, NY"))
        rec = dancenyc.to_record({**item, "category": "Auditions", "url": "https://www.dance.nyc/x"})
        self.assertEqual((rec["borough"], rec["opportunity_type"], rec["deadline"]), ("brooklyn", "audition", "2026-10-31"))

    def test_other_cities_are_dropped(self):
        item = {"title": "WIP", "location": "Watertown, MA", "body": "Boston Dance Theater", "category": "Auditions", "url": "u"}
        self.assertIsNone(dancenyc.to_record(item))

    def test_listing_with_no_location_uses_nyc_wording(self):
        item = {"title": "Casting", "body": "casting NYC based dancers", "category": "Auditions", "url": "u"}
        self.assertEqual(dancenyc.to_record(item)["borough"], "unknown")

    def test_old_listings_are_skipped(self):
        page = '<a href="/for-artists/listings/2026/10/New-One/">a</a><a href="/for-artists/listings/2010/04/Old-One/">b</a>'
        self.assertEqual(dancenyc.listing_urls(page, date(2026, 10, 27)), ["/for-artists/listings/2026/10/New-One/"])


class Dates(unittest.TestCase):
    def test_deadlines(self):
        self.assertEqual(dates.explicit_deadline("Submissions are accepted through October 31, 2026."), "2026-10-31")
        self.assertEqual(dates.explicit_deadline("Submit for NYC Appointments (Deadline: 10.30.26)"), "2026-10-30")
        self.assertIsNone(dates.explicit_deadline("Auditions are held every Saturday."))

    def test_a_later_date_is_not_mistaken_for_the_deadline(self):
        text = "To submit: please send a short monologue before 10/31 DURATION Nov 9, 2026 - Dec 18, 2026"
        self.assertEqual(dates.explicit_deadline(text, date(2026, 10, 27)), "2026-10-31")

    def test_numeric_date_without_a_year_takes_the_next_one_coming(self):
        self.assertEqual(dates.explicit_deadline("apply by 3/1", date(2026, 10, 27)), "2027-03-01")
        self.assertEqual(dates.explicit_deadline("Submissions due by November 4th, 2026.", date(2026, 10, 27)), "2026-11-04")


if __name__ == "__main__":
    unittest.main()
