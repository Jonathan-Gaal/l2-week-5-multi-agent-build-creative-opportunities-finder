# Artist Atlas (web)

One Next.js app: the pages and the results API that ranks opportunities. There is no second server. Pages and
route handlers call the API in process through `src/lib/backend.ts`; the browser never calls it directly.

```
src/      Next.js app (pages, components, src/lib/backend.ts = the only way into server/)
server/   results API (api/), agent pipeline (agents/), Postgres and JSON record sources (db/), checks/
test/     integration and paid end-to-end tests for server/
```

Node 24 or later. `server/` runs under Next.js and also directly under Node (type stripping, no build step) for the
tests and the CLI scripts.

## Run it

```bash
npm install
npm run dev:local   # snapshot JSON file + code ranker: no database, no Claude key, no model calls
```

For the real data and the Claude ranker, copy `.env.example` to `.env`, fill in `DATABASE_URL` (and
`ANTHROPIC_API_KEY`), then `npm run dev`. Every setting is documented in `.env.example`.

Neither is required. Without a Claude key, searches use the deterministic code ranker (Tier 2, no model calls); put
a key back and Claude ranks again. When a call finds the key unusable (revoked, billing, credit or usage limit), the
server stops calling Claude for `MODEL_COOLDOWN_MS` (10 minutes), serving the code ranker meanwhile, then tries again.
`RANKER_MODE=baseline` turns Claude off even with a key. Without `DATABASE_URL` (and no `DATA_SOURCE`), the server
reads the newest snapshot file under `data/snapshots` instead.

## Check it

```bash
npm test             # unit tests with fakes (server/**/*.test.ts)
npm run typecheck    # Next route types + the app + a stricter Node-only check of server/ and test/
npm run lint
npm run build
npm run test:integration    # real Postgres, read-only; needs DATABASE_URL
npm run test:e2e:claude     # one search on real Postgres with the code ranker; RUN_PAID_TESTS=1 for real Claude calls
npm run eval -- --modes baseline
```

## Deploy (Vercel)

Set the project's Root Directory to `web/` and add the settings from `.env.example` as Environment Variables
(`DATABASE_URL` with the Supabase transaction pooler, `ANTHROPIC_API_KEY`). Use `DATA_SOURCE=postgres`: the JSON
snapshot lives outside `web/` and is not part of the deployment. Rate limits, the daily model-call budget and the
result cache are kept in memory per serverless instance, so they are looser across a deployment than on one server.
