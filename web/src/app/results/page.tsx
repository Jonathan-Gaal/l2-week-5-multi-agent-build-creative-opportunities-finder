import Link from "next/link";
import ResultCard from "@/components/ResultCard";
import { BackendError, FRIENDLY, searchBackend } from "@/lib/backend";
import { BOROUGHS, DISCIPLINE_LABEL, DISCIPLINES, PLACE_GROUPS, placeLabel, TYPE_LABEL, TYPES } from "@/lib/taxonomy";
import type { SearchOutput } from "@/lib/types";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata = { title: "Your opportunities | Artist Atlas" };

const ids = (choices: readonly { id: string }[]) => new Set(choices.map((c) => c.id));
const PLACES = ids([...BOROUGHS, ...PLACE_GROUPS]);
const TYPE_IDS = ids(TYPES);
const DISCIPLINE_IDS = ids(DISCIPLINES);

const list = (v: string | string[] | undefined, allowed: Set<string>): string[] =>
  [...new Set((Array.isArray(v) ? v.join(",") : (v ?? "")).split(",").filter((x) => allowed.has(x)))];

const TIER_NOTE: Record<number, string> = {
  0: "Verified: passed the code checks and the reviewer.",
  2: "Not fully checked: the reviewer hasn't signed off on this list, so confirm details on the original page.",
};

export default async function Results({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const places = list(q.p, PLACES);
  const types = list(q.t, TYPE_IDS);
  const disciplines = list(q.d, DISCIPLINE_IDS);
  const editHref = `/find?${new URLSearchParams({ d: disciplines.join(","), t: types.join(","), p: places.join(",") })}`;

  if (!places.length || !types.length) {
    return (
      <div className="wrap narrow">
        <div className="empty stack">
          <h1>Let&apos;s pick a place and what you&apos;re after</h1>
          <p>We need at least one place and one kind of opportunity to search.</p>
          <Link className="btn" href={editHref}>Choose again</Link>
        </div>
      </div>
    );
  }

  let out: SearchOutput | null = null;
  let failure: BackendError | null = null;
  try {
    out = await searchBackend({ places, types, disciplines });
  } catch (e) {
    failure = e instanceof BackendError ? e : new BackendError("internal", FRIENDLY.internal);
  }

  return (
    <div className="wrap">
      <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)" }}>Your opportunities</h1>
      <div className="summary" aria-label="Your choices">
        {disciplines.map((d) => <span className="pill" key={d}>{DISCIPLINE_LABEL[d]}</span>)}
        {places.map((p) => <span className="pill" key={p}>{placeLabel(p)}</span>)}
        {types.map((t) => <span className="pill" key={t}>{TYPE_LABEL[t]}</span>)}
        <Link href={editHref} className="btn btn-ghost btn-small">Change</Link>
      </div>

      {failure && (
        <div className="empty stack" role="alert" style={{ marginTop: 24 }}>
          <h2>We couldn&apos;t get your results</h2>
          <p>{failure.message}</p>
          {failure.code === "unreachable" && process.env.NODE_ENV !== "production" && (
            <p className="hint">Dev: start the local results service with <code>npm run backend:local</code> in <code>web/</code>, or set <code>BACKEND_URL</code>.</p>
          )}
          <Link className="btn" href={`/results?${new URLSearchParams({ d: disciplines.join(","), t: types.join(","), p: places.join(",") })}`}>Try again</Link>
        </div>
      )}

      {out && (
        <>
          {disciplines.length > 0 && (
            <p className="notice">
              You picked {disciplines.map((d) => DISCIPLINE_LABEL[d]).join(", ")}. The results service doesn&apos;t narrow by discipline yet, so
              these lists aren&apos;t filtered to it. Use the details on each card to judge the fit.
            </p>
          )}
          {out.warnings.map((w) => <p className="notice" key={w}>{w}</p>)}

          {out.groups.map((g) => (
            <section className="group" key={g.type} aria-labelledby={`h-${g.type}`}>
              <div className="group-head">
                <h2 id={`h-${g.type}`}>{TYPE_LABEL[g.type]}</h2>
                <span className="group-meta">{g.tier === 3 ? "Nothing found" : TIER_NOTE[g.tier]}</span>
              </div>
              {g.cards.length ? (
                <div className="cards">
                  {g.cards.map((c) => <ResultCard key={c.key} card={c} />)}
                </div>
              ) : (
                <div className="empty stack">
                  <p>{g.reason}</p>
                  <p className="hint">Try adding another place, like Tri-state, or another kind of opportunity. We never widen a search without you.</p>
                  <Link className="btn btn-ghost btn-small" href={editHref}>Change my choices</Link>
                </div>
              )}
              {g.removed && <p className="removed">{g.removed}</p>}
            </section>
          ))}

          <details className="how">
            <summary>How were these chosen?</summary>
            <div className="stack">
              <p className="muted-dk">
                Listings are filtered by place and type, expired and incomplete ones are dropped, and the best fits are put first. Snapshot{" "}
                {out.snapshotId}, checked against {out.asOf}. If something looks wrong, quote the request id.
              </p>
              <ul className="muted-dk">
                {out.calls.map((c) => (
                  <li key={`${c.place}-${c.type}`}>
                    {placeLabel(c.place)} · {TYPE_LABEL[c.type]}:{" "}
                    {c.ok ? `tier ${c.tier}, ${c.count} results, request ${c.requestId}` : `failed (${c.error})`}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
