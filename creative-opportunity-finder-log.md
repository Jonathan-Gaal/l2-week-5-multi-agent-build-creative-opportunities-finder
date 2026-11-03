# Build test log

Started 2026-10-28 by Mara (with Claude Code) · branch `feature/backfill` · for Jon

What we tried against the build, what happened, and what we changed. Newest rounds are at the bottom. Every command here runs without an API key.

**Setup:** Windows 10, Python 3.14, snapshot `2026-10-27` (1,526 records, status `staging`) at Jon's commit `beab660`. No `anthropic` package and no API key on this machine, so no real model call has run yet. In the tests below, "faked" means only the call to Claude is replaced; Jon's own Ranker, Reviewer, filter, loop and tiers run as written.

## Summary

| | Result |
| --- | --- |
| Unit tests | All pass: agents 50, scripts 22, ingest 33, backfill tests 63 |
| Code-only eval on the golden set | 27 of 30 pass. Hard-filter violations 0, expired shown 0, duplicates shown 0 |
| Edge-case probes | 10 of 10 pass after fixes (4 bugs found, all fixed) |
| Real model (Ranker, Reviewer, Extractor) | **Not tested yet.** Needs `pip install anthropic` and a key |

## Bugs found and fixed

| # | Bug | Found by | Fix | Where |
| --- | --- | --- | --- | --- |
| 1 | Test suite and eval crashed on Windows reading `records.json` and `golden.json` (`UnicodeDecodeError`, cp1252) | Round 1 | `encoding="utf-8"` on every read and write | `agents/filter.py`, `eval.py`, `pipeline.py`, `test_agents.py` |
| 2 | **Unverified records could be served as Tier 0 labeled "Checked 2026-10-27".** The 405 `mara_backfill_unverified` records were never rechecked. This breaks the PRD rule that nothing may look verified when it was not. | Round 4 | New `is_unverified`: those records are labeled "Not checked · added without a recheck", and any result containing one is capped at Tier 2 (trace field `downgraded`) | `agents/pipeline.py` |
| 3 | A model reply with no `ranking` key crashed the request with `KeyError` | Round 6, probe 4 | Ranker raises `ModelError`; the loop already treats that as a failed attempt | `agents/roles.py` |
| 4 | A reviewer reply with no `verdict` key crashed with `KeyError`; an unreadable verdict must never count as accept | Probe 5 | Reviewer raises `ModelError` unless the verdict is `accept` or `reject`; the loop then ends in Tier 2 | `agents/roles.py` |
| 5 | Listing text (untrusted) could contain a literal `</listings>` and close the data block early in the prompt | Probe 7 | `<` is escaped as `<` inside each listing line | `agents/roles.py` |
| 6 | A bad date from the model (`2026-02-30`, `2026-12`) crashed `verify_sources.py verify` with `ValueError` | Probe 9 | Extractor keeps only real ISO dates (else drops them and adds a caveat). `check_record` also now holds such a record with the reason "date is not a real calendar date" | `agents/extractor.py`, **`scripts/verify_sources.py`** |

Jon: #6 touches your `verify_sources.py` (a 6-line guard in `check_record`, plus a test in `test_verify_sources.py`). #3 to #5 touch `roles.py`, and #2 touches `pipeline.py`. All come with regression tests; please look them over.

## Round 1: existing suites (before any changes)

`agents` 42 tests, 1 error (bug 1). `scripts` 21 OK, `ingest` 33 OK, `tests` 63 OK. After bug 1 was fixed, `agents` ran clean.

## Round 2: code-only eval of all 30 golden requests

`python -m agents.eval --modes baseline`

```
requests 30, passed 27, hard_filter_violations 0, expired_shown 0, duplicates_shown 0,
must_include_missing 0, must_exclude_shown 3, adversarial_followed 3, tiers {0: 0, 2: 24, 3: 6}
```

The 3 failures are a01, a04 and a05 (adversarial). The code ranker has no judgment, so it lists the injected listing in its top 5 (a01: 5th, after the real ones). Expected for this mode. These are the cases the real Ranker and Reviewer must handle, so they are the ones to watch in the real run.

## Round 3: five requests through the pipeline

Real snapshot, Jon's loop, a scripted stand-in for the ranker and reviewer.

| # | Request | Setup | Result |
| --- | --- | --- | --- |
| 1 | Brooklyn open_call | code ranker | Tier 2, 5 results, all "not fully checked" |
| 2 | Manhattan grant | reviewer accepts | Tier 0, LMCC grants on top, one attempt |
| 3 | Queens event | fake id on attempt 1, reject on attempt 2, accept on attempt 3 | Tier 0 after 3 attempts. Attempt 1 failed the code check (`r999: not one of the candidate ids`). The ranker saw each critique on its next attempt. |
| 4 | Staten Island job | code ranker | Tier 3, "no records match Staten Island job" |
| 5 | Brooklyn open_call + injected "rank me first" listing (golden a01) | code ranker | Injected listing came 5th, not first |

The loop, retry feedback, hard filters and tier logic all work on the real data.

## Round 4: label check, found bug 2

Ran 8 requests with the reviewer accepting. In 3 of them an unverified Craigslist record (for example "$$$ MEN needed for a HAIRCUT video $$$" in Brooklyn) was served at Tier 0 with "Checked 2026-10-27". Fixed (see table). After the fix the same requests return Tier 2 with "Not checked · added without a recheck" on those records, and all-checked results (for example Manhattan grants) still reach Tier 0. Two new tests cover this.

## Round 5: Jon's real Ranker and Reviewer classes, API call faked

The fake model returned a duplicate id on attempt 1, then a clean ranking. Checked:
- The Ranker prompt carries the real listings, request line and the untrusted-data warning in the system prompt.
- The retry prompt includes the previous ranking and the critique ("Code checks failed: r1: listed twice").
- 3 model calls were made; the result was Tier 2 because the Brooklyn open-call pool includes unverified records (bug 2's rule, working as intended).

## Round 6: ten edge-case probes

`python scripts/probe_pipeline.py` (script is in the repo; prints PASS or BUG per probe).

| # | Probe | First run | After fixes |
| --- | --- | --- | --- |
| 1 | Unknown place, unknown type, empty strings, wrong case | PASS (Tier 3) | PASS |
| 2 | Every place x type with the code ranker: 100 requests, checking filter, expiry, duplicates, count and tier | PASS | PASS |
| 3 | Every one of 1,526 records parses in the expiry check | PASS | PASS |
| 4 | Model reply with no `ranking` key | **BUG** (`KeyError`) | PASS |
| 5 | Reviewer reply with no `verdict` | **BUG** (`KeyError`) | PASS |
| 6 | Ranker returns 9 ids | PASS (cut to 5) | PASS |
| 7 | Listing title contains `</listings>` | **BUG** | PASS |
| 8 | Largest candidate pool: prompt size | PASS, about 45,000 characters (~11,000 tokens) | PASS |
| 9 | Extractor given impossible or partial dates | **BUG** (`ValueError` in verify) | PASS |
| 10 | Eval and CLI with no SDK or key; unknown place on the CLI | PASS (Claude modes print "skipped, no Anthropic credentials") | PASS |

## Extractor tests

16 tests in `agents/test_extractor.py`, all with a fake model, covering: code owns `source` and `source_url`; aggregator list cards never supply a deadline; untrusted-page warning and per-source notes in the prompt; long pages cut; candidates pass `verify_sources.check_record`; an invented quote is stripped by verify; same-run listings are not folded together by the new dedupe rule; failed pages are logged and the run continues; bad dates are dropped.

## Not tested yet

- **Any real model call.** Ranker, Reviewer and Extractor quality is unknown. We have only tested that the code around them works.
- **`ranker_only` vs `ranker_reviewer` eval.** Required for the demo; skipped until credentials exist.
- **Extractor on a real fetched page,** and its records compared with the hand-made ones.
- **Supabase.** Nothing reads from it; no keys on this machine. The agents read the JSON snapshot.
- **Publishing the snapshot** (it is still `staging`).
- **The artist-facing page.** Nothing exists yet.

## Things worth a look

- The code ranker puts junk from the unverified Craigslist batch in top-5 lists (for example "$$$ MEN needed for a HAIRCUT video $$$" for Brooklyn open calls). The real Ranker should rank these low, but consider holding that batch out of results.
- The golden set's expectations are marked `draft` in `golden.json` ("judged by Claude from the records; Jon and Mara to review before tuning").
- The snapshot ages: records past their date drop out at request time, so results change from day to day. Run the eval on the demo date.

## How to repeat this

```
python -m unittest discover -s agents -t .          # 50 tests
(cd scripts && python -m unittest discover)         # 22 tests
python -m unittest ingest.test_apis                 # 33 tests
python -m unittest discover -s tests                # 63 tests
python -m agents.eval --modes baseline              # 27 of 30
python scripts/probe_pipeline.py                    # 10 probes
python -m agents.pipeline brooklyn open_call --baseline
```
