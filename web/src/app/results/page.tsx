import { headers } from "next/headers";
import Link from "next/link";
import BackendFailure from "@/components/BackendFailure";
import ResultCard from "@/components/ResultCard";
import ResultsMap, { type Pin } from "@/components/ResultsMap";
import ResultsSidebar from "@/components/ResultsSidebar";
import r from "@/components/ResultsLive.module.css";
import { asBackendError, type BackendError, getMeta, searchBackend, visitorClient } from "@/lib/backend";
import { soonestFirst } from "@/lib/cards";
import { TOP_TAGS } from "@/lib/tags";
import { loadPoints } from "@/lib/geo";
import { labelsFor, pickerChoices, pickIds } from "@/lib/taxonomy";
import type { SearchOutput } from "@/lib/types";
import { TYPE_PILL_IDS, narrowCards, pickedLabelsFor, pillsForTypes, subtypeTokens } from "@/lib/typePills";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata = { title: "Your opportunities | Artist Atlas" };

const PAGE_SIZE = 10;     // cards per page in the "More matches" list

/** One page of a list. A page number outside the list falls back to the nearest real page. */
function pageOf<T>(items: readonly T[], page: number) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const at = Math.min(Math.max(1, page), pages);
  const from = (at - 1) * PAGE_SIZE;
  return { at, pages, from, shown: items.slice(from, at * PAGE_SIZE) };
}

const TOP_PICKS = 5;     // the ranked list is five listings in all, as the results service ranks them

/** Takes the best of each type in turn (every type's own ranking kept) until there are `n`, so no type is crowded out. */
function takeInTurns<T>(lists: readonly (readonly T[])[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < n && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < n) out.push(l[i]!);
  }
  return out;
}

/** Page numbers to show: the first, the last and the neighbours of the current page, with gaps marked. */
function pageNumbers(at: number, pages: number): (number | null)[] {
  const keep = [...new Set([1, pages, at - 1, at, at + 1].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1]! > 1 ? [null, n] : [n]));
}

/** "3 expired listings removed." -> 3. Anything else counts as none. */
const expiredIn = (removed: string | null) => Number(removed?.match(/(\d+)\s+expired/)?.[1] ?? 0);

/** The results page, on the layout of the "Live" board: your answers as chips on the left, the count and cards on the right. */
export default async function Results({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const meta = getMeta();
  const labels = labelsFor(meta);
  const allowed = pickerChoices(meta);
  const places = pickIds(q.p, allowed.places);
  const types = pickIds(q.t, allowed.types);
  const disciplines = pickIds(q.d, allowed.disciplines);
  const pills = pickIds(q.s, TYPE_PILL_IDS); // the finer "what are you looking for" pills; they narrow each list below
  const choices = new URLSearchParams({ d: disciplines.join(","), t: types.join(","), p: places.join(",") });
  if (pills.length) choices.set("s", pills.join(","));
  const editHref = `/find/discipline?${choices}`;
  // A link to a page of the "More matches" list, optionally narrowed to one kind (Audition, Open mic...).
  const moreHref = (kind: string | null, n: number) => {
    const next = new URLSearchParams(choices);
    if (kind) next.set("kind", kind);
    if (n > 1) next.set("pg", String(n));
    return `/results?${next}#more`;
  };
  const sidebar = <ResultsSidebar meta={meta} initial={{ d: disciplines, s: pills.length ? pills : pillsForTypes(types), p: places }} />;

  if (!places.length || !types.length) {
    return (
      <div className="wrap">
        <div className={r.board}>
          {sidebar}
          <div className="empty stack">
            <h1>Let&apos;s pick a place and what you&apos;re after</h1>
            <p>We need at least one place and one kind of opportunity to search. Pick them on the left, or start again.</p>
            <Link className="btn" href={editHref}>Choose again</Link>
          </div>
        </div>
      </div>
    );
  }

  let out: SearchOutput | null = null;
  let failure: BackendError | null = null;
  try {
    out = await searchBackend({ places, types, disciplines, subtypes: subtypeTokens(pills) }, { visitor: visitorClient(await headers()), labels });
  } catch (e) {
    failure = asBackendError(e);
  }

  // Narrow each list to the picked pills (open mics only, not every event); null means no narrowing applies. The results
  // service ranks by broad type first, so its top list can hold none of the picked kind even when many exist. In that
  // case show the whole list and say so, rather than claim nothing was found.
  const lists = out?.groups.map((g) => {
    const narrowed = narrowCards(g.type, g.cards, pills);
    const couldNotNarrow = narrowed !== null && narrowed.length === 0 && g.cards.length > 0;
    return { g, narrowed: couldNotNarrow ? null : narrowed, couldNotNarrow, cards: couldNotNarrow ? g.cards : (narrowed ?? g.cards) };
  });
  const picks = takeInTurns((lists ?? []).map((l) => l.cards), TOP_PICKS);     // the ranked list
  const pickKeys = new Set(picks.map((c) => c.key));
  const total = picks.length;
  const matched = lists?.reduce((n, l) => n + Math.max(l.g.total, l.cards.length), 0) ?? 0;     // every listing that fits
  const expired = out?.groups.reduce((n, g) => n + expiredIn(g.removed), 0) ?? 0;
  const expiredItems = out?.groups.flatMap((g) => g.expired) ?? [];     // one list for every type
  const removedNotes = out?.groups.flatMap((g) => (g.removed ? [g.removed] : [])) ?? [];

  // The rest of the matches: one list across every type, soonest first, that can be narrowed to one kind by the pills above it.
  // The rest: every match that is not one of the five, from the ranked lists' leftovers and the browse lists.
  const rest = soonestFirst([...(lists ?? []).flatMap((l) => l.cards).filter((c) => !pickKeys.has(c.key)), ...(lists ?? []).filter((l) => !l.couldNotNarrow).flatMap((l) => l.g.more)]);
  const kinds = TOP_TAGS.map((t) => [t, rest.filter((c) => c.tag === t).length] as const).filter(([, n]) => n > 0);
  const kind = typeof q.kind === "string" && kinds.some(([k]) => k === q.kind) ? q.kind : null;
  const narrowedRest = kind ? rest.filter((c) => c.tag === kind) : rest;
  const pg = pageOf(narrowedRest, Number(q.pg) || 1);

  // Map pins: every listing shown (top picks and the browse lists) that has a street address; every top pick (the ranked list) gets a numbered pin, in the order shown on the page.
  const points = out ? await loadPoints(out.snapshotId) : {};
  // The ranked picks are numbered 1, 2, 3... down the page; a pin carries the same number as its card.
  const rankOf = new Map(picks.map((c, i) => [c.key, i + 1] as const));
  const shown = [...picks.map((c) => ({ c, top: true })), ...rest.map((c) => ({ c, top: false }))];
  const pins: Pin[] = shown.flatMap(({ c, top }) => (points[c.key] ? [{ key: c.key, title: c.title, ...points[c.key], top, n: top ? rankOf.get(c.key) : undefined }] : []));

  return (
    <div className="wrap">
      <div className={r.board}>
        {sidebar}
        <div className={r.main}>
          {failure && <BackendFailure title="We couldn't get your results" failure={failure} retryHref={`/results?${choices}`} />}

          {out && lists && (
            <>
              <h1 className="sr-only">Your opportunities</h1>
              <div className={r.count}>
                <span className={r.big}>{matched}</span>
                <span className={r.countText}>
                  {matched === 1 ? "match" : "matches"}
                  {matched > total ? `. Our top ${total} are ranked first.` : ", best first"}
                </span>
                {expired > 0 && <span className={r.removed}>{expired} expired removed</span>}
              </div>

              <ResultsMap pins={pins} missing={shown.length - pins.length} />

              {total > 0 && (
                <section aria-labelledby="h-ranked">
                  <h2 id="h-ranked" className={r.rankedHead}>{total === 1 ? "Your Top Pick" : `Your Top ${total} Ranked List`}</h2>
                  <div className={r.cards}>
                    {picks.map((c) => (
                      <div key={c.key} className={r.ranked}>
                        <span className={r.rank} aria-label={`Rank ${rankOf.get(c.key)}`}>{rankOf.get(c.key)}</span>
                        <ResultCard card={c} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {lists.filter((l) => l.couldNotNarrow).map(({ g }) => (
                <p key={g.type} className="notice">
                  We couldn&apos;t narrow {labels.type(g.type)} to {pickedLabelsFor(g.type, pills).join(" and ").toLowerCase()}, so it shows every kind we ranked.
                </p>
              ))}

              {rest.length > 0 && (
                <section id="more" aria-labelledby="h-more">
                  <div className={r.groupHead}>
                    <h2 id="h-more">More matches</h2>
                    <span className={r.groupNote}>{narrowedRest.length} {kind ? kind.toLowerCase() : "in all"}</span>
                  </div>
                  <nav className={r.kinds} aria-label="Narrow the list to one kind">
                    <Link className={kind === null ? r.kindOn : r.kindPill} href={moreHref(null, 1)} aria-current={kind === null ? "true" : undefined}>
                      All <span>{rest.length}</span>
                    </Link>
                    {kinds.map(([k, n]) => (
                      <Link key={k} className={kind === k ? r.kindOn : r.kindPill} href={moreHref(k, 1)} aria-current={kind === k ? "true" : undefined}>
                        {k} <span>{n}</span>
                      </Link>
                    ))}
                  </nav>
                  <div className={r.cards}>{pg.shown.map((c) => <ResultCard key={c.key} card={c} />)}</div>
                  {pg.pages > 1 && (
                    <nav className={r.pager} aria-label="Pages of more matches">
                      <span className={r.pagerNote}>{pg.from + 1}–{pg.from + pg.shown.length} of {narrowedRest.length}</span>
                      {pg.at > 1 && <Link className={r.pageLink} href={moreHref(kind, pg.at - 1)}>Previous</Link>}
                      {pageNumbers(pg.at, pg.pages).map((n, i) =>
                        n === null ? <span key={`gap${i}`} className={r.pageGap}>…</span> : (
                          <Link key={n} className={n === pg.at ? r.pageNow : r.pageLink} href={moreHref(kind, n)} aria-current={n === pg.at ? "page" : undefined}>{n}</Link>
                        ))}
                      {pg.at < pg.pages && <Link className={r.pageLink} href={moreHref(kind, pg.at + 1)}>Next</Link>}
                    </nav>
                  )}
                </section>
              )}

              {lists.filter((l) => !l.cards.length).map(({ g }) => (
                <div key={g.type} className="empty stack">
                  <p>{labels.type(g.type)}: {g.reason}</p>
                  <p className="hint">Try adding another place, like Tri-state, or another kind of opportunity. We never widen a search without you.</p>
                </div>
              ))}

              {expiredItems.length > 0 ? (
                <details className={r.expired}>
                  <summary>{expired} expired {expired === 1 ? "listing" : "listings"} removed</summary>
                  <ul className={r.expiredList}>
                    {expiredItems.map((c) => (
                      <li key={c.key}>
                        {c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noreferrer">{c.title}</a> : c.title}
                        <span className={r.expiredMeta}>{[c.org, c.deadline].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                  {expired > expiredItems.length && <p className={r.expiredMeta}>Showing {expiredItems.length} of {expired} expired.</p>}
                </details>
              ) : (
                removedNotes.length > 0 && <p className="removed">{removedNotes.join(" ")}</p>
              )}

              <div className={r.foot}>
                <a className={r.ghost} href="#how">How were these ranked?</a>
                <Link className={r.ghost} href={editHref}>Start over</Link>
              </div>

              <details className="how" id="how">
                <summary>How were these chosen?</summary>
                <div className="stack">
                  <p className="muted-dk">
                    Listings are filtered by place, type and discipline (listings open to any artist always count), expired and incomplete ones
                    are dropped, and the best fits across all your places are put first, one list per kind. Snapshot {out.snapshotId}, verified
                    against {out.asOf}. If something looks wrong, quote the request id.
                  </p>
                  <ul className="muted-dk">
                    {out.calls.map((c) => (
                      <li key={c.type}>
                        {labels.type(c.type)}: tier {c.tier}, {c.count} result{c.count === 1 ? "" : "s"}, request {c.requestId}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
