"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MetaResponse } from "@api/types";

type Choice = { disciplines: string[]; types: string[]; places: string[] };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** `meta` is the results service's picker lists (GET /api/meta), loaded on the server. */
export default function FindWizard({ initial, meta }: { initial: Choice; meta: MetaResponse }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [c, setC] = useState<Choice>(initial);

  const steps = [
    { key: "disciplines", ok: true },
    { key: "types", ok: c.types.length > 0 },
    { key: "places", ok: c.places.length > 0 },
  ];

  function finish() {
    const q = new URLSearchParams({ t: c.types.join(","), p: c.places.join(",") });
    if (c.disciplines.length) q.set("d", c.disciplines.join(","));
    router.push(`/results?${q.toString()}`);
  }

  return (
    <div className="wizard">
      <div className="progress" aria-label={`Step ${step + 1} of 3`}>
        {steps.map((s, i) => (
          <span key={s.key} className={i <= step ? "on" : ""} />
        ))}
      </div>

      {step === 0 && (
        <section>
          <h1>What do you make?</h1>
          <p className="sub">Pick everything that fits. Work across disciplines? Pick them all. Not sure, or open to anything? Skip ahead.</p>
          <div className="chips" role="group" aria-label="Disciplines">
            {meta.disciplines.map((d) => (
              <Chip key={d.value} on={c.disciplines.includes(d.value)} onClick={() => setC({ ...c, disciplines: toggle(c.disciplines, d.value) })}>
                {d.label}
              </Chip>
            ))}
          </div>
          <p className="hint">
            {c.disciplines.length ? `${c.disciplines.length} selected. Listings open to any artist are included too.` : "Nothing selected means we won't filter by discipline."}
          </p>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1>What are you looking for?</h1>
          <p className="sub">Choose one or more. We&apos;ll show each kind in its own list.</p>
          <div className="chips" role="group" aria-label="Opportunity types">
            {meta.types.map((t) => (
              <Chip key={t.value} on={c.types.includes(t.value)} onClick={() => setC({ ...c, types: toggle(c.types, t.value) })}>
                {t.label}
                <small>{t.hint}</small>
              </Chip>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1>Where do you want to work?</h1>
          <p className="sub">Pick as many places as you like.</p>
          <h2 className="chip-group-title">Boroughs</h2>
          <div className="chips" role="group" aria-label="Boroughs">
            {meta.boroughs.map((b) => (
              <Chip key={b.value} on={c.places.includes(b.value)} onClick={() => setC({ ...c, places: toggle(c.places, b.value) })}>
                {b.label}
              </Chip>
            ))}
          </div>
          <h2 className="chip-group-title">Or go wider</h2>
          <div className="chips" role="group" aria-label="Wider areas">
            {meta.place_groups.map((g) => (
              <Chip key={g.value} on={c.places.includes(g.value)} onClick={() => setC({ ...c, places: toggle(c.places, g.value) })}>
                {g.label}
                <small>{g.hint}</small>
              </Chip>
            ))}
          </div>
        </section>
      )}

      <div className="wizard-nav">
        {step > 0 ? (
          <button type="button" className="link-btn" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button type="button" className="btn" disabled={!steps[step].ok} onClick={() => setStep(step + 1)}>
            {step === 0 && !c.disciplines.length ? "Skip, I'm open to anything" : "Next"}
          </button>
        ) : (
          <button type="button" className="btn" disabled={!steps[2].ok} onClick={finish}>
            Show my opportunities
          </button>
        )}
      </div>
    </div>
  );
}
