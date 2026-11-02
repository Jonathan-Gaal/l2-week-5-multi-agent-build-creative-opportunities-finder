import { spellOut } from "./places.ts";

/** The three local presentation searches. Keep the date and snapshot fixed after recording. */
export const DEMO_PRESETS = [
  { name: "Alex · Manhattan auditions", d: ["theater"], s: ["auditions"], p: ["manhattan"] },
  { name: "Sam · Art & writing across the tri-state", d: ["visual", "writing"], s: ["open_calls"], p: ["nyc", "long_island", "new_jersey", "upstate_ny", "westchester_hudson", "connecticut"] },
  { name: "Jordan · Poetry on Staten Island", d: ["poet"], s: ["open_calls", "residencies"], p: ["staten_island"] },
] as const;

/** Ignore order, duplicates and results-page controls when identifying the current search. */
export function demoKey(url: string): string {
  const q = new URL(url, "http://demo").searchParams;
  return ["d", "s", "p"].map((key) => {
    const values = (q.get(key) ?? "").split(",").filter(Boolean);
    return [...new Set(key === "p" ? spellOut(values) : values)].sort().join(",");
  }).join("|");
}

export function demoPreset(url: string) {
  return DEMO_PRESETS.find((p) => demoKey(`/results?${new URLSearchParams({ d: p.d.join(","), s: p.s.join(","), p: p.p.join(",") })}`) === demoKey(url));
}

/** A new session forces cached find pages to remount, even when replaying the same search twice. */
export function replaySession(href: string, id: string): string {
  const url = new URL(href, "http://demo");
  url.searchParams.set("rid", id);
  return `${url.pathname}?${url.searchParams}`;
}

/** Completed steps come from this replay's target; the step being animated always starts empty. */
export function replayStart(step: "discipline" | "type" | "place", target: { d: string[]; s: string[] }) {
  return { d: step === "discipline" ? [] : [...target.d], s: step === "place" ? [...target.s] : [], p: [] as string[] };
}
