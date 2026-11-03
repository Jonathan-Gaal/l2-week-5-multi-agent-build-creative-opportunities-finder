# Brief: Creative Opportunity Finder backend API

Written by the Orchestrator (main session) on 2026-10-28 from Jon's request. Intake input for teletraan-1 and red-alert.

> Historical brief. The separate HTTP server has since been folded into the Next.js app: `backend/src/` moved to
> `web/server/` and `backend/test/` to `web/test/`, pages call the API in process through `web/src/lib/backend.ts`,
> and settings live in `web/.env.example`. Paths below are as they were when this was written.

## Request (Jon's words)

> "I want to build a backend in node.js -- Mara will build the frontend in react.js typescript -- typescript for the backend too -- I want postgres for the backend"
> "lets move on -- i want the backend built -- i want my agentic pipeline to build them"
> "build it out"

## What exists already (committed on `feature/backfill`)

- `backend/` — Node 24 + TypeScript package, run with native type stripping (no build step). Tests with `node:test` (41 passing). Runtime deps: `@anthropic-ai/sdk`, `pg`.
- `backend/src/agents/` — the request path ported from Python (`agents/*.py`), output-identical on the golden set and a 300-request sweep: `filter.ts`, `model.ts` (Claude client, `CLAUDE_MODEL` override, default `claude-opus-5-5`), `roles.ts` (Ranker, Reviewer, BaselineRanker), `pipeline.ts` (`run(req, records, ranker, reviewer, tracePath)` → tier 0/2/3 result), `eval.ts`.
- `backend/src/db/` — `pool.ts` (one `pg.Pool` from `DATABASE_URL`), `opportunities.ts` (`loadRecords(db, req, snapshotId?)`, pinned to the published snapshot; throws `NoPublishedSnapshotError`). Verified against live Supabase: 0 differences over 300 requests.
- Database: Supabase project `ofjwdioysmzfeiqlfrkl`, Postgres 17, schema in `supabase/schema.sql` (`snapshots`, `opportunities`, RLS read-only for public roles). Snapshot `2026-10-27` (1,526 records) is loaded but still `staging`; nothing is published yet.
- Product scope and rules: `multi-agent-prd-lean.md` (lean PRD v1). It defines the request (place + type only), the loop contract, tiers, labels, and trace; it does not define an HTTP API.

## What is being asked for

An HTTP API in `backend/` that Mara's React + TypeScript frontend calls to serve a request: place (NYC borough or tri-state region) and opportunity type in, the pipeline result out (tier, ranked results with labels, removed-listings note, request id). Shared TypeScript types so the frontend gets the response shape.

## Facts that bear on security and cost

- No accounts, payments, or applications (lean PRD §2). Data is public listings copied from third-party sites; listing text is untrusted (prompt-injection defenses already in `roles.ts`).
- Each request can make up to 6 Claude calls (3 Ranker + 3 Reviewer attempts) on Opus 5.5 with ~80 candidate listings each — real money per request on a public endpoint.
- The backend connects to Postgres as a role that bypasses RLS; reads are pinned to the published snapshot in code.
- Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY` from the environment only. `SUPABASE_SECRET_KEY` is used only by the Python loader, never by the backend.
- The DB connection is currently not SSL (Supabase does not enforce it; certificate not yet downloaded).
- Deployment target and audience are not decided (class demo vs. public).

## Decisions not yet made (product calls)

- Hosting (long-running server vs. serverless) and whether it is deployed publicly or demo-only.
- Cost and abuse controls for the LLM path (rate limit, per-request cap, caching, ranker-reviewer vs. ranker-only by default).
- Request latency budget: up to 6 sequential model calls can take a minute or more.
- CORS origin for Mara's frontend.
- Whether to publish snapshot `2026-10-27` (the API serves only a published snapshot).
