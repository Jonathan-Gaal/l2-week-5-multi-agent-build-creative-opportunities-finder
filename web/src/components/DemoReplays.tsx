"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { demoKey } from "@/lib/demoPresets";
import s from "./DemoReplays.module.css";

type Demo = { name: string; url: string; href: string; top: string[] };

/** Both entry points use the same saved runs and the existing cursor replay flow. */
export default function DemoReplays({ panel = false }: { panel?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [runs, setRuns] = useState<Demo[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/demo-runs", { cache: "no-store", signal: controller.signal })
      .then((r) => r.ok ? r.json() as Promise<Demo[]> : [])
      .then(setRuns).catch(() => {});
    return () => controller.abort();
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const visible = panel ? runs.filter((r) => demoKey(r.url) !== demoKey(`/results?${params}`)) : runs;
  if (!visible.length) return null;
  const list = (
    <ul className={s.list} aria-label={panel ? "More demos" : "Saved demo replays"}>
      {visible.map((r) => <li key={r.href}>
        <button type="button" onClick={() => { setOpen(false); router.push(r.href); }}>
          <strong>{r.name}</strong>
          <span>{r.top.join(" · ")}</span>
        </button>
      </li>)}
    </ul>
  );
  return (
    <div ref={box} className={panel ? s.panel : s.menu}>
      {panel ? <><h2>More demos</h2>{list}</> : <>
        <button type="button" className={s.trigger} aria-expanded={open} aria-controls="demo-replay-options" onClick={() => setOpen(!open)}>Replay a demo <span aria-hidden="true">▾</span></button>
        {open && <div id="demo-replay-options" className={s.dropdown}>{list}</div>}
      </>}
    </div>
  );
}
