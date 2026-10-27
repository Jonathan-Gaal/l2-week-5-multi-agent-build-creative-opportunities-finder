# Source invalidators and record filters

Applied during discovery (to sources) and backfill (to records). Updated 2026-10-27.

## Source-level invalidators (drop or hold the source)

1. **Stale.** No visible update date, no 2026 items, or every deadline already past.
2. **Not NYC.** National or international scope with no borough filter.
3. **Not machine-readable.** Listings render only in JavaScript, or the page fails to load after retry.
4. **Terms restrict scraping.** Check robots.txt and terms before the first request. If in doubt, hold.
5. **Duplicate.** More than about 70% overlap with a source already kept.
6. **Diminishing returns.** After the first pass of about eight keepers, drop any source that adds fewer than three new, unique, currently open NYC records.
7. **Unsafe.** Fee-driven or SEO aggregators, sites that repackage other listings with no provenance, and anything that requests payment or personal data from the scraper. Not visited. This includes a lapsed or hijacked domain that now serves unrelated content (for example, queenscouncilarts.org), and a compromised site carrying injected spam such as hidden casino links (for example, nywift.org). Also check that the page title matches the organization; a domain that has passed to a different organization is cut.
8. **Robots blocks our agent.** If robots.txt disallows ClaudeBot, anthropic-ai, or Claude-User for the path, do not crawl it. List the source for presentation only, or read the same listing from another host the funder uses (for example, its Submittable page).
9. **Bot challenge.** A Cloudflare or similar challenge counts as not machine-readable. Do not work around it.

## Record-level filters (applied in the backfill)

- **Past deadline.** Drop if the deadline is earlier than the snapshot date. Keep the source for future cycles.
- **No deadline.** Keep, but flag as `deadline: null` so it is visible, not silently dropped.
- **Dead URL.** Drop if the URL does not return 200 on fetch.
- **Outside NYC.** Drop if the location does not match a borough or a NYC address.
- **Ineligible.** Drop if the listing is clearly closed to the artist type (for example, a residency limited to a discipline the project does not cover). Log the reason.
- **Aggregator dates.** Never take a deadline from an aggregator's list card. Cards can omit the year, and "Rolling" is often wrong. Read the detail page, and the primary page when it is reachable.
- **Pay-to-publish.** Drop paid reviews, features, or "evidence" services listed as open calls.
- **Duplicate.** Collapse on `dedupe_key` (normalized title + org + deadline). Keep the record with the most complete fields.

## Notes for the snapshot

- Record `source_id` from `seed-sources.json` on every record for traceability.
- The snapshot manifest records which sources were kept, held, or cut, and why.
- Do not change a snapshot after publishing. Re-scrape to create a new dated snapshot.
