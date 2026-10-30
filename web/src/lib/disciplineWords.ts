/**
 * The chips for "What kind of artist are you?", in the order they are shown, shared by the first step and the results
 * sidebar so they match. Each chip is its own artist type (Musician, Singer, Writer and Poet are all separate), and a
 * listing can carry several types.
 */
export type ArtistChip = { id: string; key: string; word: string };

export const CHIPS: ArtistChip[] = [
  { id: "music", key: "music:musician", word: "musician" },
  { id: "visual", key: "visual", word: "visual artist" },
  { id: "photographer", key: "photographer", word: "photographer" },
  { id: "videographer", key: "videographer", word: "videographer" },
  { id: "theater", key: "theater", word: "actor" },
  { id: "singer", key: "singer", word: "singer" },
  { id: "comedy", key: "comedy", word: "comedian" },
  { id: "writing", key: "writing:writer", word: "writer" },
  { id: "poet", key: "poet", word: "poet" },
  { id: "craft", key: "craft:crafter", word: "crafter" },
  { id: "film", key: "film", word: "filmmaker" },
  { id: "dance", key: "dance", word: "dancer" },
  { id: "model", key: "model", word: "model" },
  { id: "crew", key: "crew", word: "production crew" },
];

/** The chips for one discipline. */
export const chipsFor = (id: string): ArtistChip[] => CHIPS.filter((c) => c.id === id);

/** The chips to show, given the discipline ids the service knows about. */
export const chipList = (ids: string[]): ArtistChip[] => CHIPS.filter((c) => ids.includes(c.id));

/** The discipline ids behind a list of chip keys, each once. */
export const idsOf = (keys: string[]): string[] => [...new Set(keys.map((k) => CHIPS.find((c) => c.key === k)?.id ?? k))];

/** "musician, writer and poet" */
export const sayList = (a: string[]) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

export const capital = (w: string) => w.replace(/^./, (l) => l.toUpperCase());
