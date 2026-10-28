/**
 * Picker lists and display labels, all derived from the results API's meta (getMeta / GET /api/meta;
 * server/agents/taxonomy.ts is the one source of truth). Pure functions, so server and client components can both use them.
 */
import type { MetaResponse } from "@api/types";

export type Labels = {
  place: (id: string) => string;
  type: (id: string) => string;
  discipline: (id: string) => string;
};

const pretty = (id: string) => id.replace(/_/g, " ");

/** Display labels from the meta lists. Without meta (the service is down) ids are shown readably instead. */
export function labelsFor(meta: MetaResponse | null): Labels {
  const place = new Map<string, string>();
  const type = new Map<string, string>();
  const discipline = new Map<string, string>();
  if (meta) {
    for (const o of [...meta.boroughs, ...meta.regions, ...meta.other_places, ...meta.place_groups]) place.set(o.value, o.label);
    for (const o of meta.types) type.set(o.value, o.label);
    for (const o of meta.disciplines) discipline.set(o.value, o.label);
  }
  return {
    place: (id) => place.get(id) ?? pretty(id),
    type: (id) => type.get(id) ?? pretty(id),
    discipline: (id) => discipline.get(id) ?? pretty(id),
  };
}

export type Choices = { places: Set<string>; types: Set<string>; disciplines: Set<string> };

/** What the pickers offer: boroughs and place groups (regions are reached through the groups), types, disciplines. */
export function pickerChoices(meta: MetaResponse): Choices {
  return {
    places: new Set([...meta.boroughs, ...meta.place_groups].map((o) => o.value)),
    types: new Set(meta.types.map((o) => o.value)),
    disciplines: new Set(meta.disciplines.map((o) => o.value)),
  };
}

/** The allowed ids in a comma-separated query value, a repeated one, or a JSON array; each once, in the order given. */
export function pickIds(value: unknown, allowed: Set<string>): string[] {
  const items = (Array.isArray(value) ? value : [value]).flatMap((x) => (typeof x === "string" ? x.split(",") : []));
  return [...new Set(items.filter((x): x is string => typeof x === "string" && allowed.has(x)))];
}
