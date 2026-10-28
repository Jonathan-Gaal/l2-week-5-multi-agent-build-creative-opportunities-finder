/**
 * The closed lists a request is built from, and their display labels: the one source of truth for the API's
 * validation, the Filter, and the frontend's pickers (served by GET /api/meta).
 *
 * Place groups are picker shortcuts: the API expands them to their member places before filtering.
 * Disciplines map onto the snapshot's `disciplines` tags; a record tagged "all" is open to any artist.
 */

export const BOROUGHS = ["manhattan", "brooklyn", "queens", "bronx", "staten_island"] as const;
export const REGIONS = ["nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut",
  "pennsylvania", "massachusetts", "rhode_island", "vermont", "new_hampshire", "maine", "delaware", "maryland",
  "dc"] as const;
export const TYPES = ["event", "open_call", "grant", "residency", "job"] as const;

export type BoroughId = (typeof BOROUGHS)[number];
export type RegionId = (typeof REGIONS)[number];
export type PlaceId = BoroughId | RegionId;
export type TypeId = (typeof TYPES)[number];

/** Tag a record carries when it is open to artists of any discipline. */
export const ALL_DISCIPLINES_TAG = "all";

export const DISCIPLINES = [
  { id: "music", label: "Music", tags: ["music", "sound"] },
  { id: "comedy", label: "Comedy", tags: ["comedy"] },
  { id: "dance", label: "Dance", tags: ["dance"] },
  { id: "theater", label: "Theater & performance", tags: ["theater", "performance", "performing_arts"] },
  { id: "writing", label: "Writing & poetry", tags: ["literary", "writing"] },
  { id: "visual", label: "Visual art", tags: ["visual", "sculpture", "lens-based", "curatorial", "textiles"] },
  { id: "film", label: "Film & media", tags: ["film", "media", "digital", "transmission", "technology"] },
  { id: "craft", label: "Craft & design", tags: ["craft", "design", "architecture"] },
] as const;
export type DisciplineId = (typeof DISCIPLINES)[number]["id"];

/** Picker order (not the order of TYPES, which the Python port and the golden eval use). */
export const TYPE_INFO: readonly { id: TypeId; label: string; hint: string }[] = [
  { id: "open_call", label: "Open calls & auditions", hint: "Submit work or show up and be considered" },
  { id: "grant", label: "Grants & fellowships", hint: "Money or support for your practice" },
  { id: "residency", label: "Residencies", hint: "Time, space or studio access" },
  { id: "event", label: "Events & open mics", hint: "Jams, open mics, workshops, classes" },
  { id: "job", label: "Jobs", hint: "Salaried and hourly creative roles" },
];

const TRISTATE: readonly RegionId[] = ["nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut"];
const WIDER: readonly RegionId[] = ["pennsylvania", "massachusetts", "rhode_island", "vermont", "new_hampshire", "maine",
  "delaware", "maryland", "dc"];

export const PLACE_GROUPS = [
  { id: "nyc", label: "Anywhere in NYC", hint: "All five boroughs and citywide listings", members: ["nyc"] },
  { id: "tristate", label: "Tri-state",
    hint: "NYC, Long Island, Westchester & Hudson Valley, upstate NY, New Jersey, Connecticut", members: TRISTATE },
  { id: "wider", label: "Wider Northeast & DC", hint: "PA, MA, RI, VT, NH, ME, DE, MD, DC", members: WIDER },
] as const satisfies readonly { id: string; label: string; hint: string; members: readonly RegionId[] }[];
export type PlaceGroupId = (typeof PLACE_GROUPS)[number]["id"];

export const PLACE_LABELS: Record<PlaceId, string> = {
  manhattan: "Manhattan", brooklyn: "Brooklyn", queens: "Queens", bronx: "The Bronx", staten_island: "Staten Island",
  nyc: "Anywhere in NYC", long_island: "Long Island", westchester_hudson: "Westchester & Hudson Valley",
  upstate_ny: "Upstate NY", new_jersey: "New Jersey", connecticut: "Connecticut", pennsylvania: "Pennsylvania",
  massachusetts: "Massachusetts", rhode_island: "Rhode Island", vermont: "Vermont", new_hampshire: "New Hampshire",
  maine: "Maine", delaware: "Delaware", maryland: "Maryland", dc: "Washington, DC",
};

/** Labels for the place keys a result can carry besides boroughs and regions. */
export const OTHER_PLACE_LABELS = { citywide: "Citywide", unknown: "NYC (borough not stated)" } as const;

const DISCIPLINE_TAGS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  DISCIPLINES.map((d) => [d.id, new Set<string>(d.tags)]),
);
const DISCIPLINE_LABELS: ReadonlyMap<string, string> = new Map(DISCIPLINES.map((d) => [d.id, d.label]));

export const isDiscipline = (id: string): id is DisciplineId => DISCIPLINE_TAGS.has(id);
export const disciplineLabel = (id: string): string => DISCIPLINE_LABELS.get(id) ?? id;

/** Snapshot tags that satisfy any of these disciplines, plus "all". Empty when no discipline is given. */
export const disciplineTags = (ids: readonly string[]): string[] => {
  if (!ids.length) return [];
  const tags = new Set<string>([ALL_DISCIPLINES_TAG]);
  for (const id of ids) for (const t of DISCIPLINE_TAGS.get(id) ?? []) tags.add(t);
  return [...tags];
};

/**
 * Does a record with these tags fit any of the disciplines? No disciplines means no filter. A record with no
 * tags does NOT fit a non-empty filter: an untagged listing's fit is unknown, and the hard filters never guess
 * in a listing's favor (the same rule as an unknown borough never matching a borough).
 */
export const fitsDisciplines = (recordTags: unknown, ids: readonly string[]): boolean => {
  if (!ids.length) return true;
  if (!Array.isArray(recordTags) || !recordTags.length) return false;
  return recordTags.some((t) => t === ALL_DISCIPLINES_TAG || ids.some((id) => DISCIPLINE_TAGS.get(id)?.has(t)));
};

const GROUP_MEMBERS: ReadonlyMap<string, readonly string[]> = new Map(PLACE_GROUPS.map((g) => [g.id, g.members]));
const ALL_PLACES: readonly PlaceId[] = [...BOROUGHS, ...REGIONS];

/** Picker place choices (places or group ids) -> the places they cover, each once, in canonical order (boroughs,
 * then regions, as listed above), so the same selection always gives the same request. Unknown ids are dropped;
 * callers validate first. Boroughs are kept even with "nyc": the union is exact, not inferred from the data. */
export const expandPlaceChoices = (choices: readonly string[]): PlaceId[] => {
  const chosen = new Set<string>();
  for (const c of choices) for (const p of GROUP_MEMBERS.get(c) ?? [c]) chosen.add(p);
  return ALL_PLACES.filter((p) => chosen.has(p));
};

/** Discipline ids, each once, in DISCIPLINES order. Unknown ids are dropped; callers validate first. */
export const canonicalDisciplines = (ids: readonly string[]): DisciplineId[] =>
  DISCIPLINES.map((d) => d.id).filter((id) => ids.includes(id));
