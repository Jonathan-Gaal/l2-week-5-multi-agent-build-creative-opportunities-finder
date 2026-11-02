import { readFile } from "node:fs/promises";
import path from "node:path";
import novemberPoints from "../data/map-points/2026-11-01b.json" with { type: "json" };

/** `how`: "address" and "venue" are exact; "area" is near the listing's borough or town (it had no street address). */
export type MapPoint = { lat: number; lng: number; how?: string };

/**
 * The map points for a snapshot's listings, keyed by the listing's dedupe key. They come from the file written by
 * scripts/geocode_listings.py. The published snapshot's coordinates are imported into the server bundle so
 * Vercel does not depend on data/geo/ outside the web project. Other local snapshots can still use that folder.
 */
export async function loadPoints(snapshotId: string): Promise<Record<string, MapPoint>> {
  if (!/^[\w.-]+$/.test(snapshotId)) return {};
  if (snapshotId === "2026-11-01b") return novemberPoints;
  try {
    const file = path.resolve(process.cwd(), "..", "data", "geo", `${snapshotId}.json`);
    const raw = JSON.parse(await readFile(file, "utf-8")) as Record<string, MapPoint>;
    return raw;
  } catch {
    return {};
  }
}
