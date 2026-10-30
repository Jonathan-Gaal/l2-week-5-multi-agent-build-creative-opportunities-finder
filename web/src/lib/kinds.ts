/**
 * Plain-English names for the kinds of opportunity in the recategorized data, shown on each result card so people can
 * see what a listing really is. `note` is only set where the kind needs a warning or an explanation. Nothing is hidden:
 * every kind still shows up in results (the kinds without a chip of their own sit under "Submissions/Open calls" or "Social events").
 */
export type KindInfo = { label: string; note?: string };

export const KINDS: Record<string, KindInfo> = {
  festival: { label: "Festival call", note: "Submissions or applications to a festival." },
  gallery_submission: { label: "Gallery submission", note: "A call to show visual work (exhibition, juried show, market)." },
  casting_call: { label: "Casting call", note: "Acting or on-screen work, not a regular paid gig." },
  model_call: { label: "Model call", note: "Modeling work: photo shoots, brands or art classes." },
  writing_submission: { label: "Writing submission", note: "Send writing to a journal or call." },
  collaboration: { label: "Collaboration", note: "An artist looking to work with other artists. Not always paid." },
  service_ad: { label: "Service ad", note: "Someone offering lessons, space or their own services. This is not a job or an opportunity to apply for." },
  performance_call: { label: "Call to perform", note: "Apply or propose to perform or present work. Not an audition." },
  general_call: { label: "Open call" },
  competition: { label: "Competition or prize" },
  commission: { label: "Commission", note: "Paid project, such as public art or a mural." },
  teaching_artist: { label: "Teaching artist job" },
  jam: { label: "Jam", note: "Play music together. Bring an instrument." },
  dance_night: { label: "Dance night" },
  show: { label: "Show or festival to attend" },
  meetup: { label: "Meetup" },
  open_studio: { label: "Open studio" },
};

export const kindLabel = (subtype: string | null): string | null => (subtype ? KINDS[subtype]?.label ?? null : null);
export const kindNote = (subtype: string | null): string | null => (subtype ? KINDS[subtype]?.note ?? null : null);
