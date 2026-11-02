/**
 * The places on the map step, and how picking them works. A pick is a list of place ids: boroughs, regions outside NYC,
 * or "nyc" (every NYC listing, including ones with no borough). Pure functions, so server and client components can both use them.
 */

export const NYC_IDS = ["bronx", "manhattan", "queens", "brooklyn", "staten_island"];
export const TRI_IDS = ["long_island", "new_jersey", "upstate_ny", "westchester_hudson", "connecticut"];
/** Delaware is left out because the data has no listings there. */
export const WIDE_IDS = ["pennsylvania", "massachusetts", "rhode_island", "vermont", "new_hampshire", "maine", "maryland", "dc"];

export type PlaceGroup = "nyc" | "tri" | "wide";
export const GROUP_IDS: Record<PlaceGroup, string[]> = { nyc: NYC_IDS, tri: TRI_IDS, wide: WIDE_IDS };

const unique = (list: string[]) => [...new Set(list)];

/** Older links carry the shortcuts "tristate" and "wider". Spell them out so every place they cover shows as picked. */
export function spellOut(p: string[]): string[] {
  return unique(p.flatMap((id) => (id === "tristate" ? ["nyc", ...TRI_IDS] : id === "wider" ? WIDE_IDS : [id])));
}

/** A borough counts as picked when it is picked itself or all of NYC is. */
export const placeOn = (p: string[], id: string) => p.includes(id) || (NYC_IDS.includes(id) && p.includes("nyc"));

/** Tap one place. Dropping a borough while all of NYC is picked keeps the other four. */
export function togglePlace(p: string[], id: string): string[] {
  if (NYC_IDS.includes(id) && p.includes("nyc")) return unique([...p.filter((x) => x !== "nyc"), ...NYC_IDS.filter((x) => x !== id)]);
  return p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
}

/** "true" when the whole group is picked, "mixed" when some of it is. */
export function groupState(p: string[], group: PlaceGroup): "true" | "mixed" | "false" {
  const n = GROUP_IDS[group].filter((id) => placeOn(p, id)).length;
  return n === GROUP_IDS[group].length ? "true" : n ? "mixed" : "false";
}

/** Switch a whole group on, or off when it is already all on. Picking NYC as a whole also brings listings with no borough. */
export function toggleGroup(p: string[], group: PlaceGroup): string[] {
  const ids = GROUP_IDS[group];
  if (groupState(p, group) === "true") return p.filter((x) => !ids.includes(x) && !(group === "nyc" && x === "nyc"));
  if (group === "nyc") return unique([...p.filter((x) => !ids.includes(x)), "nyc"]);
  return unique([...p, ...ids]);
}
