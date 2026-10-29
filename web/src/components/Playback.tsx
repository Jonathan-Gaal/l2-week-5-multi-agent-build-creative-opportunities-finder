"use client";

import { useEffect, useState } from "react";
import FrameView from "./FrameView";
import type { Frame } from "@/lib/types";

const SPEEDS = [
  { label: "Slow", ms: 2200 },
  { label: "Normal", ms: 1300 },
  { label: "Fast", ms: 500 },
];

/** Plays a run one step at a time. Remount it (change its key) to start a new run. */
export default function Playback({ frames, autoplay = true }: { frames: Frame[]; autoplay?: boolean }) {
  const [shown, setShown] = useState(autoplay ? 1 : frames.length);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing || shown >= frames.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, shown, speed, frames.length]);

  const done = shown >= frames.length;
  return (
    <div>
      <div className="controls" role="group" aria-label="Playback controls">
        <button className="btn btn-small" onClick={() => (done ? (setShown(1), setPlaying(true)) : setPlaying(!playing))}>
          {done ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <button className="btn btn-ghost btn-small" disabled={done} onClick={() => { setPlaying(false); setShown((n) => Math.min(n + 1, frames.length)); }}>
          Next step
        </button>
        <button className="btn btn-ghost btn-small" disabled={done} onClick={() => { setPlaying(false); setShown(frames.length); }}>
          Show all
        </button>
        <span className="chips tight" role="group" aria-label="Speed">
          {SPEEDS.map((s, i) => (
            <button key={s.label} className="chip" aria-pressed={speed === i} onClick={() => setSpeed(i)}>
              {s.label}
            </button>
          ))}
        </span>
        <span className="hint">Step {Math.min(shown, frames.length)} of {frames.length}</span>
      </div>
      <div aria-live="polite">
        {frames.slice(0, shown).map((f, i) => (
          <FrameView key={i} frame={f} />
        ))}
      </div>
    </div>
  );
}
