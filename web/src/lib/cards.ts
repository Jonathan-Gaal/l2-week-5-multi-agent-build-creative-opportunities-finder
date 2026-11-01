import type { Opportunity } from "@api/types";
import { kindLabel } from "./kinds.ts";
import { subTag, topTag } from "./tags.ts";
import type { Labels } from "./taxonomy";
import type { Card } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "14 dates through 2026-12-17" is a series with 14 sessions; written the way the rest of the card writes dates. */
export const friendlyRecurrence = (text: string | null): string | null =>
  text && text.replace(/^(\d+) dates through /, "$1 sessions through ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => prettyDate(iso));

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** The date the countdown tracks, matching the Filter's expiry semantics: for an event, the nearest upcoming
 * occurrence (else the deadline); for an application type, the application deadline, so the countdown never
 * tracks a later event date the deadline has already closed off. Null when nothing upcoming applies. */
/** Kinds of call that happen on a date (an audition, a gig). Mirrors DATED_CALL_KINDS in server/agents/filter.ts. */
const DATED_CALL_KINDS: readonly string[] = ["audition", "casting_call", "paid_gig", "performance_call"];

function nextDate(o: Opportunity, asOf: string): { date: string; kind: "deadline" | "date" } | null {
  const upcoming = () => (o.event_dates ?? []).filter((d): d is string => !!d && ISO.test(d) && d >= asOf).sort()[0];
  if (o.type === "event") {
    const d = upcoming();
    if (d) return { date: d, kind: "date" };
  }
  if (ISO.test(o.deadline)) return o.deadline >= asOf ? { date: o.deadline, kind: "deadline" } : null;
  // No deadline stated: count to the listing's own next date (an audition, a show), and say it is a date, not a deadline.
  if (o.type !== "event" && DATED_CALL_KINDS.includes(o.subtype ?? "")) {
    const d = o.deadline === "rolling" || o.deadline === "recurring" ? undefined : upcoming();
    if (d) return { date: d, kind: "date" };
  }
  return null;
}

/** The wording a visitor sees: the API's labels say "checked" and write dates as 2026-10-27, the page says "verified" and "Oct. 27, 2026". Only the words change; trustOf still reads the original label. */
export const verifiedWording = (text: string) =>
  text
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => prettyDate(iso))
    .replace(/^Not checked/, "Not verified")
    .replace(/^Checked/, "Last verified")
    .replace(/not fully checked/g, "not fully verified")
    .replace(/without a recheck/g, "without re-verifying")
    .replace(/not rechecked/g, "not re-verified")
    .replace(/automated checks/g, "automated verification");

/** Trust comes from the API's own label, which is the one source of truth for what was checked. */
function trustOf(label: string): Card["trust"] {
  if (label.startsWith("Not checked")) return "unchecked";
  return label.includes("not fully checked") ? "partial" : "checked";
}

/**
 * The note shown on a card. Most stored notes are research notes (where a listing came from, what a crawler could not
 * read), written for the team and not for artists, so only the few written for readers are shown, and some are reworded.
 * Anything else is hidden here; the stored note is untouched.
 */
const PROCESS_WORDS = /Parent evidence|data\/research|robots|endpoint|explicitly|primary|organizer|facilitator|fetched|page gives|checked agent|SAM|evidence|Discovered|program lead|calendar|\bpage\b|crawl|rendered|JavaScript|inspected|counted once|related calls/i;

export function publicCaveat(caveat: string | null): string | null {
  if (!caveat) return null;
  const updated = caveat.match(/^Listing last updated (\d{4}-\d{2}-\d{2}); confirm with the venue\.?$/);
  if (updated) return `Last updated ${prettyDate(updated[1]!)}; confirm with the venue.`;
  if (/^Badslava listings are community-maintained/.test(caveat)) return "From a community-kept list; confirm with the venue.";
  if (/^Secondary source \(/.test(caveat)) return "From a roundup, not the venue; confirm with the venue.";
  if (/^Pay is not stated on the listing\.?$/.test(caveat)) return "Pay is not stated on the listing.";
  // The card's own label already says a copied-in listing was not rechecked; only the Craigslist safety warning adds to it.
  if (/backfill/i.test(caveat)) {
    return /Craigslist/.test(caveat) ? "Posted on Craigslist by an individual. Be careful before sharing personal details or paying anyone." : null;
  }
  if (/^Discovered on organizer calendar/.test(caveat)) return "Confirm the exact date, cost and sign-up with the organizer.";
  if (/^Public program lead/.test(caveat)) return "Confirm the schedule, age rules, fees and sign-up with the organizer.";
  // Short notes about the event itself (ages, materials, sign-up) are for readers, unless they talk about how we found the page.
  if (caveat.length <= 170 && !PROCESS_WORDS.test(caveat)) return caveat;
  return null;
}

/** What to call a listing's money: wages for work, a stipend for a residency, an award for a grant or prize. */
export function moneyLabel(type: string, subtype: string | null): string {
  if (type === "grant" || subtype === "competition") return "Award";
  if (type === "residency") return "Stipend";
  return "Pay";
}

/** Kinds where the artist is paid, cast or funded, so a missing fee is not a question worth a line on the card. */
const NO_FEE_LINE_KINDS: readonly string[] = ["audition", "casting_call", "paid_gig", "collaboration", "model_call", "commission", "teaching_artist", "fellowship", "grant"];

/**
 * The fee line, decided the same way for every listing:
 * - a real fee is shown as written, and "No fee" when the listing says it is free;
 * - when the listing says nothing, "Fee not listed" is shown where a fee is a real question (events, residencies, and
 *   calls to submit or perform: gallery, festival, competition, writing, general and perform calls, service ads);
 * - and nothing is shown where people are paid, cast or funded (auditions, casting calls, gigs, jobs, grants, fellowships).
 * Only the card changes; the stored fee (none, unknown or an amount) still feeds the ranking score.
 */
export function feeText(fee: string | null | undefined, type: string, subtype: string | null): string | null {
  if (fee === "none") return "No fee";
  if (fee && !/^(fee )?unknown$/i.test(fee.trim())) return fee;
  if (type === "job" || type === "grant" || (subtype && NO_FEE_LINE_KINDS.includes(subtype))) return null;
  return "Fee not listed";
}

/** Sources whose address ends in the date (.../event/some-class/2026-11-03/): the events calendar they run gives each date its own page. */
const DATE_AT_END_SOURCES: readonly string[] = ["huntington-arts", "daisys-li", "arts-council-princeton", "five-points-arts"];

/**
 * Where a repeating event's page for a given date lives. Some sources give every date its own page with the date in the
 * address: NYC Parks (.../events/2026/10/29/eclectik-dance-fusion) and the four sources above. The stored link is the
 * first date's page, which is old once that day is over, so the card links to the page for the next date instead. Any
 * other link (a single page for the whole series, say) is left as it is.
 */
export function nextOccurrenceUrl(source: string, url: string | null, nextDay: string | null): string | null {
  const day = nextDay ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextDay) : null;
  if (!url || !day) return url;
  if (source === "nyc-parks-events") return url.replace(/\/events\/\d{4}\/\d{2}\/\d{2}\//, `/events/${day[1]}/${day[2]}/${day[3]}/`);
  if (DATE_AT_END_SOURCES.includes(source)) return url.replace(/\/\d{4}-\d{2}-\d{2}\/?$/, `/${nextDay}/`);
  return url;
}

export function toCard(o: Opportunity, asOf: string, labels: Labels): Card {
  const next = nextDate(o, asOf);
  const eligibility = Array.isArray(o.eligibility)
    ? o.eligibility.slice(0, 3).map((e) =>
        e.quote && e.requirement.length < 30 && e.quote.toLowerCase() !== e.requirement.toLowerCase()
          ? `${e.requirement}: ${e.quote.slice(0, 200)}`
          : e.requirement,
      )
    : [];
  return {
    title: o.title,
    org: o.org,
    type: o.type,
    typeLabel: labels.type(o.type),
    subtype: o.subtype,
    alsoSubtypes: o.also_subtypes ?? [],
    tag: topTag(o),
    subtag: subTag(o),
    place: labels.place(o.place ?? ""),
    location: o.location,
    deadline: ISO.test(o.deadline) ? prettyDate(o.deadline) : o.deadline === "rolling" ? "Rolling deadline" : o.deadline === "recurring" ? "Recurring" : o.deadline,
    closesIn: next ? daysBetween(asOf, next.date) : null,
    nextKind: next ? next.kind : null,
    eventDates: o.event_dates?.filter((d): d is string => !!d) ?? null,
    recurrence: friendlyRecurrence(o.recurrence),
    fee: feeText(o.fee, o.type, o.subtype),
    award: o.award,
    eligibility,
    source: o.source,
    sourceUrl: nextOccurrenceUrl(o.source, o.source_url, next?.kind === "date" ? next.date : null),
    label: o.label,
    trust: trustOf(o.label),
    caveat: publicCaveat(o.caveat),
    key: o.dedupe_key,
  };
}

/** The name of a card's kind (Open mic, Workshop...), falling back to its broad type, for grouping the browse list. */
export const kindName = (card: { subtype: string | null; typeLabel: string }): string =>
  kindLabel(card.subtype) ?? (card.subtype ? card.subtype.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase()) : card.typeLabel);

/** Days until a card's next date; cards with no upcoming date (rolling, recurring, not listed) sort after every dated one. */
const daysAway = (c: { closesIn?: number | null }) => c.closesIn ?? Number.POSITIVE_INFINITY;

/** Cards soonest first; cards with no upcoming date go last, and the order given holds between equal dates. */
export function soonestFirst<T extends { closesIn?: number | null }>(cards: readonly T[]): T[] {
  return cards.map((c, i) => [c, i] as const).sort((x, y) => daysAway(x[0]) - daysAway(y[0]) || x[1] - y[1]).map(([c]) => c);
}

/** Groups cards by kind. Inside a group the soonest date comes first and undated cards last (the code's order holds
 * between equal dates); groups with the soonest date come first. */
export function groupByKind<T extends { subtype: string | null; typeLabel: string; closesIn?: number | null }>(cards: readonly T[]): { kind: string; cards: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const c of cards) {
    const k = kindName(c);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups]
    .map(([kind, list]) => ({ kind, cards: list.map((c, i) => [c, i] as const).sort((x, y) => daysAway(x[0]) - daysAway(y[0]) || x[1] - y[1]).map(([c]) => c) }))
    .map((g, i) => ({ g, i }))
    .sort((x, y) => daysAway(x.g.cards[0]!) - daysAway(y.g.cards[0]!) || x.i - y.i)
    .map(({ g }) => g);
}
