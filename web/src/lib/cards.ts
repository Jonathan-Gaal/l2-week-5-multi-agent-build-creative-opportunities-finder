import type { Opportunity } from "./api-types";
import { placeLabel } from "./taxonomy";
import type { Card } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** The next date that still matters: the nearest upcoming event date, else the deadline. */
function nextDate(o: Opportunity, asOf: string): string | null {
  const dates = (o.event_dates ?? []).filter((d): d is string => !!d && ISO.test(d) && d >= asOf).sort();
  if (dates.length) return dates[0];
  return ISO.test(o.deadline) && o.deadline >= asOf ? o.deadline : null;
}

/** Trust comes from the API's own label, which is the one source of truth for what was checked. */
function trustOf(label: string): Card["trust"] {
  if (label.startsWith("Not checked")) return "unchecked";
  return label.includes("not fully checked") ? "partial" : "checked";
}

export function toCard(o: Opportunity, asOf: string): Card {
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
    subtype: o.subtype,
    place: placeLabel(o.place ?? ""),
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
    caveat: o.caveat,
    key: o.dedupe_key,
  };
}
