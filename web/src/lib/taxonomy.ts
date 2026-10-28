/** What the pickers offer, and how each choice maps onto the snapshot's labels. */

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

export const TYPES = [
  { id: "open_call", label: "Open calls & auditions", hint: "Submit work or show up and be considered" },
  { id: "grant", label: "Grants & fellowships", hint: "Money or support for your practice" },
  { id: "residency", label: "Residencies", hint: "Time, space or studio access" },
  { id: "event", label: "Events & open mics", hint: "Jams, open mics, workshops, classes" },
  { id: "job", label: "Jobs", hint: "Salaried and hourly creative roles" },
] as const;

export const BOROUGHS = [
  { id: "manhattan", label: "Manhattan" },
  { id: "brooklyn", label: "Brooklyn" },
  { id: "queens", label: "Queens" },
  { id: "bronx", label: "The Bronx" },
  { id: "staten_island", label: "Staten Island" },
] as const;

/** Region ids that exist in the snapshot. */
export const TRISTATE_REGIONS = ["nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut"];
export const WIDER_REGIONS = [
  "pennsylvania", "massachusetts", "rhode_island", "vermont", "new_hampshire", "maine", "delaware", "maryland", "dc",
];

export const PLACE_GROUPS = [
  { id: "nyc", label: "Anywhere in NYC", hint: "All five boroughs and citywide listings" },
  { id: "tristate", label: "Tri-state", hint: "NYC, Long Island, Westchester & Hudson Valley, upstate NY, New Jersey, Connecticut" },
  { id: "wider", label: "Wider Northeast & DC", hint: "PA, MA, RI, VT, NH, ME, DE, MD, DC" },
] as const;

export const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.id, t.label]));
export const DISCIPLINE_LABEL: Record<string, string> = Object.fromEntries(DISCIPLINES.map((d) => [d.id, d.label]));

const PLACE_LABELS: Record<string, string> = {
  ...Object.fromEntries(BOROUGHS.map((b) => [b.id, b.label])),
  nyc: "Anywhere in NYC",
  tristate: "Tri-state",
  wider: "Wider Northeast & DC",
  citywide: "Citywide",
  long_island: "Long Island",
  westchester_hudson: "Westchester & Hudson Valley",
  upstate_ny: "Upstate NY",
  new_jersey: "New Jersey",
  connecticut: "Connecticut",
  pennsylvania: "Pennsylvania",
  massachusetts: "Massachusetts",
  rhode_island: "Rhode Island",
  vermont: "Vermont",
  new_hampshire: "New Hampshire",
  maine: "Maine",
  delaware: "Delaware",
  maryland: "Maryland",
  dc: "Washington, DC",
  unknown: "NYC (borough not stated)",
};

export function placeLabel(id: string): string {
  return PLACE_LABELS[id] ?? id.replace(/_/g, " ");
}

/** Picker choices -> what the filter matches: boroughs (a borough or citywide listing) and whole regions. */
export function expandPlaces(places: string[]): { boroughs: Set<string>; regions: Set<string> } {
  const boroughs = new Set<string>();
  const regions = new Set<string>();
  for (const p of places) {
    if (p === "nyc") regions.add("nyc");
    else if (p === "tristate") TRISTATE_REGIONS.forEach((r) => regions.add(r));
    else if (p === "wider") WIDER_REGIONS.forEach((r) => regions.add(r));
    else boroughs.add(p);
  }
  return { boroughs, regions };
}

export function disciplineTags(ids: string[]): Set<string> {
  const tags = new Set<string>();
  for (const d of DISCIPLINES) if (ids.includes(d.id)) d.tags.forEach((t) => tags.add(t));
  return tags;
}
