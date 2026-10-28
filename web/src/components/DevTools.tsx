"use client";

import { useEffect, useState } from "react";
import Playback from "./Playback";
import ResultCard from "./ResultCard";
import { framesFor, SAVED_RUNS } from "@/lib/runs";
import { BOROUGHS, DISCIPLINES, PLACE_GROUPS, placeLabel, TYPE_LABEL, TYPES } from "@/lib/taxonomy";
import type { Frame, SearchOutput } from "@/lib/types";

type Choice = { disciplines: string[]; types: string[]; places: string[] };

const PERSONAS: { name: string; about: string; c: Choice }[] = [
  { name: "Comedian + musician, Brooklyn", about: "Open calls and events", c: { disciplines: ["comedy", "music"], types: ["open_call", "event"], places: ["brooklyn"] } },
  { name: "Dancer, Manhattan + Queens", about: "Open calls, events, grants", c: { disciplines: ["dance"], types: ["open_call", "event", "grant"], places: ["manhattan", "queens"] } },
  { name: "Visual artist, tri-state", about: "Grants, residencies, open calls", c: { disciplines: ["visual"], types: ["grant", "residency", "open_call"], places: ["tristate"] } },
  { name: "Writer, anywhere in NYC", about: "Open calls, grants, events", c: { disciplines: ["writing"], types: ["open_call", "grant", "event"], places: ["nyc"] } },
  { name: "Multidisciplinary, Bronx + Staten Island", about: "Everything", c: { disciplines: ["music", "visual", "film"], types: ["open_call", "grant", "residency", "event", "job"], places: ["bronx", "staten_island"] } },
];

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function framesForSearch(c: Choice, out: SearchOutput): Frame[] {
  const frames: Frame[] = [
    {
      kind: "request",
      title: "Request",
      lines: [
        `Places: ${c.places.map(placeLabel).join(", ")}`,
        `Looking for: ${c.types.map((t) => TYPE_LABEL[t]).join(", ")}`,
        `Disciplines: ${c.disciplines.length ? c.disciplines.join(", ") : "any"}${c.disciplines.length ? " (not applied: the results service has no discipline filter yet)" : ""}`,
        `The service takes one place and one type per call, so this makes ${out.calls.length} call${out.calls.length === 1 ? "" : "s"}`,
        `Snapshot ${out.snapshotId}, as of ${out.asOf}`,
      ],
    },
  ];
  for (const call of out.calls) {
    frames.push({
      kind: "call",
      title: `Call: ${placeLabel(call.place)} · ${TYPE_LABEL[call.type]}`,
      lines: call.ok
        ? [`Tier ${call.tier} · ${call.count} result${call.count === 1 ? "" : "s"}`, call.removed ?? "Nothing removed", `Request id ${call.requestId}`]
        : [`Failed: ${call.error}`],
    });
  }
  for (const g of out.groups) {
    frames.push({
      kind: "result",
      title: `Merged: ${TYPE_LABEL[g.type]}`,
      tier: g.tier,
      lines: g.cards.length ? g.cards.map((card) => `${card.title} · ${card.label}`) : [g.reason ?? "No match"],
    });
  }
  return frames;
}

export default function DevTools() {
  const [health, setHealth] = useState<{ ok: boolean; url: string } | null>(null);
  const [runId, setRunId] = useState(SAVED_RUNS[0].id);
  const [choice, setChoice] = useState<Choice>(PERSONAS[0].c);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ n: number; choice: Choice; out?: SearchOutput; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/search").then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false, url: "" }));
  }, []);

  async function run(c: Choice) {
    setChoice(c);
    setBusy(true);
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ places: c.places, types: c.types, disciplines: c.disciplines }) });
      const body = await res.json();
      setLive((prev) => ({ n: (prev?.n ?? 0) + 1, choice: c, ...(res.ok ? { out: body as SearchOutput } : { error: body.message ?? "Failed" }) }));
    } catch {
      setLive((prev) => ({ n: (prev?.n ?? 0) + 1, choice: c, error: "Couldn't reach the app server." }));
    } finally {
      setBusy(false);
    }
  }

  const saved = SAVED_RUNS.find((r) => r.id === runId)!;
  return (
    <div className="wrap">
      <p><span className="dev-tag">Dev tools</span></p>
      <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)", marginTop: 8 }}>Watch a run play out</h1>
      <p className="muted-dk" style={{ marginTop: 8 }}>
        Replay a saved test run step by step, or run a persona through the real results service. Nothing here spends model tokens.
      </p>

      <section className="group">
        <h2>Saved test runs</h2>
        <p className="muted-dk">Claude Code answered each model call by hand in these (no API tokens). The pipeline around it is Jon&apos;s real code.</p>
        <div className="dev-grid">
          <div className="run-list" role="group" aria-label="Saved runs">
            {SAVED_RUNS.map((r) => (
              <button key={r.id} className="run-btn" aria-pressed={runId === r.id} onClick={() => setRunId(r.id)}>
                {r.name}
                <small>{placeLabel(r.request.place)} · {TYPE_LABEL[r.request.type]} · tier {r.tier}</small>
              </button>
            ))}
          </div>
          <div>
            <p className="notice" style={{ marginTop: 0 }}>{saved.story}</p>
            <Playback key={saved.id} frames={framesFor(saved)} />
          </div>
        </div>
      </section>

      <section className="group">
        <div className="group-head">
          <h2>Run a persona</h2>
          <span className="group-meta">
            Results service: {health === null ? "checking…" : health.ok ? `connected (${health.url})` : "not reachable. Run npm run backend:local in web/"}
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
              <b>Disciplines</b>
              <div className="chips tight">
                {DISCIPLINES.map((d) => (
                  <button key={d.id} className="chip" aria-pressed={choice.disciplines.includes(d.id)} onClick={() => setChoice({ ...choice, disciplines: toggle(choice.disciplines, d.id) })}>{d.label}</button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <b>Looking for</b>
              <div className="chips tight">
                {TYPES.map((t) => (
                  <button key={t.id} className="chip" aria-pressed={choice.types.includes(t.id)} onClick={() => setChoice({ ...choice, types: toggle(choice.types, t.id) })}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <b>Where</b>
              <div className="chips tight">
                {[...BOROUGHS, ...PLACE_GROUPS].map((p) => (
                  <button key={p.id} className="chip" aria-pressed={choice.places.includes(p.id)} onClick={() => setChoice({ ...choice, places: toggle(choice.places, p.id) })}>{p.label}</button>
                ))}
              </div>
            </div>
            <button className="btn" disabled={busy || !choice.places.length || !choice.types.length} onClick={() => run(choice)}>
              {busy ? "Running…" : "Run this"}
            </button>
          </div>
          <div>
            {!live && <p className="empty">Pick a persona to run it. Each step the service took will appear here.</p>}
            {live?.error && <p className="empty" role="alert">{live.error}</p>}
            {live?.out && (
              <>
                <Playback key={live.n} frames={framesForSearch(live.choice, live.out)} />
                <div className="stack" style={{ marginTop: 24 }}>
                  {live.out.groups.map((g) => (
                    <div key={g.type}>
                      <h3 style={{ margin: "16px 0 10px" }}>{TYPE_LABEL[g.type]}</h3>
                      <div className="cards">{g.cards.map((c) => <ResultCard key={c.key} card={c} />)}</div>
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
