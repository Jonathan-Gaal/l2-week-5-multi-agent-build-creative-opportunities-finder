"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import m from "./ResultsMap.module.css";

export type Pin = { key: string; title: string; lat: number; lng: number; top: boolean; n?: number };

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LAND = "#3d2674";
const WATER = "#0a0518";
// The map never zooms out past the places a visitor can pick (New York, the tri-state area and the rest of the Northeast
// down to DC); zooming in is unlimited. Only those states keep their name on the map.
const AREA: [[number, number], [number, number]] = [[-80.7, 38.4], [-66.4, 47.7]];
const STATES = ["New York", "New Jersey", "Connecticut", "Pennsylvania", "Massachusetts", "Rhode Island", "Vermont", "New Hampshire", "Maine", "Maryland", "District of Columbia", "Delaware"];
const NYC: [number, number] = [-73.97, 40.73];

/** Move the page to a result card and flash it, so a pin and its card are easy to connect. */
function showCard(key: string) {
  const el = document.getElementById(`card-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  el.classList.remove("rcard-flash");
  void el.offsetWidth;
  el.classList.add("rcard-flash");
}

/** A dark street map: a pink dot for every listing with an address, numbered lime pins for the top picks. */
export default function ResultsMap({ pins, missing }: { pins: Pin[]; missing: number }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box.current || !pins.length) return;
    let map: import("maplibre-gl").Map | undefined;
    let gone = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (gone || !box.current) return;
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new ml.Map({ container: box.current, style: STYLE, center: NYC, zoom: 9.5, minZoom: 5, maxBounds: AREA, attributionControl: { compact: true } });
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
      // One pin per address. When several listings share it, the pin says how many, and hovering or clicking lists them.
      const spots = new Map<string, Pin[]>();
      for (const p of pins) spots.set(`${p.lat},${p.lng}`, [...(spots.get(`${p.lat},${p.lng}`) ?? []), p]);
      // Pink pins first so the numbered lime pins sit on top of them.
      const groups = [...spots.values()].sort((x, y) => Number(x.some((p) => p.top)) - Number(y.some((p) => p.top)));
      for (const g of groups) {
        const ranked = g.filter((p) => p.top).sort((x, y) => (x.n ?? 0) - (y.n ?? 0));
        const ordered = [...ranked, ...g.filter((p) => !p.top)];
        const first = g[0]!;
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", g.length > 1 ? `${g.length} listings at this address` : `Show ${first.title}`);
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
        // The list of listings at this address: plain text on hover, clickable buttons once the pin is clicked.
        const listing = (clickable: boolean, max: number) => {
          const box = document.createElement("div");
          if (g.length > 1) {
            const head = document.createElement("div");
            head.className = m.tipHead;
            head.textContent = `${g.length} listings here`;
            box.append(head);
          }
          for (const p of ordered.slice(0, max)) {
            const row = document.createElement(clickable ? "button" : "div");
            row.className = m.tipRow;
            row.textContent = `${p.top ? `${p.n}. ` : ""}${p.title}`;
            if (clickable) row.addEventListener("click", () => showCard(p.key));
            box.append(row);
          }
          if (ordered.length > max) {
            const more = document.createElement("div");
            more.className = m.tipMore;
            more.textContent = `and ${ordered.length - max} more`;
            box.append(more);
          }
          return box;
        };
        const at: [number, number] = [first.lng, first.lat];
        const tip = new ml.Popup({ offset: 16, closeButton: false, className: m.tip }).setDOMContent(listing(false, 5));
        const pinned = new ml.Popup({ offset: 16, closeButton: true, className: m.tip, maxWidth: "300px" }).setDOMContent(listing(true, 40));
        el.addEventListener("mouseenter", () => !pinned.isOpen() && tip.setLngLat(at).addTo(map!));
        el.addEventListener("mouseleave", () => tip.remove());
        el.addEventListener("click", () => {
          tip.remove();
          if (g.length === 1) showCard(first.key);
          else pinned.setLngLat(at).addTo(map!);
        });
        new ml.Marker({ element: el }).setLngLat(at).addTo(map);
        bounds.extend(at);
      }
      if (pins.length > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 0 });
      else map.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 13 });
    })();
    return () => {
      gone = true;
      map?.remove();
    };
  }, [pins]);

  if (!pins.length) return null;
  return (
    <section className={m.card} aria-label="Map of your matches">
      <div ref={box} className={m.map} />
      <p className={m.note}>
        Listings with an address are on the map{missing > 0 ? "; the ones without aren't" : ""}. Click a pin to jump to its listing.
      </p>
    </section>
  );
}
