# Source invalidators and record filters

Applied during discovery (to sources) and backfill (to records). Updated 2026-11-01.

## Source-level invalidators (drop or hold the source)

1. **Stale.** No visible update date, no 2026 items, or every deadline already past.
2. **Outside the regional scope.** No meaningful New York, New Jersey or Connecticut participation or eligibility. Include all five NYC boroughs and Nassau/Suffolk; national discovery sources must support regional filtering or relevant eligibility.
3. **Not machine-readable.** Listings render only in JavaScript, or the page fails to load after retry.
4. **Terms restrict scraping.** Check robots.txt and terms before the first request. If in doubt, hold.
5. **Duplicate.** More than about 70% overlap with a source already kept.
6. **Diminishing returns.** Prioritize sources adding distinct regional programs. A local source with one useful program is valid; group repeated dates and shared calendars rather than padding counts.
7. **Unsafe.** Fee-driven or SEO aggregators, sites that repackage other listings with no provenance, and anything that requests payment or personal data from the scraper. Not visited. This includes a lapsed or hijacked domain that now serves unrelated content (for example, queenscouncilarts.org), and a compromised site carrying injected spam such as hidden casino links (for example, nywift.org). Also check that the page title matches the organization; a domain that has passed to a different organization is cut.
8. **Robots blocks our agent.** If robots.txt disallows ClaudeBot, anthropic-ai, or Claude-User for the path, do not crawl it. List the source for presentation only, or read the same listing from another host the funder uses (for example, its Submittable page). Check the exact URL you will request, query string included, not just its path: Squarespace's default robots.txt disallows `/*?format=json`, and some sites disallow API queries their pages allow. Apply the check to every request, including verification fetches.
9. **Bot challenge.** A Cloudflare or similar challenge counts as not machine-readable. Do not work around it.

## Reading pages directly (added 2026-11-01)

The multi-step crawl and triage is not needed for a page that may be read. When robots.txt and the terms allow it, an agent fetches and reads the listing page directly, in one step, and writes the record from it:

1. Check the site's robots.txt for the exact URL first (one request per site), and the terms if there is a terms page. Invalidators 4, 7, 8 and 9 above still apply; nothing here relaxes them.
2. Read only the page the record is about. Keep the record's `source_url` and `checked_at`, and quote eligibility word for word from the page, as for every other record.
3. A site that disallows our agent (robots.txt names ClaudeBot, anthropic-ai or Claude-User), forbids automated access in its terms, serves a bot challenge or returns 403 is not fetched. Examples at this date: Playbill, Craigslist, FireMics, A4 (Asian American Arts Alliance), Queens Museum, Pelham Art Center. Their listings stay presentation-only links. A person may open the page and paste its text, and the record is then written from the pasted text and marked `extraction: hand_pasted`.
4. Listings copied in without a recheck keep their "not verified" label. A direct read of an allowed page is what earns "verified."

Regional research seeds may be retained as watchlists with `verdict: hold` and `ingest: false`, including closed cycles, cancelled instances and unconfirmed schedules. Their inclusion is not approval to publish a live opportunity. Public paid classes are distinct from subscription paywalls; record participation fees separately from listing access.

Subscription sources marked `scrape_policy: display_only_no_requests` are display-only. Do not request their pages, feeds or robots documents. The host denylist is in `paid-display-only-sources.json`.

## Record-level filters (applied in the backfill)

- **Past deadline.** Drop if the deadline is earlier than the snapshot date. Keep the source for future cycles.
- **No deadline.** Keep, but flag as `deadline: null` so it is visible, not silently dropped.
- **Dead URL.** Drop if the URL does not return 200 on fetch.
- **Outside the regional scope.** Drop if neither participation location nor eligibility is relevant to NY/NJ/CT. Community participation includes jams, drum circles, library programs, classes, workshops, creative groups and studio access.
- **Ineligible.** Drop if the listing is clearly closed to the artist type (for example, a residency limited to a discipline the project does not cover). Log the reason.
- **Aggregator dates.** Never take a deadline from an aggregator's list card. Cards can omit the year, and "Rolling" is often wrong. Read the detail page, and the primary page when it is reachable.
- **Pay-to-publish.** Drop paid reviews, features, or "evidence" services listed as open calls.
- **Duplicate.** Collapse on `dedupe_key` (normalized title + org + deadline). Keep the record with the most complete fields.

## Notes for the snapshot

- Record `source_id` from `seed-sources.json` on every record for traceability.
- The snapshot manifest records which sources were kept, held, or cut, and why.
- Do not change a snapshot after publishing. Re-scrape to create a new dated snapshot.
