"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import m from "./ResultsMap.module.css";

export type Pin = { key: string; title: string; lat: number; lng: number; top: boolean; n?: number; href: string; approx?: boolean };

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LAND = "#311861";
const WATER = "#0a0518";
// The map never zooms out past the places a visitor can pick (New York, the tri-state area and the rest of the Northeast
// down to DC); zooming in is unlimited. Only those states keep their name on the map.
const AREA: [[number, number], [number, number]] = [[-80.7, 38.4], [-66.4, 47.7]];
const STATES = ["New York", "New Jersey", "Connecticut", "Pennsylvania", "Massachusetts", "Rhode Island", "Vermont", "New Hampshire", "Maine", "Maryland", "District of Columbia", "Delaware"];
const NYC: [number, number] = [-73.97, 40.73];

/** Move the page to a result card and flash it, so a pin and its card are easy to connect. */
function showCard(key: string): boolean {
  const el = document.getElementById(`card-${key}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  el.classList.remove("rcard-flash");
  void el.offsetWidth;
  el.classList.add("rcard-flash");
  window.setTimeout(() => el.classList.remove("rcard-flash"), 3100);
  return true;
}

/** A dark street map: a pink dot for every listing with an address, numbered lime pins for the top picks. */
export default function ResultsMap({ pins, missing }: { pins: Pin[]; missing: number }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // The map is built once for a set of pins and kept while the page changes underneath it (paging "More matches" must not rebuild it).
  const pinsKey = pins.map((p) => `${p.key}:${p.n ?? ""}`).join("|");

  /** Take the visitor to a listing's card: scroll to it here, or move to the page of the list that holds it, without reloading. */
  const goRef = useRef<(p: Pin) => void>(() => {});
  useEffect(() => {
    goRef.current = (p) => {
      if (showCard(p.key)) return;
      router.push(p.href, { scroll: false });
      let tries = 0;
      const wait = window.setInterval(() => {
        if (showCard(p.key) || ++tries > 40) window.clearInterval(wait);
      }, 100);
    };
  }, [router]);

  useEffect(() => {
    if (!box.current || !pins.length) return;
    let map: import("maplibre-gl").Map | undefined;
    let gone = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (gone || !box.current) return;
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new ml.Map({ container: box.current, style: STYLE, center: NYC, zoom: 9.5, minZoom: 5, maxBounds: AREA, attributionControl: { compact: false },
        // Only the + and - buttons zoom. The wheel, a double click, a pinch, a box drag and the keyboard do not (the wheel
        // keeps scrolling the page), and the map never rotates or tilts. Click and drag still moves it around.
        scrollZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, dragRotate: false, touchPitch: false, pitchWithRotate: false,
      });
      map.touchZoomRotate.disable();
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        // Recolor the grey basemap: land in a lighter plum, water in near-black blue-purple, so the shoreline reads clearly.
        const paint = (layer: string, prop: "background-color" | "fill-color", color: string) => map?.getLayer(layer) && map.setPaintProperty(layer, prop, color);
        paint("background", "background-color", LAND);
        for (const l of ["landcover", "park_national_park", "park_nature_reserve", "landuse"]) paint(l, "fill-color", LAND);
        paint("landuse_residential", "fill-color", "rgba(0, 0, 0, 0)");
        paint("water", "fill-color", WATER);
        // Name only the places we cover: state names for those states, bigger and brighter; no countries or other states.
        for (const l of ["place_country_1", "place_country_2", "place_continent"]) if (map?.getLayer(l)) map.setLayoutProperty(l, "visibility", "none");
        if (map?.getLayer("place_state")) {
          map.setFilter("place_state", ["all", ["==", ["get", "kind"], "region"], ["in", ["get", "name"], ["literal", STATES]]]);
          map.setPaintProperty("place_state", "text-color", "#fef9ef");
          map.setPaintProperty("place_state", "text-halo-color", "#1d0f3a");
          map.setPaintProperty("place_state", "text-halo-width", 1.5);
          map.setLayoutProperty("place_state", "text-size", ["interpolate", ["linear"], ["zoom"], 5, 14, 8, 20]);
        }
      });
      const bounds = new ml.LngLatBounds();
      for (const p of pins) bounds.extend([p.lng, p.lat]);
      const drawn: { marker: import("maplibre-gl").Marker; popup: import("maplibre-gl").Popup }[] = [];
      // Pins that would sit on top of each other at this zoom become one numbered pin, so every listing can be reached; it
      // splits apart as the map zooms in. Hovering or clicking a numbered pin lists its listings.
      const draw = () => {
        for (const d of drawn.splice(0)) { d.popup.remove(); d.marker.remove(); }
        // Two pins merge when their boxes touch: a ranked pin is 28px wide, a numbered group 24px, a single listing 12px. Merging
        // repeats until no two pins touch, so a pin never sits half-hidden under its neighbour.
        const pts = pins.map((p) => ({ p, xy: map!.project([p.lng, p.lat]) })).sort((x, y) => Number(y.p.top) - Number(x.p.top));
        type Cluster = { at: { x: number; y: number }; members: Pin[] };
        const clusters: Cluster[] = pts.map(({ p, xy }) => ({ at: xy, members: [p] }));
        const radius = (c: Cluster) => (c.members.some((p) => p.top) ? 14 : c.members.length > 1 ? 12 : 6);
        const touching = (x: Cluster, y: Cluster) => Math.max(Math.abs(x.at.x - y.at.x), Math.abs(x.at.y - y.at.y)) < radius(x) + radius(y);
        for (let merged = true; merged;) {
          merged = false;
          for (let i = 0; i < clusters.length && !merged; i++) {
            for (let j = i + 1; j < clusters.length && !merged; j++) {
              if (!touching(clusters[i]!, clusters[j]!)) continue;
              clusters[i]!.members.push(...clusters[j]!.members);
              clusters.splice(j, 1);
              merged = true;
            }
          }
        }
        // Pink pins first so the numbered lime pins sit on top of them.
        const groups = clusters.map((c) => c.members).sort((x, y) => Number(x.some((p) => p.top)) - Number(y.some((p) => p.top)));
      for (const g of groups) {
        const ranked = g.filter((p) => p.top).sort((x, y) => (x.n ?? 0) - (y.n ?? 0));
        const ordered = [...ranked, ...g.filter((p) => !p.top)];
        const first = g[0]!;
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", g.length > 1 ? `${g.length} listings here` : `Show ${first.title}`);
        if (ranked.length) {
          el.className = m.pinTop;
          el.textContent = String(ranked[0]!.n ?? "");
          if (g.length > 1) {
            const badge = document.createElement("span");
            badge.className = m.badge;
            badge.textContent = String(g.length);
            el.append(badge);
          }
        } else if (g.length > 1) {
          el.className = m.pinMany;
          el.textContent = String(g.length);
        } else {
          el.className = m.pin;
        }
        // What shows when the pointer is over a pin: every listing at this address, each with a "Go to this listing" link. The
        // card is two listings tall; with more, the list scrolls inside it.
        const listing = () => {
          const box = document.createElement("div");
          if (g.length > 1) {
            const head = document.createElement("div");
            head.className = m.tipHead;
            head.textContent = `${g.length} listings here`;
            box.append(head);
          }
          const list = document.createElement("div");
          list.className = m.tipList;
          box.append(list);
          for (const p of ordered) {
            const row = document.createElement("a");
            row.className = m.tipRow;
            const title = document.createElement("span");
            title.className = m.tipTitle;
            title.textContent = `${p.top ? `${p.n}. ` : ""}${p.title}`;
            row.href = p.href;
            // The card is on this page: scroll to it. Otherwise move to the page of the list that holds it, without reloading.
            row.addEventListener("click", (e) => {
              e.preventDefault();
              popup.remove();
              goRef.current(p);
            });
            const go = document.createElement("span");
            go.className = m.tipGo;
            go.textContent = "Go to this listing →";
            row.append(title, go);
            list.append(row);
          }
          return box;
        };
        const pinRadius = ranked.length ? 14 : g.length > 1 ? 12 : 6;     // half the pin's width, so the card's arrow touches the pin
        const at: [number, number] = [first.lng, first.lat];
        const popup = new ml.Popup({ offset: pinRadius + 4, closeButton: false, closeOnClick: false, className: m.tip, maxWidth: "240px" }).setDOMContent(listing());
        // It opens when the pointer is over the pin and stays open while the pointer is over the pin or the card itself, so the
        // link can be reached; it closes a moment after the pointer leaves both.
        let closing: number | undefined;
        const open = () => {
          window.clearTimeout(closing);
          if (popup.isOpen()) return;
          // Put the card beside the pin, pointing at it, never on top of it: to the right of the pin, or to its left when the
          // right is too tight. Near the top or bottom edge its corner lines up with the pin instead, so it stays inside the map.
          const pt = map!.project(at);
          const size = map!.getContainer().getBoundingClientRect();
          const side = pt.x > size.width - 270 ? "right" : "left";
          const v = pt.y < 90 ? "top-" : pt.y > size.height - 90 ? "bottom-" : "";
          popup.options.anchor = `${v}${side}` as "left";
          popup.setLngLat(at).addTo(map!);
        };
        const closeSoon = () => { window.clearTimeout(closing); closing = window.setTimeout(() => popup.remove(), 350); };
        popup.on("open", () => {
          const card = popup.getElement();
          card.addEventListener("mouseenter", () => window.clearTimeout(closing));
          card.addEventListener("mouseleave", closeSoon);
        });
        // Clicking a pin that holds one listing goes straight to that listing's card; a pin with several opens its list.
        el.addEventListener("click", () => {
          if (g.length === 1) {
            popup.remove();
            goRef.current(first);
          } else open();
        });
        el.addEventListener("mouseenter", open);
        el.addEventListener("mouseleave", closeSoon);
        el.addEventListener("focus", open);
        el.addEventListener("blur", closeSoon);
        drawn.push({ marker: new ml.Marker({ element: el }).setLngLat(at).addTo(map!), popup });
      }
      };
      if (pins.length > 1) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 0 });
        // Opens up to half a step closer than "everything just fits", but never so close that a pin falls off the edge.
        const fit = map.getZoom();
        const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
        for (let z = Math.min(fit + 0.5, 13.5); z > fit; z -= 0.1) {
          map.jumpTo({ zoom: z });
          if (pins.every((p) => { const q = map!.project([p.lng, p.lat]); return q.x >= 20 && q.x <= w - 20 && q.y >= 20 && q.y <= h - 20; })) break;
          map.jumpTo({ zoom: fit });
        }
      }
      else map.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 13 });
      draw();
      map.on("zoomend", draw);
    })();
    return () => {
      gone = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the set of pins changes
  }, [pinsKey]);

  if (!pins.length) return null;
  return (
    <section className={m.card} aria-label="Map of your matches">
      <div ref={box} className={m.map} />
      <p className={m.note}>
        Listings without a street address sit near their borough or town, so those pins are approximate{missing > 0 ? "; online listings aren't on the map" : ""}. Click a pin to jump to its listing.
      </p>
    </section>
  );
}
