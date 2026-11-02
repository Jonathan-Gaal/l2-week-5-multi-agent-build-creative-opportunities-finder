import type { SearchInput } from "./types";

/** The /api/search query for picker choices. Commas are left readable; the API splits on them. */
export function searchQuery(input: SearchInput): string {
  const q = new URLSearchParams({ places: input.places.join(","), types: input.types.join(",") });
  if (input.disciplines.length) q.set("disciplines", input.disciplines.join(","));
  if (input.subtypes?.length) q.set("subtypes", input.subtypes.join(","));
  return q.toString().replaceAll("%2C", ",");
}
