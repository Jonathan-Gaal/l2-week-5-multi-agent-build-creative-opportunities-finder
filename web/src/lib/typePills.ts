/**
 * The "what are you looking for" pills, one per kind of opportunity. The results service still sorts by five broad
 * types (open_call, event, grant, residency, job), so each pill names its broad type plus the finer sub-types it
 * means. Nothing is mixed: open mics are not open calls, auditions are not open calls, fellowships are not grants.
 * The results page uses the sub-types to narrow each list; see narrowCards below.
 */
export type TypePill = {
  id: string;
  label: string;
  /** The broad type the results service knows. */
  type: string;
  /** Sub-types this pill covers. Records with no sub-type, or one nobody claims, go to the pill marked `rest`. */
  subtypes: readonly string[];
  rest?: boolean;
  group: string;
};

export const TYPE_PILL_GROUPS = ["Calls and auditions", "Events", "Money and time", "Work"] as const;

export const TYPE_PILLS: readonly TypePill[] = [
  { id: "open_calls", label: "Open calls", type: "open_call", subtypes: [], rest: true, group: "Calls and auditions" },
  { id: "auditions", label: "Auditions", type: "open_call", subtypes: ["audition"], group: "Calls and auditions" },
  { id: "paid_gigs", label: "Paid gigs", type: "open_call", subtypes: ["paid_gig"], group: "Calls and auditions" },

  { id: "open_mics", label: "Open mics", type: "event", subtypes: ["open_mic"], group: "Events" },
  { id: "workshops", label: "Workshops and classes", type: "event", subtypes: ["workshop", "class", "drawing_session"], group: "Events" },
  { id: "jams", label: "Jams", type: "event", subtypes: ["jam"], group: "Events" },
  { id: "dance_nights", label: "Dance nights", type: "event", subtypes: ["dance_night"], group: "Events" },
  { id: "other_events", label: "Other events", type: "event", subtypes: [], rest: true, group: "Events" },

  { id: "grants", label: "Grants", type: "grant", subtypes: [], rest: true, group: "Money and time" },
  { id: "fellowships", label: "Fellowships", type: "grant", subtypes: ["fellowship"], group: "Money and time" },
  { id: "residencies", label: "Residencies", type: "residency", subtypes: [], rest: true, group: "Money and time" },

  { id: "jobs", label: "Jobs", type: "job", subtypes: [], rest: true, group: "Work" },
];

export const TYPE_PILL_IDS = new Set<string>(TYPE_PILLS.map((p) => p.id));

/** The broad types for a set of picked pills, each once, in pill order (what the results service is asked for). */
export const typesOf = (pillIds: readonly string[]): string[] => [
  ...new Set(TYPE_PILLS.filter((p) => pillIds.includes(p.id)).map((p) => p.type)),
];

/** Every pill for these broad types: how an older link with only `t=` is read. */
export const pillsForTypes = (types: readonly string[]): string[] => TYPE_PILLS.filter((p) => types.includes(p.type)).map((p) => p.id);

/** The pill a record belongs to: the one that names its sub-type, else the "rest" pill of its broad type. */
const pillOf = (type: string, subtype: string | null): TypePill | undefined =>
  TYPE_PILLS.find((p) => p.type === type && subtype != null && p.subtypes.includes(subtype)) ?? TYPE_PILLS.find((p) => p.type === type && p.rest);

/**
 * Narrow one broad type's cards to the picked pills. When every pill of that type is picked (or none was
 * chosen, an older link) nothing is dropped. Returns null when no narrowing applies.
 */
export function narrowCards<T extends { subtype: string | null }>(type: string, cards: readonly T[], pillIds: readonly string[]): T[] | null {
  if (!pillIds.length) return null;
  const mine = TYPE_PILLS.filter((p) => p.type === type);
  const picked = mine.filter((p) => pillIds.includes(p.id));
  if (!picked.length || picked.length === mine.length) return null;
  const ok = new Set(picked.map((p) => p.id));
  return cards.filter((c) => {
    const p = pillOf(type, c.subtype);
    return p ? ok.has(p.id) : false;
  });
}

export const pillLabel = (id: string): string => TYPE_PILLS.find((p) => p.id === id)?.label ?? id;

/** The labels of the picked pills that belong to one broad type, e.g. ["Open mics"] for the events list. */
export const pickedLabelsFor = (type: string, pillIds: readonly string[]): string[] =>
  TYPE_PILLS.filter((p) => p.type === type && pillIds.includes(p.id)).map((p) => p.label);
