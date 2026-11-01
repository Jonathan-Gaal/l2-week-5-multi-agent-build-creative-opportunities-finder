import { headers } from "next/headers";
import Link from "next/link";
import BackendFailure from "@/components/BackendFailure";
import ResultCard from "@/components/ResultCard";
import ResultsMap, { type Pin } from "@/components/ResultsMap";
import ResultsSidebar from "@/components/ResultsSidebar";
import r from "@/components/ResultsLive.module.css";
import { asBackendError, type BackendError, getMeta, searchBackend, visitorClient } from "@/lib/backend";
import { groupByKind } from "@/lib/cards";
import { loadPoints } from "@/lib/geo";
import { labelsFor, pickerChoices, pickIds } from "@/lib/taxonomy";
import type { SearchOutput } from "@/lib/types";
import { TYPE_PILL_IDS, narrowCards, pickedLabelsFor, pillsForTypes, subtypeTokens } from "@/lib/typePills";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata = { title: "Your opportunities | Artist Atlas" };

const PAGE_SIZE = 10;     // cards per page in each "More matches" section

/**
 * A page of the browse list. The whole list is put in order once (kind by kind, soonest date first), then cut into pages,
 * so a kind keeps its place from page to page; a kind that carries over from the page before says "continued".
 */
function pageOfMore<T extends Parameters<typeof groupByKind>[0][number]>(more: readonly T[], page: number) {
  const all = groupByKind(more).flatMap((g) => g.cards.map((card, i) => ({ card, kind: g.kind, size: g.cards.length, first: i === 0 })));
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const at = Math.min(Math.max(1, page), pages);
  const from = (at - 1) * PAGE_SIZE;
  const runs: { kind: string; size: number; continued: boolean; cards: T[] }[] = [];
  for (const [i, e] of all.slice(from, at * PAGE_SIZE).entries()) {
    const last = runs[runs.length - 1];
    if (last && last.kind === e.kind) last.cards.push(e.card);
    else runs.push({ kind: e.kind, size: e.size, continued: i === 0 && !e.first, cards: [e.card] });
  }
  return { at, pages, from, count: Math.min(PAGE_SIZE, all.length - from), runs };
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
  const pageHref = (type: string, n: number) => {
    const next = new URLSearchParams(choices);
    for (const [k, v] of Object.entries(q)) if (k.startsWith("pg_") && typeof v === "string") next.set(k, v);
    next.set(`pg_${type}`, String(n));
    return `/results?${next}#more-${type}`;
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
  const total = lists?.reduce((n, l) => n + l.cards.length, 0) ?? 0;     // the picks shown
  const matched = lists?.reduce((n, l) => n + Math.max(l.g.total, l.cards.length), 0) ?? 0;     // every listing that fits
  const expired = out?.groups.reduce((n, g) => n + expiredIn(g.removed), 0) ?? 0;

  // Map pins: every listing shown (top picks and the browse lists) that has a street address; every top pick (the ranked list) gets a numbered pin, in the order shown on the page.
  const points = out ? await loadPoints(out.snapshotId) : {};
  // The ranked picks are numbered 1, 2, 3... down the page; a pin carries the same number as its card.
  const rankOf = new Map((lists ?? []).flatMap((l) => l.cards).map((c, i) => [c.key, i + 1] as const));
  const shown = lists?.flatMap((l) => [...l.cards.map((c) => ({ c, top: true })), ...(l.couldNotNarrow ? [] : l.g.more).map((c) => ({ c, top: false }))]) ?? [];
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
                  <h2 id="h-ranked" className={r.rankedHead}>Our top {total} ranked {total === 1 ? "pick" : "picks"}</h2>
                  <div className={r.cards}>
                    {lists.flatMap((l) => l.cards).map((c) => (
                      <div key={c.key} className={r.ranked}>
                        <span className={r.rank} aria-label={`Rank ${rankOf.get(c.key)}`}>{rankOf.get(c.key)}</span>
                        <ResultCard card={c} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {lists.map(({ g, couldNotNarrow, cards }) => (
                <section key={g.type} aria-labelledby={`h-${g.type}`}>
                  <div className={r.groupHead}>
                    <h2 id={`h-${g.type}`}>{labels.type(g.type)}</h2>
                    <span className={r.groupNote}>
                      {g.tier === 3 ? "Nothing found" : `${g.total} ${g.total === 1 ? "match" : "matches"}`}
                    </span>
                  </div>
                  {couldNotNarrow && (
                    <p className="notice">
                      We couldn&apos;t narrow this list to {pickedLabelsFor(g.type, pills).join(" and ").toLowerCase()}, so it shows every kind of{" "}
                      {labels.type(g.type).toLowerCase()} result we ranked.
                    </p>
                  )}
                  {!cards.length && (
                    <div className="empty stack">
                      <p>{g.reason}</p>
                      <p className="hint">Try adding another place, like Tri-state, or another kind of opportunity. We never widen a search without you.</p>
                    </div>
                  )}
                  {g.more.length > 0 && !couldNotNarrow && (() => {
                    const pg = pageOfMore(g.more, Number(q[`pg_${g.type}`]) || 1);
                    return (
                      <div className={r.more} id={`more-${g.type}`}>
                        <p className={r.expiredMeta}>By kind, soonest first. Not reviewed, so check the original page.</p>
                        {pg.runs.map((run) => (
                          <div key={`${run.kind}${run.continued}`} className={r.moreGroup}>
                            <h4>{run.kind}{run.continued ? " (continued)" : ""} <span className={r.moreCount}>{run.size}</span></h4>
                            <div className={r.cards}>{run.cards.map((c) => <ResultCard key={c.key} card={c} />)}</div>
                          </div>
                        ))}
                        {pg.pages > 1 && (
                          <nav className={r.pager} aria-label={`${labels.type(g.type)} pages`}>
                            <span className={r.pagerNote}>{pg.from + 1}–{pg.from + pg.count} of {g.more.length}</span>
                            {pg.at > 1 && <Link className={r.pageLink} href={pageHref(g.type, pg.at - 1)}>Previous</Link>}
                            {pageNumbers(pg.at, pg.pages).map((n, i) =>
                              n === null ? <span key={`gap${i}`} className={r.pageGap}>…</span> : (
                                <Link key={n} className={n === pg.at ? r.pageNow : r.pageLink} href={pageHref(g.type, n)} aria-current={n === pg.at ? "page" : undefined}>{n}</Link>
                              ))}
                            {pg.at < pg.pages && <Link className={r.pageLink} href={pageHref(g.type, pg.at + 1)}>Next</Link>}
                          </nav>
                        )}
                      </div>
                    );
                  })()}
                  {g.removed && g.expired.length > 0 ? (
                    <details className={r.expired}>
                      <summary>{g.removed}</summary>
                      <ul className={r.expiredList}>
                        {g.expired.map((c) => (
                          <li key={c.key}>
                            {c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noreferrer">{c.title}</a> : c.title}
                            <span className={r.expiredMeta}>{[c.org, c.deadline].filter(Boolean).join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                      {expiredIn(g.removed) > g.expired.length && <p className={r.expiredMeta}>Showing {g.expired.length} of {expiredIn(g.removed)} expired.</p>}
                    </details>
                  ) : (
                    g.removed && <p className="removed">{g.removed}</p>
                  )}
                </section>
              ))}

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
