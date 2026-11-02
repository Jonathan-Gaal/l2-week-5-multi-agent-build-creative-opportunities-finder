# Artist Atlas demo handoff

Node 24+ is required. From `web/`, run `npm ci`, then `npm run demo` (`npm.cmd` in Windows PowerShell).
Open http://localhost:3010/login. Login and signup are prefilled with fictional demo details; submitting those exact values enters the demo rather than creating a Firebase email account.

Click **Demo mode three times** to open the replay list, or use **Replay a demo** beside it on the first find step. Selecting a run closes the menu and plays the cursor through the three real find pages to results. The results sidebar offers **More demos**, excluding the current search.

- Alex: Actor, Auditions, Manhattan.
- Sam: Visual artist + Writer, Submissions/Open calls, NYC + Long Island + NJ + Upstate NY + Westchester/Hudson + CT.
- Jordan: Poet, Submissions/Open calls + Residencies, Staten Island. Only one citywide residency matches; no local poetry submission is invented.

All three were recorded on snapshot `2026-11-01b`, pinned to November 1, 2026, with Codex independently answering the Ranker and Reviewer prompts. The real Next.js results route recorded the runs. Browser automation was unavailable, so the animated cursor itself has not been visually verified. Warm local results requests took under one second each, without new queue requests. There is no artificial results-page delay. Rendering/network delays are not a guaranteed four-second bound.

Saved answers: `runs/claude-code-live-answers/`. Saved searches: `runs/claude-code-live-runs/`. Keep these files and the snapshot, prompts, rubric and pinned date unchanged for replay. A changed prompt requires a new answer in `web/.claude-code-queue/`.

Replays also work on the deployed site, read-only and keyless. The three runs and their saved answers are bundled in `web/src/data/demo-replays/replays.json` (refresh it with `node scripts/bundle-demo-replays.ts` from `web/` after re-recording). A results request from the replay flow (`replay=1`) for exactly one of the three searches is answered only from that bundle (no model call, no file or trace writes), on snapshot `2026-11-01b` as of November 1, 2026, and labeled as a saved replay with answers recorded from Codex. If the published snapshot differs or any prompt has no saved answer, the search is served the normal way. Production still never enables the model bridge. The deployed results-map fix is separate: coordinates for `2026-11-01b` are bundled in `web/src/data/map-points/`, and the geocoder writes a matching deployable copy. The deployed database must serve that snapshot for those pins to be used.

For Codex Cloud, select this GitHub repository and the branch containing these changes. Use Node 24+, install dependencies in `web/`, and run `npm run demo`. No API key is required for these three saved searches. Local ignored environment files do not accompany the GitHub checkout. Before deploying, apply `supabase/also_subtypes.sql` (the app now selects that column), then load and publish `2026-11-01b`.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Build downloads Google Fonts; browser maps load CARTO basemap resources. Existing lint warnings are predominantly bundled MapLibre code. Do not push or merge to main without the repository's explicit confirmation step.
