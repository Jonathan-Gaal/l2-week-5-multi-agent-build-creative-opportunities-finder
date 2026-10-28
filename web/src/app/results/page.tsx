import { headers } from "next/headers";
import Link from "next/link";
import BackendFailure from "@/components/BackendFailure";
import ResultCard from "@/components/ResultCard";
import { asBackendError, type BackendError, getMeta, searchBackend, visitorAddress } from "@/lib/backend";
import { labelsFor, pickerChoices, pickIds } from "@/lib/taxonomy";
import type { SearchOutput } from "@/lib/types";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata = { title: "Your opportunities | Artist Atlas" };

const TIER_NOTE: Record<number, string> = {
  0: "Verified: passed the code checks and the reviewer.",
  2: "Not fully checked: the reviewer hasn't signed off on this list, so confirm details on the original page.",
};

export default async function Results({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const raw = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : (v ?? ""));

  let meta;
  try {
    meta = await getMeta();
  } catch (e) {
    const sameSearch = new URLSearchParams({ d: raw(q.d), t: raw(q.t), p: raw(q.p) });
    return (
      <div className="wrap">
        <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)" }}>Your opportunities</h1>
        <BackendFailure title="We couldn't get your results" failure={asBackendError(e)} retryHref={`/results?${sameSearch}`} />
      </div>
    );
  }
  const labels = labelsFor(meta);
  const allowed = pickerChoices(meta);
  const places = pickIds(q.p, allowed.places);
  const types = pickIds(q.t, allowed.types);
  const disciplines = pickIds(q.d, allowed.disciplines);
  const choices = new URLSearchParams({ d: disciplines.join(","), t: types.join(","), p: places.join(",") });
  const editHref = `/find?${choices}`;

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
    out = await searchBackend({ places, types, disciplines }, { visitor: visitorAddress(await headers()), labels });
  } catch (e) {
    failure = asBackendError(e);
  }

  return (
    <div className="wrap">
      <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)" }}>Your opportunities</h1>
      <div className="summary" aria-label="Your choices">
        {disciplines.map((d) => <span className="pill" key={d}>{labels.discipline(d)}</span>)}
        {places.map((p) => <span className="pill" key={p}>{labels.place(p)}</span>)}
        {types.map((t) => <span className="pill" key={t}>{labels.type(t)}</span>)}
        <Link href={editHref} className="btn btn-ghost btn-small">Change</Link>
      </div>

      {failure && <BackendFailure title="We couldn't get your results" failure={failure} retryHref={`/results?${choices}`} />}

      {out && (
        <>

          {out.groups.map((g) => (
            <section className="group" key={g.type} aria-labelledby={`h-${g.type}`}>
              <div className="group-head">
                <h2 id={`h-${g.type}`}>{labels.type(g.type)}</h2>
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
  );
}
