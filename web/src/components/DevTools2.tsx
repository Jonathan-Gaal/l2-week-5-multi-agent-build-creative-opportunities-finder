"use client";

import { useEffect, useState } from "react";
import Playback from "./Playback";
import ResultCard from "./ResultCard";
import type { MetaResponse } from "@api/types";
import { soonestFirst } from "@/lib/cards";
import { type Labels, labelsFor } from "@/lib/taxonomy";
import runsV2 from "@/data/runs-v2.json";
import { framesFor as savedFramesFor } from "@/lib/runs";
import type { Frame, SavedRun, SearchOutput } from "@/lib/types";
import { TYPE_PILLS, narrowCards, subtypeTokens, typesOf } from "@/lib/typePills";

/** `types` is used when no pills are picked (Jon's searches ask by broad type only). */
type Choice = { disciplines: string[]; pills: string[]; types: string[]; places: string[] };

/** Jon's six saved test searches (same place and type, as of 2026-10-28), here run live through this version of the code. */
const SAVED_V2 = runsV2 as unknown as SavedRun[];

const PERSONAS: { name: string; about: string; c: Choice }[] = [
  { name: "Brooklyn open calls", about: "Jon's run c1", c: { disciplines: [], pills: [], types: ["open_call"], places: ["brooklyn"] } },
  { name: "Manhattan grants", about: "Jon's run c2", c: { disciplines: [], pills: [], types: ["grant"], places: ["manhattan"] } },
  { name: "Queens events", about: "Jon's run c3", c: { disciplines: [], pills: [], types: ["event"], places: ["queens"] } },
  { name: "Staten Island jobs", about: "Jon's run c4 (found nothing then)", c: { disciplines: [], pills: [], types: ["job"], places: ["staten_island"] } },
  { name: "Brooklyn open calls (again)", about: "Jon's run a01, the same search as c1", c: { disciplines: [], pills: [], types: ["open_call"], places: ["brooklyn"] } },
  { name: "Manhattan jobs", about: "Jon's run a04", c: { disciplines: [], pills: [], types: ["job"], places: ["manhattan"] } },
];

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** The best of each list in turn, until there are `n` (the results page's ranked list). */
function inTurns<T>(lists: readonly (readonly T[])[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < n && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < n) out.push(l[i]!);
  }
  return out;
}

function framesFor(c: Choice, out: SearchOutput, labels: Labels): Frame[] {
  const pillLabel = (id: string) => TYPE_PILLS.find((p) => p.id === id)?.label ?? id;
  const kinds = subtypeTokens(c.pills);
  const lists = out.groups.map((g) => narrowCards(g.type, g.cards, c.pills) ?? g.cards);
  const picks = inTurns(lists, 5);
  const keys = new Set(picks.map((p) => p.key));
  const rest = soonestFirst([...lists.flat().filter((x) => !keys.has(x.key)), ...out.groups.flatMap((g) => g.more)]);
  const frames: Frame[] = [
    {
      kind: "request",
      title: "Request (your find flow)",
      lines: [
        `Places: ${c.places.map(labels.place).join(", ")}`,
        `Looking for: ${(c.pills.length ? c.pills.map(pillLabel) : c.types.map(labels.type)).join(", ")}`,
        `Artist types: ${c.disciplines.length ? c.disciplines.map(labels.discipline).join(", ") : "any"}`,
        `Snapshot ${out.snapshotId}, as of ${out.asOf}`,
      ],
    },
    {
      kind: "call",
      title: "Pills become broad types plus kinds",
      lines: [
        `Broad types the service is asked for: ${(c.pills.length ? typesOf(c.pills) : c.types).map(labels.type).join(", ")}`,
        `Kinds kept before ranking: ${kinds.length ? kinds.join(", ") : "all kinds (no limit)"}`,
        `GET /api/search?${out.query}`,
      ],
    },
  ];
  out.groups.forEach((g, i) => {
    const call = out.calls[i];
    frames.push({
      kind: "result",
      title: `${labels.type(g.type)} · tier ${g.tier}`,
      tier: g.tier,
      lines: [
        ...(g.cards.length ? g.cards.map((card) => `${card.title} · ${card.label}`) : [g.reason ?? "No match"]),
        `${g.total} listings fit in all`,
        g.removed ?? "Nothing removed",
        `Request id ${call?.requestId ?? "?"}`,
      ],
    });
  });
  frames.push({
    kind: "result",
    title: "Your page: what you would see",
    tier: 0,
    lines: [
      `Top ${picks.length} ranked list (best of each type in turn):`,
      ...picks.map((p, i) => `${i + 1}. ${p.title} · ${p.tag}${p.subtag ? ` | ${p.subtag}` : ""}`),
      `More matches: ${rest.length} listings, soonest first`,
      `Expired and removed: ${out.groups.reduce((n, g) => n + g.expired.length, 0)}`,
    ],
  });
  return frames;
}

/** /dev2: the same live search as /dev, but asked the way your find flow asks it (pills and kinds). */
export default function DevTools2({ meta }: { meta: MetaResponse | null }) {
  const labels = labelsFor(meta);
  const [runId, setRunId] = useState(SAVED_V2[0].id);
  const [health, setHealth] = useState<{ ok: boolean } | null>(null);
  const [choice, setChoice] = useState<Choice>(PERSONAS[0].c);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ n: number; choice: Choice; out?: SearchOutput; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/search").then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  async function run(c: Choice) {
    setChoice(c);
    setBusy(true);
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ places: c.places, types: c.types, pills: c.pills, disciplines: c.disciplines }) });
      const body = await res.json();
      setLive((prev) => ({ n: (prev?.n ?? 0) + 1, choice: c, ...(res.ok ? { out: body as SearchOutput } : { error: body.message ?? "Failed" }) }));
    } catch {
      setLive((prev) => ({ n: (prev?.n ?? 0) + 1, choice: c, error: "Couldn't reach the app server." }));
    } finally {
      setBusy(false);
    }
  }

  const saved = SAVED_V2.find((r) => r.id === runId)!;
  return (
    <div className="wrap">
      <p><span className="dev-tag">Dev tools 2</span></p>
      <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)", marginTop: 8 }}>Jon&apos;s test searches, run through your version</h1>
      <p className="muted-dk" style={{ marginTop: 8 }}>
        The same six searches as the saved runs on /dev, run live through your code: the new data, your filters, and your top 5 plus more matches. You can also build one with your eleven choices below. Local settings use the code ranker, so no model tokens are spent.
      </p>

      <section className="group">
        <h2>Saved test runs, your version</h2>
        <p className="muted-dk">The same six searches as Jon&apos;s saved runs, run through your code on the November 1 data. Claude Code answered each Ranker and Reviewer call by hand (no API tokens).</p>
        <div className="dev-grid">
          <div className="run-list" role="group" aria-label="Saved runs, your version">
            {SAVED_V2.map((r) => (
              <button key={r.id} className="run-btn" aria-pressed={runId === r.id} onClick={() => setRunId(r.id)}>
                {r.name}
                <small>{labels.place(r.request.place)} · {labels.type(r.request.type)} · tier {r.tier}</small>
              </button>
            ))}
          </div>
          <div>
            <p className="notice" style={{ marginTop: 0 }}>{saved.story}</p>
            <Playback key={saved.id} frames={savedFramesFor(saved, labels)} />
          </div>
        </div>
      </section>

      <section className="group">
        <div className="group-head">
          <h2>Run a live search</h2>
          <span className="group-meta">
            Results service: {health === null ? "checking…" : health.ok ? "ready" : "not set up"}
          </span>
        </div>
        <div className="dev-grid">
          <div className="run-list">
            <p className="dev-list-title">Quick personas</p>
            {PERSONAS.map((p) => (
              <button key={p.name} className="run-btn" disabled={busy} onClick={() => run(p.c)}>
                {p.name}
                <small>{p.about}</small>
              </button>
            ))}
            <p className="dev-list-title">Or build your own</p>
            <div className="form-row">
              <b>Artist types</b>
              <div className="chips tight">
                {(meta?.disciplines ?? []).map((d) => (
                  <button key={d.value} className="chip" aria-pressed={choice.disciplines.includes(d.value)} onClick={() => setChoice({ ...choice, disciplines: toggle(choice.disciplines, d.value) })}>{d.label}</button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <b>Looking for</b>
              <div className="chips tight">
                {TYPE_PILLS.map((p) => (
                  <button key={p.id} className="chip" aria-pressed={choice.pills.includes(p.id)} onClick={() => setChoice({ ...choice, types: [], pills: toggle(choice.pills, p.id) })}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <b>Where</b>
              <div className="chips tight">
                {[...(meta?.boroughs ?? []), ...(meta?.place_groups ?? [])].map((p) => (
                  <button key={p.value} className="chip" aria-pressed={choice.places.includes(p.value)} onClick={() => setChoice({ ...choice, places: toggle(choice.places, p.value) })}>{p.label}</button>
                ))}
              </div>
            </div>
            <button className="btn" disabled={busy || !choice.places.length || !(choice.pills.length || choice.types.length)} onClick={() => run(choice)}>
              {busy ? "Running…" : "Run this"}
            </button>
          </div>
          <div>
            {!live && <p className="empty">Pick a persona to run it. Each step will appear here.</p>}
            {live?.error && <p className="empty" role="alert">{live.error}</p>}
            {live?.out && (
              <>
                <Playback key={live.n} frames={framesFor(live.choice, live.out, labels)} />
                <div className="stack" style={{ marginTop: 24 }}>
                  {live.out.groups.map((g) => (
                    <div key={g.type}>
                      <h3 style={{ margin: "16px 0 10px" }}>{labels.type(g.type)}</h3>
                      <div className="cards">{(narrowCards(g.type, g.cards, live.choice.pills) ?? g.cards).map((c) => <ResultCard key={c.key} card={c} />)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
