import unittest

import verify_sources as vs

PAGE = """Smack Mellon Artist Studio Program 2027-28
Applications are due December 1, 2026 at 11:59pm.
Open to NYC-based early career artists working in any medium.
Contact us"""


def cand(**kw):
    rec = {"title": "Smack Mellon Artist Studio Program 2027-28", "org": "Smack Mellon", "opportunity_type": "residency",
           "borough": "brooklyn", "region": "nyc", "deadline": "2026-12-01", "source": "smack-mellon",
           "source_url": "https://smackmellon.org/x", "disciplines": ["visual"],
           "eligibility": [{"requirement": "NYC-based early career artists",
                            "quote": "Open to NYC-based early career artists working in any medium."}]}
    rec.update(kw)
    return rec


class CheckRecord(unittest.TestCase):
    def test_passes_and_adds_date_quote(self):
        rec, note = vs.check_record(cand(), PAGE, today="2026-10-28")
        self.assertIsNone(note)
        self.assertEqual(rec["dedupe_key"], "smack mellon artist studio program 2027 28|brooklyn|2026-12-01")
        self.assertIn("Applications are due December 1, 2026", rec["eligibility"][-1]["quote"])
        self.assertEqual((rec["fee"], rec["checked_at"]), ("unknown", "2026-10-28"))

    def test_date_must_be_on_page(self):
        self.assertEqual(vs.check_record(cand(deadline="2026-12-02"), PAGE, "2026-10-28"), (None, "date not on page"))

    def test_date_without_year_on_page_is_not_enough(self):
        page = PAGE.replace(", 2026", "")
        self.assertEqual(vs.check_record(cand(), page, "2026-10-28")[1], "date not on page")

    def test_title_must_be_on_page(self):
        self.assertEqual(vs.check_record(cand(title="Other Program"), PAGE, "2026-10-28")[1], "title not on page")

    def test_quote_not_on_page_is_removed_not_kept(self):
        bad = [{"requirement": "x", "quote": "Open to everyone everywhere."}]
        rec, note = vs.check_record(cand(eligibility=bad), PAGE, "2026-10-28")
        self.assertEqual(note, "1 quote(s) not on page, removed")
        self.assertTrue(all(vs.flat(e["quote"]) in vs.flat(PAGE) for e in rec["eligibility"]))

    def test_past_and_series(self):
        self.assertEqual(vs.check_record(cand(), PAGE, "2026-12-02")[1], "past")
        series = cand(opportunity_type="event", deadline="rolling", event_dates=["2026-10-01", "2026-11-05"])
        self.assertIsNotNone(vs.check_record(series, PAGE, "2026-10-28")[0])

    def test_rolling_and_missing_deadline_need_no_date_line(self):
        for d in ("rolling", None):
            self.assertIsNotNone(vs.check_record(cand(deadline=d), PAGE, "2026-10-28")[0])

    def test_scope_and_required_fields(self):
        self.assertIn("scope", vs.check_record(cand(region="ohio", borough=None), PAGE, "2026-10-28")[1])
        self.assertIn("scope", vs.check_record(cand(borough=None), PAGE, "2026-10-28")[1])
        self.assertIn("scope", vs.check_record(cand(region="new_jersey"), PAGE, "2026-10-28")[1])
        self.assertIn("org", vs.check_record(cand(org=None), PAGE, "2026-10-28")[1])

    def test_curly_quotes_match_straight(self):
        page = PAGE.replace("Open to NYC-based", "“Open to NYC–based") + "”"
        rec, _ = vs.check_record(cand(eligibility=[{"requirement": "x", "quote": '"Open to NYC-based early career artists'}]),
                                 page, "2026-10-28")
        self.assertEqual(len([e for e in rec["eligibility"] if e["requirement"] == "x"]), 1)


class Dates(unittest.TestCase):
    def test_formats(self):
        for line in ("Due Dec. 1st, 2026", "deadline: 12/1/2026", "1 December 2026", "due 2026-12-01", "DECEMBER 1, 2026"):
            self.assertIsNotNone(vs.date_quote(line, "2026-12-01"), line)

    def test_no_false_day_match(self):
        self.assertIsNone(vs.date_quote("December 11, 2026", "2026-12-01"))


class Duplicates(unittest.TestCase):
    def test_same_listing_by_title_overlap(self):
        a = {"title": "Lisa Polizzi Jam", "deadline": "2026-11-05", "borough": None, "region": "long_island", "dedupe_key": "a"}
        b = {**a, "title": "Daisys Patchogue Lisa Polizzi Jam", "dedupe_key": "b"}
        self.assertTrue(vs.same_listing(a, b))
        self.assertFalse(vs.same_listing(a, {**b, "deadline": "2026-11-06"}))
        self.assertFalse(vs.same_listing(a, {**a, "title": "Open Mic Night", "dedupe_key": "c"}))

    def test_undated_listings_need_an_exact_match(self):
        a = {"title": "Hard Rock band seeking Drummer", "deadline": None, "borough": "manhattan", "region": "nyc", "dedupe_key": "a"}
        b = {**a, "title": "Bassist & Drummer Wanted For Working Classic Rock Cover Band", "dedupe_key": "b"}
        self.assertFalse(vs.same_listing(a, b))
        self.assertFalse(vs.same_listing({**a, "deadline": "rolling"}, {**b, "deadline": "rolling"}))

    def test_filler_words_do_not_make_a_match(self):
        base = {"deadline": "2026-11-03", "borough": "manhattan", "region": "nyc", "dedupe_key": "x"}
        for x, y in (("Open Mic at The Stand", "Open Mic at Caravan Of Dreams"), ("GO Queens Grant", "2027 Artists in Queens Grant"),
                     ("Welcome Table - NYC EPA (11.03.26)", "Blanca And Ines - NYC EPA (11.03.26)")):
            self.assertFalse(vs.same_listing({**base, "title": x}, {**base, "title": y}), x)
        for x, y in (("Triangle 2027-2028 Open Call", "Triangle 2027-2028 Open Call (studio residency)"),
                     ("Community Engagement Grants (CEGs)", "2027 Community Engagement Grants (CEG)")):
            self.assertTrue(vs.same_listing({**base, "title": x}, {**base, "title": y}), x)

    def test_same_run_titles_are_distinct(self):
        base = {"deadline": "2026-11-03", "borough": "manhattan", "region": "nyc", "dedupe_key": "x",
                "source": "mara-firemics-open-mics", "extraction": "mara_backfill_unverified"}
        a, b = {**base, "title": "Stand-Up Comedy at Suite"}, {**base, "title": "Open Mic at The Stand"}
        self.assertFalse(vs.same_listing(a, b))
        self.assertTrue(vs.same_listing({**a, "title": "Triangle 2027-2028 Open Call"},
                                        {**b, "title": "Triangle 2027-2028 Open Call (studio residency)", "extraction": "crawl_reviewed"}))

    def test_find_duplicate_by_key(self):
        rec, _ = vs.check_record(cand(), PAGE, "2026-10-28")
        self.assertIs(vs.find_duplicate(rec, [rec]), rec)


class Select(unittest.TestCase):
    def test_only_held_with_url(self):
        seeds = [{"id": "a", "verdict": "hold", "url": "u", "category": "residency"},
                 {"id": "b", "verdict": "keep", "url": "u", "category": "residency"},
                 {"id": "c", "verdict": "hold", "url": None, "category": "residency"},
                 {"id": "d", "verdict": "hold", "url": "u", "category": "open_mic"}]
        self.assertEqual([s["id"] for s in vs.select_held(seeds, ["residency"])], ["a"])


class Triage(unittest.TestCase):
    def test_terms_restriction_blocks(self):
        src = {"source_id": "s", "pages": [{"url": "u1", "status": "fetched"}, {"url": "t", "status": "fetched"}]}
        log = {"u1": {"url": "u1", "artifact": "a"}, "t": {"url": "t", "artifact": "b", "terms_restriction_detected": True}}
        self.assertEqual(vs.triage(src, log)["reason"], "terms restrict automated access")

    def test_robots_block_and_readable(self):
        self.assertEqual(vs.triage({"source_id": "s", "pages": [{"url": "u", "status": "robots_disallowed"}]}, {})["reason"],
                         "robots_disallowed")
        log = {"u2": {"url": "u2", "artifact": "a", "evidence": [{"text": "Deadline March 1, 2027"}, {"text": "old 2019"}]}}
        t = vs.triage({"source_id": "s", "pages": [{"url": "u", "status": "redirect", "resolved_url": "u2", "resolved_status": "fetched"}]}, log)
        self.assertEqual((t["outcome"], t["pages"][0]["dated_lines"]), ("readable", ["Deadline March 1, 2027"]))


if __name__ == "__main__":
    unittest.main()
