import { moneyLabel, verifiedWording } from "@/lib/cards";
import { kindNote } from "@/lib/kinds";
import type { Card } from "@/lib/types";

const TRUST_PILL = { checked: "pill pill-lime", partial: "pill pill-plain", unchecked: "pill pill-grey" } as const;

/** What was read on the listing's own page, as label and text rows; a field the page did not give is not shown. */
const readRows = (card: Card): [string, string][] => {
  const d = card.read;
  if (!d) return [];
  const rows: [string, string | undefined][] = [["Pay", d.pay], ["Fee", d.fee], ["Dates", d.dates], ["Where", d.where], ["Apply by", d.by]];
  return rows.filter((r): r is [string, string] => !!r[1]);
};

export default function ResultCard({ card }: { card: Card }) {
  const when =
    card.closesIn === null ? null : card.closesIn === 0 ? "today" : card.closesIn === 1 ? "tomorrow" : `in ${card.closesIn} days`;
  // Name what the countdown refers to so it is never read as a closing date it isn't: events count down to the
  // next occurrence, application types to the application deadline (the date shown beside it).
  const closing = when && `${card.nextKind === "deadline" ? "Closes" : "Next date"} ${when}`;
  // Top right, as on the Live board: that countdown, else when it happens or that it is rolling.
  const noDeadline = card.deadline === "Deadline not listed";
  const topRight = closing ?? (card.recurrence && card.recurrence.length <= 40 ? card.recurrence : null) ?? (noDeadline ? null : card.deadline);
  // A real date is named ("Deadline: Nov. 10, 2026", "Date: ..."), so it is never read as the date we verified the listing.
  const dateLabel = /\d{4}$/.test(card.deadline) ? (card.type === "event" ? "Date: " : "Deadline: ") : "";
  return (
    <article className="rcard" id={`card-${card.key}`}>
      <div className="rcard-top">
        <span className="pill pill-pink">{card.tag}</span>
        {card.subtag && <span className="pill pill-sub">{card.subtag}</span>}
        <span className={TRUST_PILL[card.trust]}>{verifiedWording(card.label)}</span>
        {topRight && <span className={closing ? "rcard-when closing" : "rcard-when"}>{topRight}</span>}
      </div>
      <h3>{card.title}</h3>
      {kindNote(card.subtype) && <p className="why">{kindNote(card.subtype)}</p>}
      <p className="org">
        {[card.org, card.place, card.location && card.location.length < 70 ? card.location : null].filter(Boolean).join(" · ")}
      </p>
      <div className="facts">
        {!(noDeadline && card.recurrence) && (
          <span>
            {dateLabel}<b>{card.deadline}</b>
          </span>
        )}
        {card.recurrence && <span>{card.recurrence}</span>}
        {card.fee && <span>{card.fee}</span>}
        {card.award && <span><b>{moneyLabel(card.type, card.subtype)}:</b> {card.award.length > 110 ? `${card.award.slice(0, 110)}…` : card.award}</span>}
      </div>
      {readRows(card).length > 0 && (
        <dl className="read">
          {readRows(card).map(([label, text]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{text.length > 160 ? `${text.slice(0, 160)}…` : text}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.eligibility.length > 0 ? (
        <ul>
          {card.eligibility.map((e) => (
            <li key={e}>{e.length > 180 ? `${e.slice(0, 180)}…` : e}</li>
          ))}
        </ul>
      ) : (
        <p className="why">Eligibility not stated</p>
      )}
      {card.caveat && <p className="caveat">{verifiedWording(card.caveat.length > 220 ? `${card.caveat.slice(0, 220)}…` : card.caveat)}</p>}
      <div className="rcard-foot">
        <span>Source: {card.source === "mara-craigslist-new-york" ? "Craigslist (posted by an individual)" : card.source}</span>
        {card.sourceUrl && (
          <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer">
            View the listing ↗
          </a>
        )}
      </div>
    </article>
  );
}
