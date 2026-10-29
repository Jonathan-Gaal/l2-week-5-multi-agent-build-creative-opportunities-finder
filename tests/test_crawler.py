import unittest

from backfill import crawler


class Crawler(unittest.TestCase):
    def test_block_pages_are_recognized(self):
        self.assertTrue(crawler.is_blocked(403, "anything"))
        self.assertTrue(crawler.is_blocked(200, "Access Denied You don't have permission to access this server."))
        self.assertTrue(crawler.is_blocked(200, "Just a moment..."))
        self.assertFalse(crawler.is_blocked(200, "Open call for artists. " * 100))
        self.assertFalse(crawler.is_blocked(200, "A short page about access denied policies. " + "x" * 2000))

    def test_pages_with_deadlines_score_higher(self):
        signals, dates = crawler.score_text("Applications are due Nov 12, 2026. Auditions on 11/3/26. Open mic nights.")
        self.assertGreaterEqual(signals, 3)
        self.assertEqual(dates, 2)
        self.assertEqual(crawler.score_text("We make beautiful things."), (0, 0))

    def test_links_stay_on_the_same_site_and_skip_files(self):
        self.assertTrue(crawler.should_follow("https://www.example.org/grants/new-work", "example.org"))
        self.assertFalse(crawler.should_follow("https://other.org/grants", "example.org"))
        self.assertFalse(crawler.should_follow("https://example.org/brochure.pdf", "example.org"))
        self.assertFalse(crawler.should_follow("https://example.org/login", "example.org"))
        self.assertFalse(crawler.should_follow("mailto:a@example.org", "example.org"))

    def test_page_id_is_stable(self):
        self.assertEqual(crawler.page_id("https://example.org/a"), crawler.page_id("https://example.org/a"))
        self.assertNotEqual(crawler.page_id("https://example.org/a"), crawler.page_id("https://example.org/b"))


if __name__ == "__main__":
    unittest.main()
