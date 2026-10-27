"""Deadline dates written out in a listing's text."""
import re
from datetime import date

MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split()
MONTH_NAMES = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"


def _patterns(words):
    """(date with a year, numeric date) patterns that follow one of the deadline words.

    Nothing with a digit or slash may sit between the word and the date, so "before 10/31 DURATION Nov 9, 2026"
    is not read as a deadline of Nov 9.
    """
    explicit = re.compile(
        r"(?:" + words + r")[^.\d/]{0,40}?\b(" + MONTH_NAMES + r")[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (20\d\d)", re.I)
    numeric = re.compile(
        r"(?:" + words + r")\W{0,4}(\d{1,2})[./](\d{1,2})(?:[./](20\d\d|\d\d))?(?![\d/])", re.I)
    return explicit, numeric


# "through" and "until" also introduce the dates a show runs ("through March 14"), so listings of work use STRICT.
LOOSE = _patterns("deadline|due|through|until|by|before|close[sd]?")
STRICT = _patterns("deadline|due|by|before|close[sd]?")
EXPLICIT_DATE, NUMERIC_DATE = LOOSE


def explicit_deadline(text, today=None, strict=False):
    """The first deadline in text, as YYYY-MM-DD, or None."""
    today = today or date.today()
    explicit, numeric = STRICT if strict else LOOSE
    for m in explicit.finditer(text):
        try:
            return date(int(m.group(3)), MONTHS.index(m.group(1).lower()[:3]) + 1, int(m.group(2))).isoformat()
        except ValueError:
            continue
    for m in numeric.finditer(text):
        month, day, year = int(m.group(1)), int(m.group(2)), m.group(3)
        try:
            if year:
                return date(int(year) + 2000 if int(year) < 100 else int(year), month, day).isoformat()
            when = date(today.year, month, day)
            return (when if when >= today else date(today.year + 1, month, day)).isoformat()
        except ValueError:
            continue
    return None
