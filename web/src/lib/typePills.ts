/**
 * The "what are you looking for" pills, one per kind of opportunity. The results service still sorts by five broad
 * types (open_call, event, grant, residency, job), so each pill names its broad type plus the finer sub-types it
 * means. Nothing is mixed: open mics are not open calls, auditions are not open calls, fellowships are not grants.
 * The results page uses the sub-types to narrow each list; see narrowCards below.
 */
export type TypePill = {
  id: string;
  label: string;
  /** The broad types the results service knows; most pills have one, a merged pill has several. */
  types: readonly string[];
  /** Sub-types this pill covers. Records with no sub-type, or one nobody claims, go to the pill marked `rest` (for its first type). */
  subtypes: readonly string[];
  rest?: boolean;
  /** What this kind of opportunity means, in plain words, shown under its chip. */
  explain: string;
};

export const TYPE_PILLS: readonly TypePill[] = [
  { id: "open_calls", label: "Submissions/Open calls", types: ["open_call"], subtypes: [], rest: true, explain: "Send your work to be considered for an exhibition, publication, commission or competition." },
  { id: "auditions", label: "Auditions", types: ["open_call"], subtypes: ["audition", "casting_call"], explain: "Try out for a role in a performance, production or ensemble." },
  { id: "open_mics", label: "Open mics", types: ["event"], subtypes: ["open_mic"], explain: "Sign up to perform a short set at a live event." },
  { id: "grants", label: "Grants", types: ["grant"], subtypes: [], rest: true, explain: "Funding awarded to support your work or a project that does not need to be repaid." },
  { id: "fellowships", label: "Fellowships", types: ["grant"], subtypes: ["fellowship"], explain: "Competitive award that supports an artist over a long period, often with funding, mentorship or a community." },
  { id: "residencies", label: "Residencies", types: ["residency"], subtypes: [], rest: true, explain: "Dedicated time and space to make work, usually at a studio or program, sometimes with a stipend." },
  { id: "festivals", label: "Festivals", types: ["open_call"], subtypes: ["festival"], explain: "A call for artists to apply, submit work or perform at a festival." },
  { id: "workshops", label: "Workshops/Classes", types: ["event"], subtypes: ["workshop", "class", "drawing_session"], explain: "Classes, workshops and lessons where you learn or practice a creative skill with an instructor." },
  { id: "social_events", label: "Social events", types: ["event"], subtypes: [], rest: true, explain: "Take part in gatherings like jam sessions, dance nights, festivals, screenings and meetups." },
  { id: "collaborations", label: "Collaborations", types: ["open_call"], subtypes: ["collaboration"], explain: "Artists looking to team up: partners to create with, talent for hire, shared spaces or services." },
  // Two broad types: one-time paid work (open calls) and ongoing positions (jobs). Its "rest" is the job type, listed first.
  { id: "paid_gigs", label: "Other gigs/Jobs", types: ["job", "open_call"], subtypes: ["paid_gig", "model_call"], rest: true, explain: "From one-time paid work, such as performances and shoots to ongoing positions." },
];

/** Older links may still say `jobs`; it now means the merged Paid gigs/Jobs chip. */
export const OLD_PILL_IDS: Record<string, string> = { jobs: "paid_gigs" };

export const TYPE_PILL_IDS = new Set<string>(TYPE_PILLS.map((p) => p.id));

/** The broad types for a set of picked pills, each once, in pill order (what the results service is asked for). */
export const typesOf = (pillIds: readonly string[]): string[] => [
  ...new Set(TYPE_PILLS.filter((p) => pillIds.includes(p.id)).flatMap((p) => p.types)),
];

/** Every pill for these broad types: how an older link with only `t=` is read. */
export const pillsForTypes = (types: readonly string[]): string[] =>
  TYPE_PILLS.filter((p) => p.types.some((t) => types.includes(t))).map((p) => p.id);

/** The pill a record's main kind belongs to: the one that names its sub-type, else the "rest" pill of its broad type. */
const pillOf = (type: string, subtype: string | null): TypePill | undefined =>
  TYPE_PILLS.find((p) => p.types.includes(type) && subtype != null && p.subtypes.includes(subtype)) ?? TYPE_PILLS.find((p) => p.types[0] === type && p.rest);

/**
 * Narrow one broad type's cards to the picked pills. A card stays if its main kind or any of its extra kinds
 * (alsoSubtypes) belongs to a picked pill, and it appears once however many of its pills are picked. When every pill
 * of that type is picked (or none was chosen, an older link) nothing is dropped. Returns null when no narrowing applies.
 */
export function narrowCards<T extends { subtype: string | null; alsoSubtypes?: string[] }>(type: string, cards: readonly T[], pillIds: readonly string[]): T[] | null {
  if (!pillIds.length) return null;
  const mine = TYPE_PILLS.filter((p) => p.types.includes(type));
  const picked = mine.filter((p) => pillIds.includes(p.id));
  if (!picked.length || picked.length === mine.length) return null;
  const ok = new Set(picked.map((p) => p.id));
  return cards.filter((c) => {
    const main = pillOf(type, c.subtype);
    if (main && ok.has(main.id)) return true;
    return (c.alsoSubtypes ?? []).some((k) => {
      const p = pillOf(type, k);
      return p ? ok.has(p.id) : false;
    });
  });
}

export const pillLabel = (id: string): string => TYPE_PILLS.find((p) => p.id === id)?.label ?? id;

/** The labels of the picked pills that belong to one broad type, e.g. ["Open mics"] for the events list. */
export const pickedLabelsFor = (type: string, pillIds: readonly string[]): string[] =>
  TYPE_PILLS.filter((p) => p.types.includes(type) && pillIds.includes(p.id)).map((p) => p.label);
