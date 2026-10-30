"use client";

import { useState, type KeyboardEvent } from "react";
import type { MetaResponse } from "@api/types";
import { GROUP_IDS, type PlaceGroup, groupState, placeOn } from "@/lib/places";
import s from "./FindFlow.module.css";

/** The stylised map from the "Tap the map" board: the five boroughs, with a dashed shape around them for every other place in the data. */
const BOROUGHS: { id: string; points: string; text: { x: number; y: number; rotate?: number; big?: boolean } }[] = [
  { id: "bronx", points: "285,110 300,150 330,130 400,100 370,50 290,60", text: { x: 340, y: 95 } },
  { id: "manhattan", points: "250,120 285,110 300,150 285,260 265,330 240,340 232,290 245,200", text: { x: 266, y: 235, rotate: -80 } },
  { id: "queens", points: "305,150 335,135 430,125 520,175 505,265 410,305 335,300 292,262", text: { x: 415, y: 215, big: true } },
  { id: "brooklyn", points: "265,335 292,265 335,300 410,308 400,380 330,420 270,400 245,360", text: { x: 330, y: 365, big: true } },
  { id: "staten_island", points: "110,380 190,350 225,400 200,470 130,480 95,430", text: { x: 155, y: 425 } },
];

/** Each outer shape is drawn a little smaller than its outline, so there is air between neighbours. */
const SHRINK = 0.91;
const centroid = (d: string): [number, number] => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  let x = 0;
  let y = 0;
  for (let i = 0; i < n.length; i += 2) {
    x += n[i];
    y += n[i + 1];
  }
  const count = n.length / 2;
  return [x / count, y / count];
};
const shrinkAbout = (d: string) => {
  const [cx, cy] = centroid(d);
  return `translate(${cx} ${cy}) scale(${SHRINK}) translate(${-cx} ${-cy})`;
};

/** The boroughs sit a little lower than the shapes along the top, so the two do not touch. */
const NYC_DROP = 16;

type Ring = { id: string; group: "tri" | "wide"; paths: string[]; labels: { text: string; x: number; y: number }[]; small?: boolean; dy?: number };
const RINGS: Ring[] = [
  { id: "new_jersey", group: "tri", paths: ["M20 190 L120 120 L150 330 L90 420 L25 360 Z"], labels: [{ text: "NEW JERSEY", x: 68, y: 262 }] },
  { id: "upstate_ny", group: "tri", paths: ["M20 22 L235 14 L240 82 L130 100 L25 92 Z"], labels: [{ text: "UPSTATE NY", x: 125, y: 58 }] },
  { id: "westchester_hudson", group: "tri", small: true, paths: ["M250 18 L338 14 L346 66 L268 70 Z"], labels: [{ text: "WESTCHESTER", x: 298, y: 36 }, { text: "& HUDSON", x: 298, y: 49 }] },
  { id: "connecticut", group: "tri", small: true, paths: ["M356 12 L470 8 L480 58 L362 68 Z"], labels: [{ text: "CONNECTICUT", x: 418, y: 42 }] },
  {
    id: "long_island",
    group: "tri",
    dy: NYC_DROP,
    paths: ["M525 150 L610 170 L625 245 L620 360 L470 400 L430 330 L540 300 L540 285 L515 225 Z"],
    labels: [{ text: "LONG ISLAND", x: 552, y: 348 }],
  },
  { id: "vermont", group: "wide", small: true, paths: ["M484 10 L516 10 L518 62 L486 64 Z"], labels: [{ text: "VT", x: 501, y: 40 }] },
  { id: "new_hampshire", group: "wide", small: true, paths: ["M524 10 L556 10 L558 62 L526 64 Z"], labels: [{ text: "NH", x: 541, y: 40 }] },
  { id: "maine", group: "wide", small: true, paths: ["M564 8 L632 12 L628 62 L566 64 Z"], labels: [{ text: "ME", x: 598, y: 40 }] },
  { id: "massachusetts", group: "wide", small: true, paths: ["M486 72 L596 72 L606 118 L490 124 Z"], labels: [{ text: "MASS.", x: 543, y: 102 }] },
  { id: "rhode_island", group: "wide", small: true, paths: ["M606 74 L636 76 L634 120 L612 122 Z"], labels: [{ text: "RI", x: 622, y: 102 }] },
  { id: "pennsylvania", group: "wide", paths: ["M5 445 L78 438 L82 520 L38 590 L5 580 Z"], labels: [{ text: "PA", x: 40, y: 520 }] },
  { id: "maryland", group: "wide", paths: ["M105 506 L238 502 L246 588 L112 594 Z"], labels: [{ text: "MARYLAND", x: 175, y: 550 }] },
  { id: "dc", group: "wide", paths: ["M256 516 L322 512 L324 588 L260 592 Z"], labels: [{ text: "DC", x: 290, y: 556 }] },
];

const press = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

const TILTS = [-1.5, 1, -1];
const GROUP_TITLES: { group: PlaceGroup; title: string }[] = [
  { group: "nyc", title: "New York City" },
  { group: "tri", title: "Tri-state area" },
  { group: "wide", title: "Wider Northeast & DC" },
];

const labelOf = (meta: MetaResponse, id: string) => [...meta.boroughs, ...meta.regions].find((p) => p.value === id)?.label ?? id;
/** The chip text for a place; the longest names are shortened to fit. */
const chipText = (meta: MetaResponse, id: string) => (id === "westchester_hudson" ? "Westchester & Hudson" : labelOf(meta, id));

export default function PlaceMap({ meta, places, onToggle }: { meta: MetaResponse; places: string[]; onToggle: (id: string) => void }) {
  return (
    <>
      <svg viewBox="0 0 640 600" className={s.svg} role="group" aria-label="Map of the five boroughs with every other place around them. Tap a place to pick it or drop it.">
        <defs>
          {/* Thin stripes for the places that are not picked, in the colour each turns when picked. A see-through tint over the dark purple turns muddy, stripes stay clean. */}
          <pattern id="nycStripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#dcfc05" strokeWidth="2.5" opacity="0.7" />
          </pattern>
          <pattern id="triStripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#fd1a99" strokeWidth="2.5" opacity="0.7" />
          </pattern>
          <pattern id="wideStripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#fef9ef" strokeWidth="2.5" opacity="0.6" />
          </pattern>
        </defs>
        {RINGS.map((r) => {
          const on = places.includes(r.id);
          return (
            <g
              key={r.id}
              className={s.ring}
              data-group={r.group}
              transform={r.dy ? `translate(0 ${r.dy})` : undefined}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={labelOf(meta, r.id)}
              onClick={() => onToggle(r.id)}
              onKeyDown={press(() => onToggle(r.id))}
            >
              {r.paths.map((d) => (
                <path key={d} d={d} transform={shrinkAbout(d)} />
              ))}
              {r.labels.map((l) => (
                <text key={`${l.x},${l.y}`} className={`${s.ringText} ${r.small ? s.ringTextSmall : ""}`} x={l.x} y={l.y}>
                  {l.text}
                </text>
              ))}
            </g>
          );
        })}
        <g transform={`translate(0 ${NYC_DROP})`}>
          {BOROUGHS.map((b) => (
            <g
              key={b.id}
              className={s.zone}
              role="button"
              tabIndex={0}
              aria-pressed={placeOn(places, b.id)}
              aria-label={labelOf(meta, b.id)}
              onClick={() => onToggle(b.id)}
              onKeyDown={press(() => onToggle(b.id))}
            >
              <polygon points={b.points} />
              <text
                className={`${s.zoneText} ${b.text.big ? s.zoneTextBig : ""}`}
                x={b.text.x}
                y={b.text.y}
                transform={b.text.rotate ? `rotate(${b.text.rotate} ${b.text.x} ${b.text.y})` : undefined}
              >
                {labelOf(meta, b.id)}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <ul className={s.legend} aria-label="Map key">
        <li>
          <i className={`${s.swatch} ${s.swLime}`} aria-hidden="true" /> NYC
        </li>
        <li>
          <i className={`${s.swatch} ${s.swPink}`} aria-hidden="true" /> Tri-State
        </li>
        <li>
          <i className={`${s.swatch} ${s.swCream}`} aria-hidden="true" /> Northeast
        </li>
      </ul>
    </>
  );
}

/**
 * Every place as a poster chip, grouped like the map. Each group folds away. New York City starts open; the other two
 * start folded unless something in them is already picked. The arrow folds a group; the title opens a folded group and,
 * once it is open, picks (or drops) everything in it.
 */
export function PlaceChips({
  meta,
  places,
  onToggle,
  onToggleGroup,
}: {
  meta: MetaResponse;
  places: string[];
  onToggle: (id: string) => void;
  onToggleGroup: (group: PlaceGroup) => void;
}) {
  const [open, setOpen] = useState<Record<PlaceGroup, boolean>>(() => ({
    nyc: true,
    tri: GROUP_IDS.tri.some((id) => places.includes(id)),
    wide: GROUP_IDS.wide.some((id) => places.includes(id)),
  }));

  return (
    <div className={s.placeGroups}>
      {GROUP_TITLES.map(({ group, title }) => {
        const picked = GROUP_IDS[group].filter((id) => placeOn(places, id)).length;
        const shown = open[group];
        return (
          <div key={group}>
            <h2 className={`${s.groupTitle} ${s.foldRow}`}>
              <button type="button" className={s.foldBtn} aria-expanded={shown} aria-controls={`places-${group}`} aria-label={`${shown ? "Fold" : "Open"} ${title}`} onClick={() => setOpen({ ...open, [group]: !shown })}>
                {shown ? "▾" : "▸"}
              </button>
              <button
                type="button"
                className={`${s.foldBtn} ${s.foldTitle}`}
                data-open={shown}
                data-group={group}
                data-all={groupState(places, group) === "true"}
                aria-label={shown ? `${groupState(places, group) === "true" ? "Drop" : "Pick"} everything in ${title}` : `Open ${title}`}
                onClick={() => (shown ? onToggleGroup(group) : setOpen({ ...open, [group]: true }))}
              >
                {title}
              </button>
              {!shown && picked > 0 && <span className={s.foldCount}>{picked} picked</span>}
            </h2>
            {shown && (
              <div id={`places-${group}`} className={`${s.chips} ${s.chipsTight}`} role="group" aria-label={title}>
                {GROUP_IDS[group].map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    className={`${s.chip} ${s.placeChip} ${group === "nyc" ? s.pNyc : group === "tri" ? s.pTri : s.pWide} ${s.chipSmall}`}
                    style={{ ["--tilt" as string]: `${TILTS[i % TILTS.length]}deg` }}
                    aria-pressed={placeOn(places, id)}
                    onClick={() => onToggle(id)}
                  >
                    {chipText(meta, id)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
