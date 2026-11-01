"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import m from "./ResultsMap.module.css";

export type Pin = { key: string; title: string; lat: number; lng: number; top: boolean; n?: number; href: string };

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LAND = "#3d2674";
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
        // What shows when the pointer is over a pin: at most two listings at this address, each with a "Go to this listing" link.
        // Two keeps the card short enough to sit inside the map; the rest are in the list under the map.
        const SHOWN = 2;
        const listing = () => {
          const box = document.createElement("div");
          if (g.length > 1) {
            const head = document.createElement("div");
            head.className = m.tipHead;
            head.textContent = `${g.length} listings here`;
            box.append(head);
          }
          for (const p of ordered.slice(0, SHOWN)) {
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
            box.append(row);
          }
          if (ordered.length > SHOWN) {
            const more = document.createElement("div");
            more.className = m.tipMore;
            more.textContent = `and ${ordered.length - SHOWN} more at this address`;
            box.append(more);
          }
          return box;
        };
        const at: [number, number] = [first.lng, first.lat];
        const popup = new ml.Popup({ offset: 16, closeButton: false, closeOnClick: false, className: m.tip, maxWidth: "240px" }).setDOMContent(listing());
        // It opens when the pointer is over the pin and stays open while the pointer is over the pin or the card itself, so the
        // link can be reached; it closes a moment after the pointer leaves both.
        let closing: number | undefined;
        const open = () => {
          window.clearTimeout(closing);
          if (popup.isOpen()) return;
          // Put the card on the side of the pin with the most room (below a pin in the top half of the map, above one in the
          // bottom half, and tucked in from the left or right edge), so it is never cut off by the edge of the map.
          const pt = map!.project(at);
          const size = map!.getContainer().getBoundingClientRect();
          const v = pt.y < size.height / 2 ? "top" : "bottom";
          const h = pt.x < 130 ? "-left" : pt.x > size.width - 130 ? "-right" : "";
          popup.options.anchor = `${v}${h}` as "top";
          popup.setLngLat(at).addTo(map!);
        };
        const closeSoon = () => { window.clearTimeout(closing); closing = window.setTimeout(() => popup.remove(), 350); };
        popup.on("open", () => {
          const card = popup.getElement();
          card.addEventListener("mouseenter", () => window.clearTimeout(closing));
          card.addEventListener("mouseleave", closeSoon);
        });
        el.addEventListener("mouseenter", open);
        el.addEventListener("mouseleave", closeSoon);
        el.addEventListener("focus", open);
        el.addEventListener("blur", closeSoon);
        new ml.Marker({ element: el }).setLngLat(at).addTo(map);
        bounds.extend(at);
      }
      if (pins.length > 1) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 0 });
        map.jumpTo({ zoom: Math.min(map.getZoom() + 0.5, 13.5) });     // opens half a step closer than "everything just fits"
      }
      else map.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 13 });
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
        Listings with an address are on the map{missing > 0 ? "; the ones without aren't" : ""}. Click a pin to jump to its listing.
      </p>
    </section>
  );
}
