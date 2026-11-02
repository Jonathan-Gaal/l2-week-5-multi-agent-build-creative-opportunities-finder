import details from "../data/read-details.json" with { type: "json" };
import type { Card, Group, ReadDetails } from "./types.ts";

/**
 * What was read on each listing's own page (pay, fee, dates, where, exact deadline time), by listing key, from
 * scripts/build_read_details.py. Server-only: the results page adds it to the cards, so the large file never reaches the browser.
 */
const BY_KEY = details as Record<string, ReadDetails>;

/** The card with its page details, leaving out a place that the card already shows. */
export function withDetails(card: Card): Card {
  const d = BY_KEY[card.key];
  if (!d) return card;
  const { where, ...rest } = d;
  return { ...card, read: card.location || !where ? rest : { ...rest, where } };
}

export const groupWithDetails = (g: Group): Group => ({
  ...g,
  cards: g.cards.map(withDetails),
  expired: g.expired.map(withDetails),
  more: g.more.map(withDetails),
});
