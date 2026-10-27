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
