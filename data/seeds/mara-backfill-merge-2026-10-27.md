# Mara's backfill: dedupe and seed merge (2026-10-27)

Source: `origin/feature/backfill` (commit 0c9175c, Mara Munoz). Her snapshot has 526 records from 8 pipeline sources and a 60-site seed list.

## Duplicates against our snapshot (678 records)

Matched on the same URL, the same normalized title and borough, or a near-identical title (>85%) on the same site.

| Her source | Records | Duplicates | Unique | Status under INVALIDATORS.md |
|---|---|---|---|---|
| craigslist | 311 | 0 | 311 | Terms prohibit scraping |
| dancenyc | 61 | 6 | 55 | Compliant (also our source) |
| firemics | 50 | 0 | 50 | Terms prohibit scraping without written permission |
| playbill | 46 | 0 | 46 | robots.txt blocks Claude agents |
| a4 | 28 | 7 | 21 | Terms prohibit scraping |
| orgs | 22 | 8 | 14 | Compliant |
| extracted | 7 | 0 | 7 | Compliant |
| nyc_parks | 1 | 1 | 0 | Compliant (also our source) |
| **Total** | **526** | **22** | **504** | |

Compliant unique records (Dance/NYC, NYC arts organization pages, hand-extracted): 76. These still need our verification (quote on own page, URL 200, robots on the exact URL) before joining a snapshot.

## Categories of her unique records

By artist category: Music 168, Performing arts 136, Dance 59, Visual art 59, Comedy 50, All disciplines 13, Writing & publishing 11, Needs review 6, Poetry 2.

By type: Gig 315, Audition 80, Open mic 51, Open call 33, Grant 20, Residency 4, Space 1.

## Seed merge

- 29 of her sources were already in `seed-sources.json`; they now carry `contributed_by`, her record count and her duplicate count.
- 36 new sources added with id prefix `mara-`, categorized by discipline (literary, dance, theater, music, comedy, multi, aggregator).
- Status follows our rules, not the one-off decision in her `source-research.md` section 7: robots blocks (Brooklyn Poets, Public Theater, Bang on a Can) are presentation-only; Craigslist and FireMics are held because their terms prohibit scraping; the rest are held until our pipeline crawls them and their terms are reviewed.
- A4 (`aaartsalliance`) is now held: Mara's terms review found it prohibits scraping. Our snapshot has 8 records from A4 that need a decision.

## Not merged

Her records were not added to our snapshot. Her Craigslist, FireMics, Playbill and A4 records conflict with robots.txt or terms under our rules.
