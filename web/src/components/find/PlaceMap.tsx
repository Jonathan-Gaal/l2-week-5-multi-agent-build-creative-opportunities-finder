"use client";

import type { KeyboardEvent } from "react";
import type { MetaResponse } from "@api/types";
import s from "./FindFlow.module.css";

/** The stylised map from the "Tap the map" board: the five boroughs, with the tri-state ring around them. */
const BOROUGHS: { id: string; points: string; text: { x: number; y: number; rotate?: number; big?: boolean } }[] = [
  { id: "bronx", points: "285,110 300,150 330,130 400,100 370,50 290,60", text: { x: 340, y: 95 } },
  { id: "manhattan", points: "250,120 285,110 300,150 285,260 265,330 240,340 232,290 245,200", text: { x: 266, y: 235, rotate: -80 } },
  { id: "queens", points: "305,150 335,135 430,125 520,175 505,265 410,305 335,300 292,262", text: { x: 415, y: 215, big: true } },
  { id: "brooklyn", points: "265,335 292,265 335,300 410,308 400,380 330,420 270,400 245,360", text: { x: 330, y: 365, big: true } },
  { id: "staten_island", points: "110,380 190,350 225,400 200,470 130,480 95,430", text: { x: 155, y: 425 } },
];

const RINGS = [
  { d: "M20 190 L120 120 L150 330 L90 420 L25 360 Z", label: "NEW JERSEY", x: 68, y: 262 },
  { d: "M250 18 L420 8 L470 60 L330 70 L270 55 Z", label: "WESTCHESTER & CT", x: 345, y: 42 },
  { d: "M525 150 L610 170 L625 245 L540 285 L515 225 Z", label: "LONG ISLAND", x: 572, y: 218 },
  { d: "M430 330 L600 300 L620 360 L470 400 Z", label: "LONG ISLAND", x: 528, y: 362 },
];

const press = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

export default function PlaceMap({ meta, places, onToggle }: { meta: MetaResponse; places: string[]; onToggle: (id: string) => void }) {
  const on = (id: string) => places.includes(id);
  const label = (id: string) => meta.boroughs.find((b) => b.value === id)?.label ?? id;

  return (
    <>
      <div className={s.mapTop} role="group" aria-label="Wider areas">
        {meta.place_groups.map((g, i) => (
          <button
            key={g.value}
            type="button"
            className={`${s.chip} ${s.lime}`}
            style={{ ["--tilt" as string]: `${[-1.5, 1, -1][i % 3]}deg` }}
            aria-pressed={on(g.value)}
            title={g.hint}
            onClick={() => onToggle(g.value)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <svg viewBox="0 0 640 600" className={s.svg} role="group" aria-label="Map of the five boroughs with the tri-state area around them. Tap a place to pick it.">
        {RINGS.map((r, i) => (
          <g
            key={i}
            className={s.ring}
            role="button"
            tabIndex={0}
            aria-pressed={on("tristate")}
            aria-label={`${meta.place_groups.find((g) => g.value === "tristate")?.label ?? "Tri-state"} (${r.label.toLowerCase()})`}
            onClick={() => onToggle("tristate")}
            onKeyDown={press(() => onToggle("tristate"))}
          >
            <path d={r.d} />
            <text className={s.ringText} x={r.x} y={r.y}>
              {r.label}
            </text>
          </g>
        ))}
        {BOROUGHS.map((b) => (
          <g key={b.id} className={s.zone} role="button" tabIndex={0} aria-pressed={on(b.id)} aria-label={label(b.id)} onClick={() => onToggle(b.id)} onKeyDown={press(() => onToggle(b.id))}>
            <polygon points={b.points} />
            <text
              className={`${s.zoneText} ${b.text.big ? s.zoneTextBig : ""}`}
              x={b.text.x}
              y={b.text.y}
              transform={b.text.rotate ? `rotate(${b.text.rotate} ${b.text.x} ${b.text.y})` : undefined}
            >
              {label(b.id)}
            </text>
          </g>
        ))}
      </svg>
      <p className={s.legend}>Lime = picked &nbsp;·&nbsp; Pink dashes = tri-state ring</p>
    </>
  );
}
