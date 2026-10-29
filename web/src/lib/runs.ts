import runsJson from "@/data/runs.json";
import type { Labels } from "./taxonomy";
import type { Frame, SavedRun } from "./types";

export const SAVED_RUNS = runsJson as unknown as SavedRun[];

const removedText = (r: SavedRun["filter"]["removed"]) =>
  [r.expired && `${r.expired} expired`, r.failed_schema && `${r.failed_schema} incomplete`, r.duplicate && `${r.duplicate} duplicate`]
    .filter(Boolean)
    .join(", ") || "none removed";

/** A saved run broken into the steps the pipeline took, in order. */
export function framesFor(run: SavedRun, labels: Labels): Frame[] {
  const frames: Frame[] = [
    {
      kind: "request",
      title: "Request",
      lines: [
        `Place: ${labels.place(run.request.place)}`,
        `Looking for: ${labels.type(run.request.type)}`,
        `As of ${run.request.as_of}`,
        run.playedBy,
      ],
    },
    {
      kind: "filter",
      title: "Filter (code)",
      lines: [
        `${run.filter.matched} listings match the place and type and are still open`,
        `Removed: ${removedText(run.filter.removed)}`,
        run.filter.matched ? `The best ${run.filter.sentToRanker} by the code score go to the Ranker` : "Nothing to rank",
      ],
    },
  ];
  if (run.candidates.length) {
    frames.push({ kind: "candidates", title: `Candidates the Ranker sees (${run.candidates.length})`, items: run.candidates });
  }
  for (const a of run.attempts) {
    if (a.ranking) {
      frames.push({
        kind: "ranker",
        title: `Ranker, attempt ${a.n}`,
        items: a.ranking,
        forced: a.forced,
        note: a.forced ? "Scripted for the test: this ranking was made to obey the injected text, to see if the Reviewer catches it." : undefined,
      });
    }
    frames.push({ kind: "checks", title: `Code checks, attempt ${a.n}`, problems: a.check_problems });
    if (a.verdict) {
      frames.push({ kind: "reviewer", title: `Reviewer, attempt ${a.n}`, verdict: a.verdict, critique: a.critique ?? "" });
    }
  }
  frames.push({
    kind: "result",
    title: run.tier === 3 ? "Result: no match" : `Result: Tier ${run.tier}`,
    tier: run.tier,
    lines: run.tier === 3
      ? [run.reason ?? "No listings match."]
      : [
          ...run.results.map((r) => `${r.title} · ${r.label}`),
          ...(run.downgraded ? [`Capped below Tier 0: ${run.downgraded}`] : []),
        ],
  });
  return frames;
}
