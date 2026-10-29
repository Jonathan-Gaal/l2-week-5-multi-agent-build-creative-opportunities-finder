import unittest
from datetime import date

from backfill import firemics

BADGE = '<div class="mantine-Badge-root"><span class="mantine-Badge-label">%s</span></div>'


def event_row(time, title, venue, borough, genre, cost, slug):
    return (f'<tr><td><a href="/events/{slug}">View {title}</a></td><td><p class="t">{time}</p><p class="t">{title}</p><p class="t">{venue}</p>'
            f'{BADGE % borough}{BADGE % genre}{BADGE % cost}</td></tr>')


def day_badge(label):
    return f'<h2><div class="mantine-Badge-root"><span class="mantine-Badge-label">{label}</span></div></h2>'


# like the real page: the first day header comes before the rows, the next one ends the previous day's last row
PAGE = (
    day_badge("Tuesday<!-- --> <!-- -->10/27")
    + "<table>"
    + event_row("4:00 PM", "Open Mic", "West Side Comedy Club", "Manhattan", "Stand-up Comedy", "$5.85", "wscc-open-mic")
    + event_row("6:00 PM", "Bklyn Made Open Mic", "BKLYN Made Comedy Club", "Brooklyn", "Stand-up Comedy", "$3", "bklyn-made").replace(
        "</tr>", day_badge("Wednesday<!-- --> <!-- -->10/28") + "</tr>")
    + event_row("4:00 PM", "Open Mic", "West Side Comedy Club", "Manhattan", "Stand-up Comedy", "$5.85", "wscc-open-mic")
    + event_row("8:00 PM", "Queens Variety Night", "Astoria Bar", "Queens", "Variety", "Free", "queens-variety")
    + "</table>"
)
TODAY = date(2026, 10, 27)


class FireMics(unittest.TestCase):
    def test_rows_get_dates_from_day_headers(self):
        rows = firemics.parse_rows(PAGE, TODAY)
        self.assertEqual(len(rows), 4)
        self.assertEqual((rows[0]["date"], rows[3]["date"]), (date(2026, 10, 27), date(2026, 10, 28)))
        self.assertEqual((rows[1]["borough"], rows[1]["genre"], rows[1]["cost"]), ("brooklyn", "Stand-up Comedy", "$3"))

    def test_repeating_mic_collapses_to_one_record(self):
        items = firemics.collapse(firemics.parse_rows(PAGE, TODAY))
        self.assertEqual(len(items), 3)
        wscc = next(i for i in items if i["venue"] == "West Side Comedy Club")
        rec = firemics.to_record(wscc)
        self.assertEqual(rec["deadline"], "2026-10-27")
        self.assertEqual(rec["opportunity_type"], "open_mic")
        self.assertEqual(rec["title"], "Open Mic at West Side Comedy Club")
        self.assertIn("Tue, Wed", rec["description"])

    def test_free_and_borough_mapping(self):
        queens = next(i for i in firemics.collapse(firemics.parse_rows(PAGE, TODAY)) if i["borough"] == "queens")
        rec = firemics.to_record(queens)
        self.assertEqual((rec["fee"], rec["borough"]), ("none", "queens"))

    def test_year_rolls_over_in_december(self):
        self.assertEqual(firemics.infer_date(1, 2, date(2026, 12, 30)), date(2027, 1, 2))
        self.assertEqual(firemics.infer_date(10, 28, TODAY), date(2026, 10, 28))


if __name__ == "__main__":
    unittest.main()
