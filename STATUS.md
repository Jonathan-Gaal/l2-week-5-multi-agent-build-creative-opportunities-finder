# Where the backfill stands

Branch `feature/backfill` · written 2026-10-27 · work by Mara

This is the lean PRD's backfill (section 3): fetch NYC opportunities for artists, drop what is not in NYC or has expired, dedupe, and publish a snapshot the Filter, Ranker and Reviewer can read.

## See it

- **Dashboard of the snapshot** (by artist category, borough and type, with every listing): https://claude.ai/artifact/1KJoDsygR95xDTkuCN2dwU
- **Source coverage** (every site tried, what each gave the snapshot, and the sites that need a screenshot): https://claude.ai/artifact/HG3uL34umsY8VpDgYZjACG
  This one is private until it is shared from the page's Share menu. Its code is in [artifacts/](artifacts/).
- **The snapshot as text:** [data/snapshot.md](data/snapshot.md) (summary table, then every record) and [data/snapshot.json](data/snapshot.json).
- **Everything learned about each source,** the terms review, and the build log: [source-research.md](source-research.md). Section 17 is the master list of every site tried.

## The numbers

> **Update 2026-10-28:** these counts are for Mara's `data/snapshot.json`. The combined snapshot the agents and Supabase read is `data/snapshots/2026-10-27/` (1,526 records, staging). 405 of them come from this backfill and are labeled "not rechecked against the source" in results.

526 records in the published snapshot, from 8 sources:

| Source | Records | What it is |
| --- | --: | --- |
| Craigslist New York | 311 | Talent, creative, writing and musician gigs, searched per borough |
| Dance/NYC | 61 | Auditions, choreographic calls, funding |
| FireMics | 50 | Recurring comedy open mics (one record per mic) |
| Playbill Jobs | 46 | NYC performer and musician listings, many Equity auditions |
| A4 | 28 | A board that re-lists other organizations' calls |
| NYC arts organization pages | 22 | Grants and residencies (Bronx Council, LMCC, Staten Island Arts, others) |
| Pages read by hand | 6 | Entered in `backfill/extracted.json`, each with a quote checked against the saved page |
| NYC Parks events feed | 1 | 615 events read, one real open call |

By borough: Manhattan 186, Brooklyn 128, Queens 67, Staten Island 24, Bronx 19, "New York" with no borough stated 101, citywide 1.

About 127 sites and datasets were tried: 80 read, 12 partly, 25 blocked, empty or closed, 6 skipped on purpose.

## Run it

```
python -m backfill.run                      # all sources, about 10 minutes; writes data/snapshot.db, .md, .csv, .json
python -m backfill.extracted                # check backfill/extracted.json against the saved pages
python -m unittest discover -s tests        # 63 tests
python -m backfill.crawler --only "FabNYC"  # browser crawl of one seed; saves page text to data/pages/
python -m backfill.digest fabnyc.org        # short digest of the saved pages, for reading
```

The crawler needs Playwright: `pip install playwright` and `python -m playwright install chromium`.

## How it is built

- `backfill/run.py` runs each source module (`NAME`, `fetch()`, `to_record()`), applies the NYC and expiry checks, dedupes by title, borough and deadline, writes a staging snapshot, then publishes it in one step.
- `backfill/crawler.py` renders pages in a real browser and saves their text. It honors robots.txt and does not try to get past a block.
- **The Extractor is not the Claude API yet.** Until a key is attached, a Claude Code session reads the saved pages and writes entries into `backfill/extracted.json`. `backfill/extracted.py` rejects any entry whose quote is not on the saved page. The API Extractor would write the same file.
- Artist categories come from the source, a hand label in `backfill/artist_categories.json`, or keyword rules, as a stand-in for the Extractor.

## Where to look, Jon

- **The Ranker and Reviewer can start from `data/snapshot.json`.** Fields: title, artist_category, opportunity_type, borough, deadline, source, source_url, checked_at.
- **Types beyond the lean PRD:** `audition`, `open_mic`, `gig` and `space` were added. They need a decision.
- **Quality:** Craigslist is 59% of the snapshot and has no dates, so it cannot be expired. Six records are marked "Needs review" (promotional or panelist listings). 101 records say New York without naming a borough.
- **Thin spots:** poetry (2), writing (11), the Bronx (19), Staten Island (24).
- **Blocked sites** (Casting Networks, Backstage, NYFA, MTA and others) return 403 to scripts. The plan is screenshots taken by a person, which are read and added through `extracted.json`.
- **This repo is public.** The snapshot links to listings on sites whose terms prohibit scraping (Craigslist, A4, FireMics). The decision to proceed for a non-commercial class proof of concept is recorded in `source-research.md`, section 7. The CSV with the full copied text is not committed.
- **Not done:** the Claude API Extractor, a recurring refresh, the request path (Filter, Ranker, Reviewer), the golden set.
