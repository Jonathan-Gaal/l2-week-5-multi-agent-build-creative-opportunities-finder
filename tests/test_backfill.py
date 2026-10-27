import os
import tempfile
import unittest

from backfill import db, parks, run


def item(title, parkids="M010", description="", link="http://example.org/e"):
    return {"title": title, "parkids": parkids, "description": description, "link": link}


class FakeSource:
    NAME = "fake"
    NYC_ONLY = True
    items = []

    @staticmethod
    def fetch():
        return FakeSource.items

    to_record = staticmethod(parks.to_record)


def go(items, path, now):
    FakeSource.items = items
    return run.run(path, sources=[FakeSource], now=now)


def temp_db():
    return os.path.join(tempfile.mkdtemp(), "t.db")


class ParksMapping(unittest.TestCase):
    def test_borough_from_park_id(self):
        self.assertEqual(parks.borough_of("M010"), "manhattan")
        self.assertEqual(parks.borough_of("x147A"), "bronx")
        self.assertEqual(parks.borough_of("M010,B057"), "citywide")
        self.assertEqual(parks.borough_of(""), "unknown")
        self.assertEqual(parks.borough_of(None), "unknown")

    def test_open_call_kept_and_cleaned(self):
        rec = parks.to_record(item("NYC Parks&#8217; Wreath Open Call", description="&nbsp;<b>Apply</b> now"))
        self.assertEqual(rec["title"], "NYC Parks’ Wreath Open Call")
        self.assertEqual(rec["opportunity_type"], "open_call")
        self.assertEqual(rec["description"], "Apply now")

    def test_funder_credit_is_not_a_grant(self):
        desc = "Made possible with funds from the Statewide Community Regrants Program."
        self.assertIsNone(parks.to_record(item("Art Workshop", description=desc)))
        self.assertEqual(parks.to_record(item("Artist Grant 2026"))["opportunity_type"], "grant")

    def test_fitness_class_dropped(self):
        self.assertIsNone(parks.to_record(item("Morning Yoga")))


class Backfill(unittest.TestCase):
    def test_repeat_listing_is_deduped_with_merged_provenance(self):
        items = [item("Wreath Open Call", link=f"http://example.org/{d}") for d in (1, 2, 3)]
        path = temp_db()
        stats, sid, total = go(items, path, "2026-10-27T00:00:00+00:00")
        self.assertEqual((stats["fake"]["stored"], stats["fake"]["merged"], total), (1, 2, 1))
        conn = db.connect(path)
        prov = conn.execute("SELECT provenance FROM records").fetchone()[0]
        self.assertEqual(prov.count("source_url"), 3)
        conn.close()

    def test_expired_record_is_dropped_and_counted(self):
        class Expiring(FakeSource):
            NAME = "expiring"

            @staticmethod
            def fetch():
                return [item("Old Open Call"), item("Live Open Call"), item("Rolling Open Call")]

            @staticmethod
            def to_record(it):
                rec = parks.to_record(it)
                rec["deadline"] = {"Old": "2026-10-01", "Live": "2026-12-01", "Rolling": "rolling"}[it["title"].split()[0]]
                return rec

        stats, sid, total = run.run(temp_db(), sources=[Expiring], now="2026-10-27T00:00:00+00:00")
        self.assertEqual((stats["expiring"]["expired"], total), (1, 2))

    def test_non_nyc_source_needs_confirmation(self):
        class National(FakeSource):
            NAME = "national"
            NYC_ONLY = False

            @staticmethod
            def fetch():
                return [item("Anywhere Open Call"), item("Confirmed Open Call")]

            @staticmethod
            def to_record(it):
                rec = parks.to_record(it)
                rec["nyc_confirmed"] = it["title"].startswith("Confirmed")
                return rec

        stats, sid, total = run.run(temp_db(), sources=[National], now="2026-10-27T00:00:00+00:00")
        self.assertEqual((stats["national"]["not_nyc"], total), (1, 1))

    def test_publish_swaps_snapshots(self):
        path = temp_db()
        go([item("A Open Call")], path, "2026-10-27T00:00:00+00:00")
        go([item("B Open Call")], path, "2026-10-28T00:00:00+00:00")
        conn = db.connect(path)
        status = dict(conn.execute("SELECT snapshot_id, status FROM snapshots").fetchall())
        self.assertEqual(status["2026-10-27T00:00:00+00:00"], "retired")
        self.assertEqual(status["2026-10-28T00:00:00+00:00"], "published")
        conn.close()

    def test_empty_run_keeps_old_snapshot(self):
        path = temp_db()
        go([item("A Open Call")], path, "2026-10-27T00:00:00+00:00")
        go([item("Yoga")], path, "2026-10-28T00:00:00+00:00")
        conn = db.connect(path)
        status = dict(conn.execute("SELECT snapshot_id, status FROM snapshots").fetchall())
        self.assertEqual(status["2026-10-27T00:00:00+00:00"], "published")
        conn.close()


if __name__ == "__main__":
    unittest.main()
