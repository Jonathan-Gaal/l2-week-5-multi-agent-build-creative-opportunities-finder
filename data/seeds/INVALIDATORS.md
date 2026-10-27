# Source invalidators and record filters

Applied during discovery (to sources) and backfill (to records). Updated 2026-10-27.

## Source-level invalidators (drop or hold the source)

1. **Stale.** No visible update date, no 2026 items, or every deadline already past.
2. **Not NYC.** National or international scope with no borough filter.
3. **Not machine-readable.** Listings render only in JavaScript, or the page fails to load after retry.
4. **Terms restrict scraping.** Check robots.txt and terms before the first request. If in doubt, hold.
5. **Duplicate.** More than about 70% overlap with a source already kept.
6. **Diminishing returns.** After the first pass of about eight keepers, drop any source that adds fewer than three new, unique, currently open NYC records.
7. **Unsafe.** Fee-driven or SEO aggregators, sites that repackage other listings with no provenance, and anything that requests payment or personal data from the scraper. Not visited.

## Record-level filters (applied in the backfill)

- **Past deadline.** Drop if the deadline is earlier than the snapshot date. Keep the source for future cycles.
- **No deadline.** Keep, but flag as `deadline: null` so it is visible, not silently dropped.
- **Dead URL.** Drop if the URL does not return 200 on fetch.
- **Outside NYC.** Drop if the location does not match a borough or a NYC address.
- **Ineligible.** Drop if the listing is clearly closed to the artist type (for example, a residency limited to a discipline the project does not cover). Log the reason.
- **Duplicate.** Collapse on `dedupe_key` (normalized title + org + deadline). Keep the record with the most complete fields.

## Notes for the snapshot

- Record `source_id` from `seed-sources.json` on every record for traceability.
- The snapshot manifest records which sources were kept, held, or cut, and why.
- Do not change a snapshot after publishing. Re-scrape to create a new dated snapshot.
