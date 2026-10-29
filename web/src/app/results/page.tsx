import { headers } from "next/headers";
import Link from "next/link";
import BackendFailure from "@/components/BackendFailure";
import ResultCard from "@/components/ResultCard";
import ResultsSidebar from "@/components/ResultsSidebar";
import r from "@/components/ResultsLive.module.css";
import { asBackendError, type BackendError, getMeta, searchBackend, visitorClient } from "@/lib/backend";
import { labelsFor, pickerChoices, pickIds } from "@/lib/taxonomy";
import type { SearchOutput } from "@/lib/types";
import { TYPE_PILL_IDS, narrowCards, pickedLabelsFor, pillsForTypes } from "@/lib/typePills";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata = { title: "Your opportunities | Artist Atlas" };

const TIER_NOTE: Record<number, string> = {
  0: "Verified: passed the code checks and the reviewer.",
  2: "Not fully checked: the reviewer hasn't signed off on this list, so confirm details on the original page.",
};

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
    out = await searchBackend({ places, types, disciplines }, { visitor: visitorClient(await headers()), labels });
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
  const total = lists?.reduce((n, l) => n + l.cards.length, 0) ?? 0;
  const expired = out?.groups.reduce((n, g) => n + expiredIn(g.removed), 0) ?? 0;

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
                <span className={r.big}>{total}</span>
                <span className={r.countText}>{total === 1 ? "match" : "matches"}, best first</span>
                {expired > 0 && <span className={r.removed}>{expired} expired removed</span>}
              </div>

              {lists.map(({ g, narrowed, couldNotNarrow, cards }) => (
                <section key={g.type} aria-labelledby={`h-${g.type}`}>
                  <div className={r.groupHead}>
                    <h2 id={`h-${g.type}`}>{labels.type(g.type)}</h2>
                    <span className={r.groupNote}>{g.tier === 3 ? "Nothing found" : TIER_NOTE[g.tier]}</span>
                  </div>
                  {couldNotNarrow && (
                    <p className="notice">
                      We couldn&apos;t narrow this list to {pickedLabelsFor(g.type, pills).join(" and ").toLowerCase()}, so it shows every kind of{" "}
                      {labels.type(g.type).toLowerCase()} result we ranked.
                    </p>
                  )}
                  {cards.length ? (
                    <div className={r.cards}>{cards.map((c) => <ResultCard key={c.key} card={c} />)}</div>
                  ) : (
                    <div className="empty stack">
                      <p>{g.reason}</p>
                      <p className="hint">Try adding another place, like Tri-state, or another kind of opportunity. We never widen a search without you.</p>
                    </div>
                  )}
                  {g.removed && <p className="removed">{g.removed}</p>}
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
                    are dropped, and the best fits across all your places are put first, one list per kind. Snapshot {out.snapshotId}, checked
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
