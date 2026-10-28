import { TYPE_LABEL } from "@/lib/taxonomy";
import type { Card } from "@/lib/types";

const TRUST_PILL = { checked: "pill pill-lime", partial: "pill pill-plain", unchecked: "pill pill-grey" } as const;

export default function ResultCard({ card }: { card: Card }) {
  const closing =
    card.closesIn === null ? null : card.closesIn === 0 ? "today" : card.closesIn === 1 ? "tomorrow" : `in ${card.closesIn} days`;
  return (
    <article className="rcard">
      <div className="rcard-top">
        <span className="pill pill-pink">{card.subtype ? card.subtype.replace(/_/g, " ") : (TYPE_LABEL[card.type] ?? card.type)}</span>
        <span className={TRUST_PILL[card.trust]}>{card.label}</span>
      </div>
      <h3>{card.title}</h3>
      <p className="org">
        {[card.org, card.place, card.location && card.location.length < 70 ? card.location : null].filter(Boolean).join(" · ")}
      </p>
      <div className="facts">
        <span>
          <b>{card.deadline}</b>
          {closing && <span className="closing"> · {closing}</span>}
        </span>
        {card.recurrence && <span>{card.recurrence}</span>}
        <span>{card.fee}</span>
        {card.award && <span><b>Award:</b> {card.award.length > 110 ? `${card.award.slice(0, 110)}…` : card.award}</span>}
      </div>
      {card.eligibility.length > 0 ? (
        <ul>
          {card.eligibility.map((e) => (
            <li key={e}>{e.length > 180 ? `${e.slice(0, 180)}…` : e}</li>
          ))}
        </ul>
      ) : (
        <p className="why">Eligibility not stated</p>
      )}
      {card.caveat && <p className="caveat">{card.caveat.length > 220 ? `${card.caveat.slice(0, 220)}…` : card.caveat}</p>}
      <div className="rcard-foot">
        <span>Source: {card.source}</span>
        {card.sourceUrl && (
          <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer">
            View the listing ↗
          </a>
        )}
      </div>
    </article>
  );
}
