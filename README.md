# Creative Opportunities Finder

A multi-agent tool that helps NYC artists find open calls, grants, gigs and residencies that they can actually apply to. You pick a borough and an opportunity type, and it returns up to five ranked results. Each result says when it was checked, and results that were not fully checked are labeled that way.

## What the system does

1. **Backfill (offline, code plus one LLM role).** Collects listings from public sources into one snapshot (`data/snapshots/<date>/records.json`). The snapshot is the only thing the request path reads.
2. **Request path (per search).** Filter, then Ranker, then code checks, then Reviewer, then output.

## Agents and roles

| Role | Type | What it does |
| --- | --- | --- |
| Filter | Code | Keeps only the listings that match the borough or region, the opportunity type, and optional disciplines. Drops expired and incomplete listings. |
| Ranker | LLM | Picks up to five of the matching listings, best fit first, and gives a short reason for each. |
| Code checks | Code | Runs on every ranking before the Reviewer. Rejects ids that were not offered, duplicates, more than five results, and anything that fails the place, type or expiry filters. |
| Reviewer | LLM | Accepts or rejects the ranking and writes a critique. |
| Extractor | LLM, backfill only | Reads listings that do not parse cleanly and pulls out eligibility, fee and deadline with a quote from the source. |

Listing text comes from third-party websites, so the prompts treat it as untrusted data. If a listing contains instructions, the result drops to "not fully checked" and that listing cannot get a rank boost.

## How handoffs and shared state work

- **Filter to Ranker:** the matching listings, each with a short id (`r1`, `r2`, ...).
- **Ranker to code checks to Reviewer:** `{ranking: [{id, reason}]}`, then the Reviewer returns `{verdict: accept | reject, critique}`.
- **Reject to Ranker:** on a retry, the Ranker gets its previous ranking and the critique (or the failed code checks) and returns a corrected ranking.
- **Shared state:** the snapshot is read-only for every agent. Only the backfill writes to it. Each request appends one line to a trace file.

Each request makes at most three ranking attempts (one plus two retries). The result has a tier:

- **Tier 0 (verified):** an attempt passed the code checks and the Reviewer accepted it.
- **Tier 2 (not fully checked):** the best attempt that passed the code checks but was not accepted, or the Reviewer was not run or failed. Also used when the result contains an unchecked listing.
- **Tier 3 (no result):** nothing matched, with the reason.

## How to run it

Requirements: Node.js and npm. The backfill scripts are Python.

```bash
git clone https://github.com/Jonathan-Gaal/l2-week-5-multi-agent-build-creative-opportunities-finder.git
cd l2-week-5-multi-agent-build-creative-opportunities-finder
git checkout developer
cd web
npm install
npm test                     # unit and red-team tests, no API key needed
npm run build
npx next start -H 127.0.0.1 -p 3100
```

To run without any model calls, set these in `web/.env.local`:

```
DATA_SOURCE=json
SNAPSHOT_ID=2026-10-27
RANKER_MODE=baseline
```

To run the request path with Claude, set `ANTHROPIC_API_KEY` in `web/.env.local` and leave `RANKER_MODE` unset. Keys stay out of git: `web/.env.example` has empty values only.

To run one request from the command line:

```bash
cd web
npm run pipeline -- brooklyn open_call --baseline   # code ranker only
```

Backfill: `python -m backfill.run`.

## Testing

- `npm test` runs the unit tests and the red-team tests in `web/server/agents/red-team.test.ts`.
- `web/server/agents/eval.ts` runs the eval set.
- `web/server/agents/red-team.test.ts` has three groups: must-hold checks, known gaps (the text filter misses most disguised instructions), and fixed findings.

## Explicitly out of scope

- **No actions outside the app.** The agents only read listings. They do not apply, email, post, pay, or contact any organization.
- **No accounts or payments** in this version.
- **No real-model run in the red-team results yet.** The red-team results were produced without model calls.
- **No guarantee of freshness.** A listing is only as current as the snapshot it came from. Results from the snapshot are labeled with the check date.
- **Contact details in listing text are not removed yet.**

