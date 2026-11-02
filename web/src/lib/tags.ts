/**
 * The two tags a visitor sees on a listing. The top tag is one of the eleven choices on step two of the find flow, so a
 * listing reads the same from the pills to the results; the small tag beside it says what it is more exactly (Audition,
 * Casting call...) and is left off when the top tag already says it. Both come from the stored kind, never stored themselves.
 */
export const TOP_TAGS = [
  "Submissions/Open calls", "Auditions", "Open mics", "Grants", "Fellowships", "Residencies",
  "Festivals", "Workshops/Classes", "Social events", "Collaborations", "Other gigs/Jobs",
] as const;
export type TopTag = (typeof TOP_TAGS)[number];

type Tagged = { type: string; subtype: string | null; title: string };

const OPEN_CALL_TOP: Record<string, TopTag> = {
  audition: "Auditions", casting_call: "Auditions", festival: "Festivals",
  collaboration: "Collaborations", service_ad: "Collaborations", paid_gig: "Other gigs/Jobs", model_call: "Other gigs/Jobs",
};
const EVENT_TOP: Record<string, TopTag> = {
  open_mic: "Open mics", workshop: "Workshops/Classes", class: "Workshops/Classes", drawing_session: "Workshops/Classes",
};

export function topTag(c: Tagged): TopTag {
  switch (c.type) {
    case "open_call": return OPEN_CALL_TOP[c.subtype ?? ""] ?? "Submissions/Open calls";
    case "event": return EVENT_TOP[c.subtype ?? ""] ?? "Social events";
    case "grant": return c.subtype === "fellowship" ? "Fellowships" : "Grants";
    case "residency": return "Residencies";
    default: return "Other gigs/Jobs";
  }
}

const SUBTAGS: Record<string, string> = {
  gallery_submission: "Gallery submission", performance_call: "Apply to perform", competition: "Competition", commission: "Commission",
  writing_submission: "Writing submission", audition: "Audition", casting_call: "Casting call", festival: "Festival call",
  collaboration: "Band members wanted", paid_gig: "Paid gig", model_call: "Model call",
  workshop: "Workshop", class: "Class", drawing_session: "Drawing session",
  dance_night: "Dance night", jam: "Jam", meetup: "Meetup", open_studio: "Studio tour",
  full_time: "Full-time job", teaching_artist: "Teaching job", internship: "Internship",
};
const LESSON_WORDS = /lesson|teach|instruct|tutor/i;
const SPACE_WORDS = /rehearsal|\bspace\b|for rent|\brent(al)?\b|\/mo\b/i;

/** The small tag, or null where the top tag already says it (open mics, grants, fellowships, residencies, general calls). */
export function subTag(c: Tagged): string | null {
  const k = c.subtype ?? "";
  const tag = k === "service_ad" ? (LESSON_WORDS.test(c.title) ? "Lessons" : SPACE_WORDS.test(c.title) ? "Space for rent" : "Artist for hire")
    : k === "show" ? (/festival/i.test(c.title) ? "Festival" : "Show")   // a festival or show to attend, not a call for artists
    : (SUBTAGS[k] ?? null);
  // "Auditions" with "Audition" beside it says nothing new: leave the small tag off when the top tag already starts with it.
  return tag && topTag(c).toLowerCase().startsWith(tag.toLowerCase()) ? null : tag;
}
