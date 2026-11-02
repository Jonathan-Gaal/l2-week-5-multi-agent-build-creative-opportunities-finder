# How to redo the retag, the map points and the publish

Plain steps for the next snapshot. Run from the repo root unless it says `web/`.

## 1. Check the artist types and kinds by reading the pages

- Read each listing's own page (see `data/seeds/INVALIDATORS.md`, "Reading pages directly"). Check robots.txt once per site and go slowly (about 3 seconds between requests). A browser-style User-Agent header is fine; no JavaScript, CAPTCHA or login tricks.
- Never open Craigslist, FireMics, A4, Eventbrite, Meetup, the Public Theater or any paid "display only" source. For those, tag from the stored title and text.
- Tags: up to 3 artist types, main one first. Use only the app's own lists: `web/src/lib/disciplineWords.ts` (artist types), `kinds.ts` and `tags.ts` (kinds). A call for dancers only is `dance`, not `theater`. Casting calls for film or TV are `casting_call`.
- A field the page does not give stays empty. Do not write "n/a".
- Write the answers into `records.json` (`disciplines`, `opportunity_type`, `subtype`, `category_confidence`, `category_reason`). `records.retagged.json` also carries `read_pay`, `read_fee`, `read_deadline`, `read_dates`, `read_location`, `read_status` and `retag_evidence`; the app does not show those yet.
- The record of what was read, with counts and open questions, is `REPORT.md` and `other_data_mistakes.md` in this folder.

## 2. Map points

```
python3 scripts/geocode_listings.py <snapshot id>
```

It writes `data/geo/<id>.json` and the deployable copy `web/src/data/map-points/<id>.json`. Then add the id to `BUNDLED` in `web/src/lib/geo.ts`. The deployed server cannot read files outside `web/`, so a points file that is not bundled means no pins.

## 3. Load and publish (this writes to the real database)

You need `SUPABASE_SECRET_KEY` (and `SUPABASE_URL`) from `.env`.

```
PYTHONUTF8=1 python3 scripts/load_supabase.py <snapshot id>              # loads it as staging
PYTHONUTF8=1 python3 scripts/load_supabase.py <snapshot id> --publish    # then publishes it, retiring the current one
```

On Windows keep `PYTHONUTF8=1`; the loader reads the files with the default encoding otherwise. A snapshot that is already published is never rewritten; a retired one cannot be republished without a manual change in the database. The live site reads whichever snapshot is published.

Check after loading: the database returns at most 1,000 rows per request, so count with paging, and compare each row's tags to `records.json`.

## 4. Before merging

```
cd web
npm run lint && npm run typecheck && npm test
```

CI runs the same three. Merging to `main` always needs a clear yes first (see `CLAUDE.md`).
