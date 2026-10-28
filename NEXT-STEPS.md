# Where we are and what is left

Written 2026-10-28 by Mara (with Claude Code) · branch `feature/backfill` · for Jon and Mara

Checked against the code on this branch at the time of writing. Items marked **not checked** were not verified.

## Done

| Piece | Where | Notes |
| --- | --- | --- |
| Combined snapshot, 1,526 records, still `staging` | `data/snapshots/2026-10-27/` | 405 of Mara's records are `mara_backfill_unverified` (team decision, see "Open" below) |
| Seed list, invalidator rules, source verdicts | `data/seeds/` | |
| API adapters (12 jurisdictions) | `ingest/apis.py` | Keyed adapters skip without a key |
| Crawler, `fetch` / `verify` / `merge` for held sources | `scripts/` | |
| Filter, Ranker, Reviewer, loop, tiers, Output labels | `agents/` | Output is in `pipeline.present`: "Checked <date>", "not fully checked", "N expired removed" |
| Golden set, 30 requests (12 normal, 6 expired, 6 zero-match, 6 adversarial) | `agents/golden.json` | Matches the PRD mix |
| Eval harness, three modes | `agents/eval.py` | |
| **Extractor** (new) | `agents/extractor.py`, `agents/test_extractor.py` | Sits between `verify_sources.py fetch` and `verify`; 14 tests |
| Supabase schema and loader | `supabase/`, `scripts/load_supabase.py` | The agents do not use it yet |
| Backfill status page and the two team artifact pages | `STATUS.md`, `artifacts/` | |

## The Extractor, in one paragraph

It reads only the pages the crawler marked "readable" in `triage.json`, so robots, terms, bot-challenge and paid-source checks have already passed. The model proposes records; the code sets `source` and `source_url`; aggregator list cards never supply a deadline; closed cycles, pay-to-publish, youth-only and audience-only listings are left out. Everything it writes goes through `verify_sources.py verify`, which strips any quote that is not on the page.

```
python3 scripts/verify_sources.py fetch --category residency grant --out data/research/<run>
python -m agents.extractor --pages data/research/<run> --out candidates.json --max-pages 3
python3 scripts/verify_sources.py verify candidates.json --pages data/research/<run>
python3 scripts/verify_sources.py merge data/research/<run>/verified.json
```

Not yet run against a real model. Needs `pip install anthropic` and an API key.

## Left to do

### Must for the demo

- [ ] **Live Extractor run on a small sample** (3 pages, then 20). Compare its records with the hand-made ones for the same pages. This is the evidence that the third AI role works.
- [ ] **Run the required eval comparison:** `python -m agents.eval` in `ranker_only` and `ranker_reviewer` modes. Needs the API key. No results are committed. Record the numbers for the demo.
- [ ] **Artist-facing page.** Nothing exists for artists yet; the request path is a command line. Plan: one page (borough and type pickers, button, top 5 with source, check date, tier label, "N removed") plus a Python function that calls `agents.pipeline`, hosted on Vercel.
  - `pipeline` appends to `traces/` on every request; Vercel's disk is read-only, so send traces to the logs or `/tmp`.
  - A request can make up to 6 model calls. Check Vercel's function time limit for our plan first.
  - Add a `requirements.txt` with `anthropic`; the key goes in as an environment variable.
  - Fallback: a static page built from pre-run results.
- [ ] **Publish the snapshot.** 1,526 records are in `staging`. The PRD says one atomic publish step; nobody has run it yet.
- [ ] **Slides and demo run-through** updated to the final numbers.

### Decide

- [ ] **JSON or Supabase for the app?** `agents/filter.py` reads the JSON snapshot. The Supabase loader exists but nothing reads from it. Pick one for the demo.
- [ ] **How the 405 unverified records show up.** The PRD says no path may return something that looks verified when it was not. **Not checked:** whether `mara_backfill_unverified` records can reach Tier 0 or show a "Checked <date>" label. If they can, the labels need fixing before the demo.
- [ ] **One Extractor path or two.** `backfill/extracted.json` and `backfill/extracted.py` (Mara's hand-extraction check) and `agents/extractor.py` (this one, feeding `verify_sources.py`) overlap. Keep one as the documented path.
- [ ] **Remaining PRD open items:** whether the demo accepts the snapshot or needs a live check, and whether the DCLA 2021 source stays.

### Small fixes

- [ ] `agents/test_agents.py` `test_every_golden_key_exists` fails on Windows: it reads `golden.json` without `encoding="utf-8"`.
- [ ] Update `multi-agent-prd-lean.md`: the Extractor now exists in code, the snapshot is 1,526 records, Supabase is in the repo, and the 405 unverified records are a stated exception.
- [ ] Put `STATUS.md` and this file in step. `STATUS.md` still says 526 records and "the Extractor is not the Claude API yet".

### Git

- [ ] PRs from `feature/backfill` into `developer`, then `developer` into `main`.
- [ ] Nothing goes to `main` without an explicit ask-confirm first (see `CLAUDE.md`).
- [ ] `feature/seed-sources` is now behind `feature/backfill` (it has no commits that `feature/backfill` lacks) and can be retired after the PR.

## Who

| Area | Suggested owner |
| --- | --- |
| Extractor live run and sample comparison | Jon (the PRD names him owner of the Extractor); Mara wrote the first version |
| Eval run and numbers | Jon |
| Artist-facing page on Vercel | Mara |
| Snapshot publish, JSON versus Supabase | Jon |
| PRD, STATUS and slides | Mara |
