/**
 * The three saved demo searches, bundled into the server (src/data/demo-replays/replays.json, written by
 * scripts/bundle-demo-replays.ts) so the deployed site can replay them with no key and no model call. Their Ranker and
 * Reviewer answers were recorded from Codex on snapshot 2026-11-01b, with the date pinned to November 1, 2026; a replay
 * runs the real pipeline on that snapshot and date, answered only from these saved answers (server/agents/replay-model.ts).
 */
import type { SearchResponse } from "@api/types";
import bundle from "../data/demo-replays/replays.json" with { type: "json" };
import { demoKey } from "./demoPresets.ts";

export type SavedRun = {
  name: string;
  url: string;
  savedAt: string;
  artists: string[];
  wants: string[];
  places: string[];
  top: { n: number; title: string }[];
};

/** The snapshot and the day the answers were recorded on; a replay is served only for that snapshot. */
export const REPLAY_SNAPSHOT: string = bundle.snapshot;
export const REPLAY_DAY: string = bundle.asOf;
export const BUNDLED_RUNS: readonly SavedRun[] = bundle.runs;
export const REPLAY_ANSWERS: Readonly<Record<string, unknown>> = bundle.answers;

/** A search's identity: the demo key (artists, wants, places; order and paging ignored) plus the broad types. */
const searchKey = (url: string): string => {
  const types = (new URL(url, "http://demo").searchParams.get("t") ?? "").split(",").filter(Boolean);
  return `${demoKey(url)}|${[...new Set(types)].sort().join(",")}`;
};

/**
 * The saved run a results request replays, or null. Only a request the demo's replay flow made (replay=1) for
 * exactly one of the bundled searches qualifies; every other search is served the normal way.
 */
export function savedReplayFor(params: URLSearchParams): SavedRun | null {
  if (params.get("replay") !== "1") return null;
  const key = searchKey(`/results?${params}`);
  return BUNDLED_RUNS.find((r) => searchKey(r.url) === key) ?? null;
}

/**
 * Whether a replay's response really is the saved run: served from the recorded snapshot, and every group either
 * accepted by the saved Reviewer answer (Tier 0, as all three were recorded) or empty (Tier 3, no model call). Anything
 * else means the run was degraded (budget, busy, deadline) and fell back to the code ranking, so it is not shown as a replay.
 */
export const replayHolds = (res: SearchResponse): boolean =>
  res.snapshot_id === REPLAY_SNAPSHOT && res.groups.some((g) => g.tier === 0) && res.groups.every((g) => g.tier === 0 || g.tier === 3);
