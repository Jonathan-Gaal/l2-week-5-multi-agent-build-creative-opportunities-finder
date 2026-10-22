# Multi-Agent Opportunity Discovery: PRD (Lean v1)

Owners: Jon and Mara · As of 2026-10-21

## 1. Problem

Artists in NYC miss opportunities because open calls, residencies, and grants are spread across many sites. A single NYC feed, filtered by borough and type and ranked for fit, would save artists hours of searching.

## 2. Scope

**v1 goal:** given a borough and opportunity type, return a ranked list of NYC opportunities that are not expired, each labeled with its source and check date. Every result is either checked or clearly marked as unchecked.

**In scope**
- One-time backfill of NYC opportunities into a database (the snapshot).
- Filtering, ranking, and review on requests, all against the snapshot.
- A 30-request golden set with written expected results.

**Out of scope for v1**
- Weekly or live refresh. Candidate for v2.
- Live web search on requests or in the Verifier.
- Free-text requests. Input is borough and type only.
- Accounts, payments, or applications on the user's behalf.
- Non-NYC opportunities.

## 3. Architecture

Two LLM roles and everything else is plain code.

| Component | Type | Runs | Job |
| --- | --- | --- | --- |
| Backfill script | Code | Once, for v1 | Fetch sources, validate schema, check deadlines, store records |
| Extractor | LLM | During backfill only | Read listings that fail clean parsing and extract eligibility, fee, and deadline with source quotes |
| Filter | Code | Per request | Select records by borough and type, drop expired ones |
| Ranker | LLM | Per request | Score the filtered records for fit to the request |
| Reviewer | LLM | Per request | Judge whether the ranking fits the request; return accept or reject with a critique |
| Output | Code | Per request | Attach labels and send the result or fallback |

**Request flow:** Request → Filter → Ranker → code checks → Reviewer → (accept: Tier 0 result) or (reject: retry up to 2 times, then Tier 2 result).

**Why the Extractor is LLM-based:** eligibility and fee language in listings is free-form. Clean schema fields can't capture it, so this is the one place a model reads text the code can't parse.

**Why the Extractor is backfill-only:** its output is stored before any request runs, so it adds no latency or loop cost to a user request.

## 4. Data and the snapshot

- **Sources for v1:** NYC Parks events, DCLA organizations, and seed sites for open calls and residencies (CaFE, NYFA, ArtConnect, TransArtists). Seed sites are gated on a terms-of-service review. See section 12.
- **Backfill:** one run for v1. Fetch, validate, extract, check deadlines, store. The demo reads only from the stored snapshot.
- **Provenance:** every record stores `source_url`, `checked_at` (the backfill time), and `fetched_at`.

## 5. Record schema

| Field | Holds | When unknown |
| --- | --- | --- |
| `title` | Name of the opportunity | Required. No title, no record. |
| `opportunity_type` | Open call, residency, grant, or event | `unknown`. Can't match a type filter. |
| `borough` | One of the five boroughs, or `citywide` | `unknown`. Can't match a borough filter. |
| `eligibility` | List of stated requirements, each with a source quote | Empty list, shown as "Eligibility not stated" |
| `fee` | Amount, or `none` | `unknown`, shown as "Fee unknown." Never treated as free. |
| `deadline` | Date, or `rolling` | `null`, shown as "Deadline not listed" |
| `source_url` | Where the listing came from | Required |
| `checked_at` | When the backfill read the listing | Required |

## 6. Definitions

- **Expired:** the deadline is a date earlier than today. Checked at request time, not at backfill time, because a snapshot ages.
- **Checked:** the record has a `source_url`, a `checked_at` date, and a passing schema check.
- **Verified result (Tier 0):** a record that is checked, not expired, matches the request's borough and type, and was accepted by the Reviewer.
- **Confidence label:** shown on every result as the check date, not as a model score. LLM confidence numbers are not used.

## 7. Loop contract

- **Cap:** at most 3 ranking attempts per request (1 initial, 2 retries).
- **Accept:** the Reviewer accepts only if every returned record passes the code checks and fits the request, as judged by the Reviewer.
- **Retry input:** the Ranker receives the candidate records, its previous ranking, and the Reviewer's critique.
- **Hard filters are never relaxed.** Borough, type, and expiry are enforced on every attempt, including the fallback.
- **Exit on cap:** return the best attempt that passes the hard filters, labeled Tier 2 (unreviewed or unverified).

## 8. Fallback tiers

Four tiers became three. Tier 1 (stale) is removed because expired records are excluded rather than shown as stale.

| Tier | Meaning | What the user sees |
| --- | --- | --- |
| 0 | Verified | Results that passed all checks and the Reviewer, with check dates |
| 2 | Unverified | Best attempt that passed hard filters but not the Reviewer, or the Reviewer errored. Labeled "not fully checked." |
| 3 | No result | Empty list with the reason, such as "no records match Brooklyn residency" |

**Excluded records:** expired or failed-schema records are removed from results. The response shows a count, for example "2 expired listings removed." This is the one behavior used everywhere, including the golden set.

**Rule:** no path returns a result that looks verified when it was not.

## 9. Evaluation

**Golden set:** 30 requests, written before tuning. For each request, write the expected answer in advance:

- Records that must appear.
- Records that must not appear, with the reason (wrong borough, expired, wrong type).
- The expected count of removed records.

**Mix:** 12 normal requests, 6 with expired or unknown-deadline records, 6 with zero matches, and 6 adversarial requests where a listing contains an instruction. The correct behavior is to ignore it.

**Metrics:**
- Hard-filter violations: must be 0. Any result with the wrong borough or type fails the request.
- Expired records shown: must be 0.
- Precision at 5 on normal requests: report the number, with a target of 0.8 as a starting point.
- Adversarial instructions followed: must be 0.

**Required comparison:** run every golden request twice, once ranker-only and once ranker plus reviewer. This is the only evidence that the loop is worth having, so it is required for the demo, not a stretch goal.

**Relevance judge:** the team decides the relevance rubric in advance and both scores the results against it.

## 10. Trace and cost

Each request writes one log entry: `request_id`, the filter used, each Ranker and Reviewer attempt with its verdict, the tier served, and token counts. No dashboard for v1.

Cost is a per-run cap on model calls. If the cap is hit, the request returns Tier 2 from the snapshot.

## 11. Schedule

- **Mon:** backfill script running end to end on one source. Golden set drafted with expected results. Seed-site terms-of-service decision made.
- **Tue:** one complete request path working: filter, ranker, reviewer, one displayed result. Extractor run on the collected listings.
- **Wed:** fallback tiers and exclusion counts. Ranker-only comparison set up.
- **Thu:** full golden set run, results recorded, demo. One day of buffer is held for fixes.

**Work split:** Mara owns the backfill script and source collection. Jon owns the Extractor, Ranker, Reviewer, and the loop. Both own the golden set.

## 12. Risks and open decisions

**Decided**
- Two LLM roles plus the backfill Extractor.
- Snapshot, not live search.
- Expired records removed, with a count shown.
- Borough and type are the only request inputs.

**Open**
- [ ] Seed-site terms-of-service decision for CaFE, NYFA, ArtConnect, and TransArtists. If it blocks, the v1 demo uses NYC Parks and DCLA only, and the PRD says so.
- [ ] Whether the demo rubric accepts the snapshot or requires a live check.
- [ ] Whether the DCLA 2021 source stays in v1 or is cut.

**Risks**
- The snapshot may contain few real open calls. The Monday gate checks this before building the rest.
- Eligibility quality depends on the Extractor. Listings it can't parse show "unknown," which the demo must admit.
