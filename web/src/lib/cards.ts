import type { Opportunity } from "@api/types";
import type { Labels } from "./taxonomy";
import type { Card } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** The date the countdown tracks, matching the Filter's expiry semantics: for an event, the nearest upcoming
 * occurrence (else the deadline); for an application type, the application deadline, so the countdown never
 * tracks a later event date the deadline has already closed off. Null when nothing upcoming applies. */
function nextDate(o: Opportunity, asOf: string): string | null {
  if (o.type === "event") {
    const dates = (o.event_dates ?? []).filter((d): d is string => !!d && ISO.test(d) && d >= asOf).sort();
    if (dates.length) return dates[0];
  }
  return ISO.test(o.deadline) && o.deadline >= asOf ? o.deadline : null;
}

/** The wording a visitor sees: the API's labels say "checked", the page says "verified". Only the words change; trustOf still reads the original label. */
export const verifiedWording = (text: string) =>
  text
    .replace(/^Not checked/, "Not verified")
    .replace(/^Checked/, "Verified")
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
    place: labels.place(o.place ?? ""),
    location: o.location,
    deadline: ISO.test(o.deadline) ? prettyDate(o.deadline) : o.deadline === "rolling" ? "Rolling deadline" : o.deadline === "recurring" ? "Recurring" : o.deadline,
    closesIn: next ? daysBetween(asOf, next) : null,
    eventDates: o.event_dates?.filter((d): d is string => !!d) ?? null,
    recurrence: o.recurrence,
    fee: o.fee === "none" ? "No fee" : o.fee,
    award: o.award,
    eligibility,
    source: o.source,
    sourceUrl: o.source_url,
    label: o.label,
    trust: trustOf(o.label),
    caveat: publicCaveat(o.caveat),
    key: o.dedupe_key,
  };
}
