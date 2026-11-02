# Artist Atlas demo handoff

Node 24+ is required. From `web/`, run `npm ci`, then `npm run demo` (`npm.cmd` in Windows PowerShell).
Open http://localhost:3010/login. Login and signup are prefilled with fictional demo details; submitting those exact values enters the demo rather than creating a Firebase email account.

Click **Demo mode three times** to open the replay list, or use **Replay a demo** beside it on the first find step. Selecting a run closes the menu and plays the cursor through the three real find pages to results. Each launch has a fresh session and resets the choices before clicking, including when Next.js retained an older find page. The cursor only clicks within the active step. The results sidebar offers **More demos**, excluding the current search.

- Alex: Actor, Auditions, Manhattan.
- Sam: Visual artist + Writer, Submissions/Open calls, NYC + Long Island + NJ + Upstate NY + Westchester/Hudson + CT.
- Jordan: Poet, Submissions/Open calls + Residencies, Staten Island. Only one citywide residency matches; no local poetry submission is invented.

All three were recorded on snapshot `2026-11-01b`, pinned to November 1, 2026, with Codex independently answering the Ranker and Reviewer prompts. The real Next.js results route recorded the runs. Browser automation was unavailable, so the animated cursor itself has not been visually verified. Warm local results requests took under one second each, without new queue requests. There is no artificial results-page delay. Rendering/network delays are not a guaranteed four-second bound.

Saved answers: `runs/claude-code-live-answers/`. Saved searches: `runs/claude-code-live-runs/`. Keep these files and the snapshot, prompts, rubric and pinned date unchanged for replay. A changed prompt requires a new answer in `web/.claude-code-queue/`.

Replays also play on the deployed site: the three runs are bundled in `web/src/data/demo-runs.json` and their recorded results in `web/src/data/demo-results.json`, so a replay (`replay=1`) shows those results with no model, database or local files, labeled as a saved replay with answers recorded from Codex. Production still never enables the model bridge. Map coordinates for the deployable snapshots are bundled in `web/src/data/map-points/`.

For Codex Cloud, select this GitHub repository and the branch containing these changes. Use Node 24+, install dependencies in `web/`, and run `npm run demo`. No API key is required for these three saved searches. Local ignored environment files do not accompany the GitHub checkout. Before deploying, apply `supabase/also_subtypes.sql` to the database: the app selects that column (a listing's extra kinds). A snapshot loaded before the column existed has no extra kinds; load a new snapshot id to carry them.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Build downloads Google Fonts; browser maps load CARTO basemap resources. Existing lint warnings are predominantly bundled MapLibre code. Do not push or merge to main without the repository's explicit confirmation step.
