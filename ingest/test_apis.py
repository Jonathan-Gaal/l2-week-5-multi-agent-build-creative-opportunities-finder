import datetime as dt
import unittest
import urllib.robotparser

from ingest import apis


def robots(lines):
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(lines)
    return rp


class CreativeFilter(unittest.TestCase):
    def test_whole_words_only(self):
        self.assertFalse(apis.is_creative("Requirement Contract for Installation of V/C Floor Tile in Apartments"))
        self.assertFalse(apis.is_creative("Partnership services"))

    def test_creative_work_matches(self):
        self.assertTrue(apis.is_creative("Percent for Art: Request for Qualifications"))
        self.assertTrue(apis.is_creative("Mural commission for community center"))
        self.assertTrue(apis.is_creative("Teaching artists for after-school dance"))

    def test_construction_excluded_even_with_creative_word(self):
        self.assertFalse(apis.is_creative("Design services for petroleum storage tank sumps"))


class ParseDate(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(apis.parse_date("2026-11-18T14:00:00.000"), dt.date(2026, 11, 18))
        self.assertEqual(apis.parse_date("03/02/2027"), dt.date(2027, 3, 2))
        self.assertEqual(apis.parse_date("10/27/2026 12:00 AM"), dt.date(2026, 10, 27))
        self.assertEqual(apis.parse_date("Nov 5, 2026"), dt.date(2026, 11, 5))

    def test_missing_or_garbage(self):
        self.assertIsNone(apis.parse_date(None))
        self.assertIsNone(apis.parse_date("TBD"))


class Gate(unittest.TestCase):
    def setUp(self):
        self.saved = dict(apis._robots_cache)

    def tearDown(self):
        apis._robots_cache.clear()
        apis._robots_cache.update(self.saved)

    def test_query_string_is_checked(self):
        apis._robots_cache["example.org"] = robots(["User-agent: *", "Disallow: /*?format=json"])
        self.assertTrue(apis.allowed("https://example.org/events"))
        self.assertFalse(apis.allowed("https://example.org/events?format=json"))

    def test_any_blocked_agent_blocks(self):
        apis._robots_cache["example.org"] = robots(["User-agent: ClaudeBot", "Disallow: /"])
        self.assertFalse(apis.allowed("https://example.org/anything"))

    def test_denylisted_host_never_requested(self):
        self.assertIn("theopencall.substack.com", apis.DENIED)
        self.assertFalse(apis.allowed("https://theopencall.substack.com/p/x"))

    def test_request_json_refuses_blocked_url(self):
        apis._robots_cache["example.org"] = robots(["User-agent: *", "Disallow: /"])
        with self.assertRaises(apis.Blocked):
            apis.request_json("https://example.org/api")


class Eventbrite(unittest.TestCase):
    def event(self, **over):
        e = {"id": "1", "name": {"text": "Beginner Ceramics Workshop"}, "summary": "All levels welcome to this hands-on clay class.",
             "start": {"local": (dt.date.today() + dt.timedelta(days=7)).isoformat() + "T18:00:00"}, "status": "live",
             "online_event": False, "is_free": True, "url": "https://www.eventbrite.com/e/x-1",
             "venue": {"name": "Studio", "address": {"postal_code": "11211", "localized_address_display": "1 Main St, Brooklyn"}},
             "organizer": {"name": "Clay Co"}}
        e.update(over)
        return e

    def test_keeps_local_participatory_future_event(self):
        r = apis._eventbrite_record(self.event())
        self.assertEqual((r["borough"], r["region"], r["fee"]), ("brooklyn", "nyc", "none"))

    def test_drops_online_past_concert_or_out_of_area(self):
        self.assertIsNone(apis._eventbrite_record(self.event(online_event=True)))
        self.assertIsNone(apis._eventbrite_record(self.event(start={"local": "2020-01-01T10:00:00"})))
        self.assertIsNone(apis._eventbrite_record(self.event(name={"text": "Jazz Concert"})))
        self.assertIsNone(apis._eventbrite_record(self.event(venue={"address": {"postal_code": "94110"}})))

    def test_place(self):
        self.assertEqual(apis.place("10458"), ("bronx", "nyc"))
        self.assertEqual(apis.place("07302"), (None, "new_jersey"))
        self.assertEqual(apis.place("11743"), (None, "long_island"))
        self.assertIsNone(apis.place("94110"))
        self.assertIsNone(apis.place(None))

    def test_place_covers_full_scope(self):
        # Hartford and Princeton were outside the old CT/NJ ranges.
        self.assertEqual(apis.place("06103"), (None, "connecticut"))
        self.assertEqual(apis.place("08540"), (None, "new_jersey"))
        cases = {"19103": "pennsylvania", "02116": "massachusetts", "02903": "rhode_island", "03101": "new_hampshire",
                 "04101": "maine", "05401": "vermont", "05501": "massachusetts", "19801": "delaware", "20001": "dc",
                 "20500": "dc", "21201": "maryland", "12207": "upstate_ny", "14202": "upstate_ny", "12401": "westchester_hudson"}
        for zip_code, region in cases.items():
            self.assertEqual(apis.place(zip_code), (None, region), zip_code)
        self.assertIsNone(apis.place("20101"))   # Dulles, Virginia


class GrantsGov(unittest.TestCase):
    def test_keeps_only_individual_eligible_open_grants(self):
        future = (dt.date.today() + dt.timedelta(days=30)).strftime("%m/%d/%Y")
        hits = [{"id": "1", "title": "Creative Writing Fellowships", "agencyCode": "NEA", "closeDate": future},
                {"id": "2", "title": "Museums for America", "agencyCode": "IMLS", "closeDate": future},
                {"id": "3", "title": "Old Fellowship", "agencyCode": "NEA", "closeDate": "01/01/2020"},
                {"id": "4", "title": "Biennale Statement", "agencyCode": "DOS-ECA", "closeDate": "01/01/2099"}]
        types = {1: [{"id": "21"}], 2: [{"id": "12"}], 4: [{"id": "21"}, {"id": "12"}]}

        def fake(url, data=None, headers=None):
            if url.endswith("search2"):
                return {"data": {"oppHits": hits}}
            return {"data": {"synopsis": {"applicantTypes": types[data["opportunityId"]], "applicantEligibilityDesc": "Published writers."}}}

        saved, apis.request_json = apis.request_json, fake
        try:
            out = apis.grants_gov()
        finally:
            apis.request_json = saved
        self.assertEqual([r["title"] for r in out], ["Creative Writing Fellowships", "Biennale Statement"])
        self.assertEqual(out[0]["eligibility"][0]["quote"], "Published writers.")
        self.assertIsNone(out[1]["deadline"])   # 2099 placeholder


class NycJobs(unittest.TestCase):
    def job(self, **over):
        j = {"job_id": "805925", "business_title": "Graphic Designer", "agency": "CAMPAIGN FINANCE BOARD", "posting_type": "External",
             "post_until": (dt.date.today() + dt.timedelta(days=30)).strftime("%d-%b-%Y").upper(), "salary_range_from": "70000",
             "salary_range_to": "80000", "salary_frequency": "Annual", "full_time_part_time_indicator": "F", "work_location": "100 Church St., N.Y.",
             "minimum_qual_requirements": "A baccalaureate degree from an accredited college in graphic design.",
             "residency_requirement": "New York City residency is generally required within 90 days of appointment."}
        j.update(over)
        return j

    def test_keeps_external_open_creative_job_with_salary(self):
        r = apis._job_record(self.job())
        self.assertEqual((r["opportunity_type"], r["award"], r["borough"], r["disciplines"]), ("job", "$70,000–$80,000 per year", "manhattan", ["design"]))
        self.assertEqual(r["source_url"], "https://cityjobs.nyc.gov/job/805925")
        self.assertEqual([e["requirement"] for e in r["eligibility"]], ["minimum qualifications", "residency"])

    def test_drops_internal_closed_and_non_creative(self):
        self.assertIsNone(apis._job_record(self.job(posting_type="Internal")))   # current city employees only
        self.assertIsNone(apis._job_record(self.job(post_until="01-JAN-2020")))
        for title in ("Design Engineer 2", "Senior Design Reviewer", "Solicitation Writer", "Accountant"):
            self.assertIsNone(apis._job_record(self.job(business_title=title)), title)

    def test_title_variants(self):
        self.assertEqual(apis._job_record(self.job(business_title="Director of Design, Bureau of Communications"))["disciplines"], ["design"])
        self.assertEqual(apis._job_record(self.job(business_title="Staff Writer"))["disciplines"], ["literary"])

    def test_borough_and_salary_parsing(self):
        self.assertEqual(apis._job_borough("9 Bond St, Brooklyn Ny"), "brooklyn")
        self.assertEqual(apis._job_borough("31-00 47th Ave, Long Island City"), "queens")
        self.assertEqual(apis._job_borough("42-09 28th Street"), "unknown")
        self.assertEqual(apis._salary({"salary_range_from": "25", "salary_range_to": "25", "salary_frequency": "Hourly"}), "$25 per hour")
        self.assertIsNone(apis._salary({}))


class SamGov(unittest.TestCase):
    def test_fits_daily_quota_and_filters_to_scope(self):
        import os
        future = (dt.date.today() + dt.timedelta(days=20)).isoformat()
        opps = [{"noticeId": "a", "title": "Mural for VA clinic", "responseDeadLine": future, "placeOfPerformance": {"zip": "10468"}},
                {"noticeId": "b", "title": "Exhibit photography", "responseDeadLine": future, "placeOfPerformance": {"state": {"code": "PA"}}},
                {"noticeId": "c", "title": "Band for ceremony", "responseDeadLine": future, "placeOfPerformance": {"state": {"code": "CA"}}},
                {"noticeId": "d", "title": "Video production", "responseDeadLine": future, "placeOfPerformance": {"state": {"code": "NY"}}},
                {"noticeId": "e", "title": "Old call", "responseDeadLine": "2020-01-01", "placeOfPerformance": {"zip": "10001"}}]
        calls = []

        def fake(url, data=None, headers=None):
            calls.append(url)
            return {"opportunitiesData": opps}   # same notices under every code, to exercise dedupe

        saved, apis.request_json = apis.request_json, fake
        os.environ["SAM_API_KEY"] = "test"
        try:
            out = apis.sam_gov()
        finally:
            apis.request_json = saved
            del os.environ["SAM_API_KEY"]
        self.assertLess(len(calls), 10)   # personal keys without a role get 10 requests a day
        self.assertEqual([(r["title"], r["region"]) for r in out], [("Mural for VA clinic", "nyc"), ("Exhibit photography", "pennsylvania")])


class TribeEvents(unittest.TestCase):
    site = {"source": "si-museum", "org": "Staten Island Museum", "borough": "staten_island", "region": "nyc"}

    def event(self, days=7, **over):
        e = {"title": "Collage &amp; Zine Workshop", "url": "https://example.org/event/collage/", "status": "publish",
             "start_date": (dt.date.today() + dt.timedelta(days=days)).isoformat() + " 18:00:00", "cost": "Free",
             "excerpt": "<p>Bring scraps and leave with a zine you made yourself.</p>", "categories": [],
             "venue": {"venue": "Snug Harbor", "zip": "10301", "state": "NY"}}
        e.update(over)
        return e

    def test_keeps_local_participatory_future_event(self):
        r = apis._tribe_record(self.event(), self.site)
        self.assertEqual((r["title"], r["borough"], r["fee"]), ("Collage & Zine Workshop", "staten_island", "none"))
        self.assertEqual(r["eligibility"][0]["quote"], "Bring scraps and leave with a zine you made yourself.")

    def test_drops_past_unlisted_spectator_or_out_of_scope(self):
        self.assertIsNone(apis._tribe_record(self.event(days=-1), self.site))
        self.assertIsNone(apis._tribe_record(self.event(hide_from_listings=True), self.site))
        self.assertIsNone(apis._tribe_record(self.event(title="Film Screening"), self.site))
        self.assertIsNone(apis._tribe_record(self.event(venue={"zip": "61801", "state": "IL"}), self.site))   # touring date
        self.assertIsNone(apis._tribe_record(self.event(venue={"state": "IL"}), self.site))

    def test_cancelled_dropped(self):
        self.assertIsNone(apis._tribe_record(self.event(title="Canceled | Collage Workshop"), self.site))

    def test_fee_from_cost_details(self):
        suffix = {"currency_symbol": "$", "currency_position": "suffix"}
        self.assertEqual(apis._tribe_fee({"cost": "135$", "cost_details": {**suffix, "values": ["135"]}}), "$135")
        self.assertEqual(apis._tribe_fee({"cost": "10$ – 15$", "cost_details": {**suffix, "values": ["10", "12", "15"]}}), "$10 – $15")
        self.assertEqual(apis._tribe_fee({"cost": "Free with admission"}), "Free with admission")
        self.assertEqual(apis._tribe_fee({"cost": ""}), "unknown")

    def test_category_counts_and_missing_venue_uses_site_place(self):
        r = apis._tribe_record(self.event(title="Saturday Session", categories=[{"name": "Workshops"}], venue=[]), self.site)
        self.assertEqual((r["borough"], r["region"], r["location"]), ("staten_island", "nyc", None))

    def test_recurring_occurrences_group_into_one_record(self):
        recs = [apis._tribe_record(self.event(days=d, url=f"https://example.org/event/collage/{d}/"), self.site) for d in (14, 7, 21)]
        [g] = apis._group_occurrences(recs)
        self.assertEqual(len(g["event_dates"]), 3)
        self.assertEqual(g["recurrence"], f"3 dates through {g['event_dates'][-1]}")


class KeyedAdaptersSkipWithoutKey(unittest.TestCase):
    def test_skip(self):
        import os
        for var, fn in (("NYC_API_KEY", apis.nyc_events), ("SAM_API_KEY", apis.sam_gov), ("EVENTBRITE_TOKEN", apis.eventbrite)):
            saved = os.environ.pop(var, None)
            try:
                self.assertEqual(fn(), [])
            finally:
                if saved is not None:
                    os.environ[var] = saved


if __name__ == "__main__":
    unittest.main()
