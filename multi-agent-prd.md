# Multi-Agent Opportunity Discovery: PRD and Harness

Owners: Jon and Mara · As of 2026-10-21

## 1. Problem and opportunity

Artists in NYC lose opportunities because open calls, residencies, grants, venues, and community listings are scattered across many sites and none of them match a creator's medium or goals. A single aggregated, ranked feed would let an artist find relevant openings in minutes instead of days.

- **Who has the problem:** practicing artists across disciplines, especially early-career artists without an agent or a regular information network.
- **What it costs them:** missed deadlines, applications sent to poor-fit programs, and time spent re-checking stale listings.
- **Why now:** the course requires a multi-agent system, and a discovery pipeline with a real retrieval-and-ranking loop is a natural fit for the problem.

This is a bootcamp project built to production standards within a one-week sprint. Scope is narrower than a commercial product on purpose; see section 2.

## 2. Goals, non-goals, and v1 scope

V1 proves that a multi-agent system with a bounded review loop, typed handoffs, and a tiered fallback can return ranked NYC opportunities that a user can trust and verify.

**Goals**

1. A user filtering by borough and creative type gets a ranked list in under 10 seconds for a cached query.
2. Every result carries its source, its last-verified date, and a confidence label.
3. Every failure path (source down, stale data, loop exhausted, schema failure) produces a labeled degraded result, never a silent one.
4. The system is evaluated against a fixed golden set, and the eval results are reproducible.

**Non-goals for v1**

- Non-NYC opportunities.
- Live web search on every user request. Demo results come from a stored snapshot.
- User accounts beyond a session, and any payments or applications submitted on the user's behalf.
- Production auth, multi-region hosting, or uptime guarantees.

**V2 candidates, not committed:** live refresh on a schedule, user feedback that tunes ranking, and additional cities.

## 3. Users and needs

| User | Need | How the system answers it |
| --- | --- | --- |
| Early-career visual artist | Find open calls and residencies that fit a medium and budget | Ranked list filtered by borough, type, and deadline |
| Multidisciplinary creator | Discover venues and community programs, not just grants | Opportunity types kept separate, each with its own ranking |
| Any user, evaluating trust | Know whether a listing is current | Source, last-verified date, and confidence label on every result |

Secondary user: the course instructor, who evaluates the system against the golden set and the handoff and fallback behavior.

## 4. Solution overview

The system has two paths that share one store. A weekly **backfill crew** collects and normalizes opportunities into Supabase. A **request path** answers each user query by routing it to a ranker and reviewer loop over stored records.

1. **Router.** Classifies each request by borough and opportunity type, then dispatches it to the request crew. This is the router pattern chosen for the project.
2. **Request crew (loop).** A ranker scores stored opportunities for fit. A reviewer checks the ranking, and on failure sends structured feedback back to the ranker. The loop is capped; see section 8.
3. **Backfill crew (weekly).** Scout agents fetch from the data sources in section 10, a normalizer validates each record against a schema, and a verifier flags stale or low-confidence records.
4. **Fallback tiers.** When a step cannot produce an accepted result, the system falls back in a defined order and labels the output with the tier it came from; see section 9.

The design goal is that every answer is either a verified result or an honestly labeled degraded one.

## 5. System architecture and flow

```
REQUEST PATH (per query)
User request (borough + type)
  -> Router (dispatches crew)
  -> Ranker (scores fit) <-----------+
  -> Reviewer (checks ranking)       |
       | reject: critique back,      |
       | max 2 retries --------------+
       | accept -> Accepted result (verified, labeled)
       | loop exhausted or no record -> Degraded result (labeled fallback)

WEEKLY BACKFILL CREW
Scout agents (fetch sources)
  -> Normalizer (validate schema)
  -> Verifier (flag stale data)
  -> Supabase store (read per request by the Ranker)

FALLBACK TIERS, applied in order
Tier 0: verified (live and checked)
Tier 1: stale (past freshness)
Tier 2: snapshot (unverified, labeled)
Tier 3: no result (reason stated)
```

## 6. Agent roster and contracts

Each agent has one job, a fixed tool allowlist, and a write scope. An agent that cannot write outside its scope cannot corrupt the store, which is the main limit on blast radius.

| Agent | Job | Tools allowed | Write scope | Blast radius if it misbehaves |
| --- | --- | --- | --- | --- |
| Router | Classify request by borough and type, dispatch | none | none | Wrong crew runs; the user sees a wrong-category result, caught by the reviewer |
| Scout (per source) | Fetch raw records from one source | HTTP to allowlisted hosts | staging table only | Bad raw records in staging; never reaches the ranker |
| Normalizer | Map raw records to the opportunity schema | none | staging table only | Malformed records rejected by schema validation |
| Verifier | Check freshness and confidence, flag records | web search (read-only) | flags on staged records | Over-flagging hides good results; reviewed in eval |
| Ranker | Score stored records for fit to the request | reads store | returns a ranking, writes nothing | Poor ranking caught by the reviewer loop |
| Reviewer | Accept or reject a ranking with a critique | reads store | writes nothing | False accept is the main risk; measured by the eval set |

Every agent prompt is versioned, and every run logs the prompt version it used. The Reviewer and Verifier use separate prompts from the Ranker and Scout, so no agent grades its own output.

## 7. Handoffs and state

Agents never pass free text to each other. Each handoff is a typed payload, validated before the receiving agent runs. A payload that fails validation does not get retried silently; it routes to the fallback tiers in section 9.

1. **Router to request crew.** `{request_id, borough, opportunity_types[], filters, created_at}`
2. **Ranker to Reviewer.** `{request_id, attempt, ranked_ids[], scores[], rationale_per_item[]}`
3. **Reviewer to Ranker (retry).** `{request_id, attempt, verdict: reject|accept, critique[], failed_checks[]}`
4. **Reviewer to output.** `{request_id, verdict: accept, results[], provenance_tier, verified_at[]}`
5. **Scout to Normalizer.** `{source_id, fetched_at, raw_payload_ref, source_url}`
6. **Normalizer to Verifier.** `{record_id, schema_version, fields{}, source_id, fetched_at}`

**State.** The request carries a single `request_id` through every handoff. The loop counter lives in the request state, not in any agent's memory, so a crashed run can resume at the last completed handoff. Backfill runs are keyed by `source_id` and `run_date`, so re-running a backfill replaces that day's staging rows instead of duplicating them.

## 8. Loop contract

The request loop is an evaluator-optimizer cycle: the Ranker proposes, the Reviewer judges, and rejections return with a critique. The loop is bounded, so it cannot run indefinitely.

1. **Cap.** At most 3 ranking attempts per request (1 initial, 2 retries). This is a proposed default; the latency budget in section 12 decides whether it stays at 3.
2. **Accept criteria.** The Reviewer accepts only when all checks pass: every result matches the requested borough and type, every result has a verified source date, and the reviewer's confidence is at or above the threshold set in the eval plan.
3. **Retry input.** The Ranker receives the original candidate set, the previous ranking, and the Reviewer's critique. It does not receive the Reviewer's full reasoning, which keeps the retry focused.
4. **Exit on cap.** After the third failed attempt, the request exits to fallback tier 2 (snapshot, labeled unverified) with the best-scoring attempt and the failed checks attached.
5. **Exit on no candidates.** If the store returns zero candidates after filtering, the request skips the loop and goes to tier 3 with a stated reason.

Every loop iteration is logged with attempt number, checks failed, and token cost, so the loop rate can be measured in the eval.

## 9. Fallback matrix

Every failure is detected, mapped to a tier, and shown to the user. Tiers are applied in order, and the output always names the tier it came from.

| Failure | Detected by | Tier | What the user sees | Recovery |
| --- | --- | --- | --- | --- |
| Source down or timed out | Scout timeout and error code | 1 | Records from the last good run, marked stale with the source's last-fetched date | Scout retries next backfill; no retry during a request |
| Source data older than the freshness window | Verifier date check | 1 | Result shown with a stale badge and its verified date | Flag clears when the next backfill verifies it |
| Reviewer rejects after the loop cap | Loop counter | 2 | Best attempt from the snapshot, marked unverified, with failed checks listed | Logged for the eval; the failure pattern drives prompt changes |
| Schema validation fails on a record | Normalizer | 1 | Record excluded; count of excluded records shown | Raw payload kept for inspection |
| Zero candidates after filtering | Store query | 3 | Empty result with the filter that removed everything | User broadens the filter |
| API budget or rate limit reached | Cost guard | 2 | Snapshot results, marked as served from cache | Budget resets per run window |
| Model API error on the request path | Client error handling | 2 | Snapshot results, marked as served from cache | One retry with backoff, then tier 2 |
| Reviewer itself errors | Client error handling | 2 | Ranking shown unreviewed, marked unverified | Never shown as verified |

**Tier definitions**

- **Tier 0, verified:** fresh record, source checked this run, reviewer accepted.
- **Tier 1, stale or excluded:** record shown with a stale flag, or a count of records removed by validation.
- **Tier 2, snapshot or unreviewed:** stored snapshot or an unreviewed ranking, clearly labeled.
- **Tier 3, no result:** nothing to show, with the reason stated.

Rule: no path returns a result that looks verified when it was not.

## 10. Data sources, provenance, and freshness

Every stored record carries its source, the time it was fetched, and a freshness status. Sources are ranked by yield and currency.

| Source | Type | Currency | Use in v1 | Status |
| --- | --- | --- | --- | --- |
| NYC Parks events | Public API or feed | Updated March 2026 | Primary, parks and community programs | Include |
| Ticketmaster Discovery API | API, live | Live | Venues and performance calls | Include, filtered to NYC |
| DCLA Cultural Organizations | API | June 2021 snapshot | Organizations and community listings | Include, labeled as a 2021 source |
| OpenStreetMap | Map data | Community-maintained | Venue locations and addresses | Include for geography only |
| Seed sites: CaFE, NYFA, ArtConnect, TransArtists | Web pages | Varies per page | Open calls and residencies | Include after terms-of-service review; see section 13 |

**Provenance rules**

- Every record stores `source_id`, `source_url`, `fetched_at`, and `verified_at` when it has been checked.
- Records from a source older than its currency window are flagged stale, not deleted.
- Excluded sources are listed in section 15 with the reason, so the exclusion is a decision and not an accident.

**Snapshot.** Data is fetched once per backfill run and stored in Supabase. The demo runs against that snapshot, so eval results are reproducible across runs.

## 11. Evaluation plan

The system is judged against a fixed golden set, not against impressions from demos. The set is written before the agents are tuned.

**Golden set.** 30 requests, drafted before tuning:

- 12 normal requests across borough and type combinations.
- 6 requests where the correct answer is a stale or excluded record, which must be labeled, not hidden.
- 6 requests with zero matches, where the correct behavior is tier 3 with a reason.
- 6 adversarial requests, including scraped page text that contains instructions. The correct behavior is to ignore the instruction.

**Metrics and proposed targets**

| Metric | What it measures | Proposed target |
| --- | --- | --- |
| Relevance precision at 5 | Share of top 5 results that match the request | At least 0.8 on normal requests |
| Labeling accuracy | Share of results whose tier label is correct | 100%; any mislabel is a failure |
| Loop rate | Share of requests that needed a retry | Reported, no target |
| Fallback rate by tier | Share of requests served at each tier | Reported, with tier 2 under 20% on normal requests |
| False accept rate | Reviewer accepted a ranking that failed a golden check | Under 5% |
| Adversarial pass rate | Injected instructions ignored | 100% |

Targets are proposals to set against a first run, not promises. The first run becomes the baseline.

**Eval card (per agent).** Each agent has its own card with its input and output schema, its golden test cases, and its failure tests. The Reviewer card includes a labeled set of accepted and rejected rankings used to measure its false accept rate.

**Reproducibility.** Every eval run records the snapshot version, prompt versions, and model names, so a result can be rerun later.

## 12. Observability and cost budget

**Trace.** Every request produces one trace with a `request_id`, each agent call with its prompt version and model, each handoff payload, the loop attempt count, the fallback tier served, and token counts. Traces are stored in Supabase next to the results they describe.

**Dashboard.** Four numbers shown per eval run: fallback rate by tier, loop rate, false accept rate, and cost per request.

**Cost and latency budget (proposed).**

- Cost: the full project was estimated at about $0.08 of API spend on the school key. The budget guard stops the request path at a set spend per run window and falls back to tier 2.
- Prompt caching: ranker and reviewer system prompts are cached, so repeated requests pay the cached read rate.
- Session cache: results for repeated filters (for example, open calls in Brooklyn) are cached in memory per user for the session and cleared on logout or after 30 minutes idle.
- Latency: a cached query should return within 10 seconds. An uncached request with one loop iteration is allowed more time, and the target is set after the first baseline run.

The per-request budget and the loop cap are linked. If measured latency exceeds the target, the first lever is the loop cap, not the model.

## 13. Security, blast radius, and scraping posture

**Untrusted input.** Scraped pages and API responses are data. No agent treats text from a source as an instruction. Scraped text is passed inside a delimited data block, and the adversarial golden cases in section 11 test that the agents ignore embedded instructions.

**Blast radius.** Section 6 gives each agent a write scope. Only the Normalizer and Scout write, and only to staging. The store is promoted from staging by a separate step with a schema check, so a bad agent run cannot write directly to the records the ranker reads.

**Scraping rules for the seed sites.**

- Read each site's terms of service and robots.txt before scraping, and record the decision in the source table in section 10.
- Scrape only NYC pages and only the listing pages needed.
- Rate-limit requests and identify the scraper with a user agent string.
- One-time collection for the demo snapshot, not a recurring crawl. A recurring crawl would need its own review.
- Store only the fields needed for the opportunity schema, not full page copies.

**Secrets and keys.** API keys live in environment variables and are never committed or written to traces. The school key and any personal Pro keys are kept separate, and traces record which key was used without storing the key.

**Personal data.** User requests contain borough and type only. No account, email, or location beyond borough is stored in v1.

**Scope of the guarantee.** This is a student project. The posture above is what a production version would need, and what v1 actually enforces is stated in each row.

## 14. Milestones and work split

One-week sprint, Monday to Thursday, 10am to 4pm plus evenings, due at the end of the week.

- [ ] **Mon:** Snapshot pipeline: fetch NYC Parks, DCLA, and OSM once, store in Supabase. Owner: Mara.
- [ ] **Mon:** Golden set drafted (30 requests) before any agent tuning. Owners: both.
- [ ] **Tue:** Router, Ranker, and Reviewer with typed handoffs and the loop cap. Owner: Jon.
- [ ] **Tue:** Seed-site collection after terms-of-service review. Owner: Mara.
- [ ] **Wed:** Fallback tiers wired and each failure in section 9 tested. Owner: Jon.
- [ ] **Wed:** Trace logging and the four-number dashboard. Owner: Jon.
- [ ] **Thu:** Eval run against the golden set, baseline recorded, final demo. Owners: both.

**Work split.** Jon owns the agents, the loop, and the fallback path. Mara owns the data pipeline, the snapshot, and source integration. Both own the golden set and the eval run. Interface between the two is the staging table schema in section 7.

## 15. Open questions and decisions

**Decided**

- Router pattern for dispatch, with a reviewer loop inside the request crew. Chosen in the project notes.
- NYC only in v1.
- Demo runs on a stored snapshot, not live search per request.

**Open**

- [ ] Loop cap: 3 attempts is proposed. Confirm after the first latency measurement.
- [ ] Reviewer confidence threshold and its labeled calibration set. Owner: Jon.
- [ ] Seed-site terms-of-service decision for CaFE, NYFA, ArtConnect, and TransArtists. Owner: Mara.
- [ ] Freshness window per source. Proposed: 12 months for NYC Parks and Ticketmaster, flagged after that.
- [ ] Whether the instructor's rubric requires a live demo or accepts the snapshot demo.
- [ ] Whether the DCLA 2021 source stays in v1 or is cut if verification fails.

**Sources**

- Pursuit Agent PRD template, Google Docs, used for section structure only.
- Project notes on data sources, architecture, and cost, as recorded by Jon in the project.
