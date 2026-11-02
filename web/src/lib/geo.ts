import { readFile } from "node:fs/promises";
import path from "node:path";
import novemberPoints from "../data/map-points/2026-11-01b.json" with { type: "json" };

/** `how`: "address" and "venue" are exact; "area" is near the listing's borough or town (it had no street address). */
export type MapPoint = { lat: number; lng: number; how?: string };

/**
 * The map points bundled into the server build, by snapshot id, oldest first. Each file is written by
 * scripts/geocode_listings.py; the script also writes the deployable copy in src/data/map-points/. Add the new import and
 * entry here when a new snapshot's points are bundled.
 */
const BUNDLED: [string, Record<string, MapPoint>][] = [["2026-11-01b", novemberPoints], ["2026-11-02", novemberPoints]];  // 2026-11-02 holds the same listings, so the same points

/**
 * The map points for a snapshot's listings, keyed by the listing's dedupe key (title | place | deadline). The bundled points for
 * that snapshot are used when there are some. A snapshot with no bundled points of its own (for example the id of a database
 * snapshot that was loaded after the last build) uses the newest bundled ones: the key names the listing, so a listing
 * that is the same gets the same pin and one that is not simply has none. Other local snapshots can still use data/geo/.
 */
export async function loadPoints(snapshotId: string): Promise<Record<string, MapPoint>> {
  if (!/^[\w.-]+$/.test(snapshotId)) return {};
  const own = BUNDLED.find(([id]) => id === snapshotId);
  if (own) return own[1];
  try {
    const file = path.resolve(process.cwd(), "..", "data", "geo", `${snapshotId}.json`);
    return JSON.parse(await readFile(file, "utf-8")) as Record<string, MapPoint>;
  } catch {
    return BUNDLED[BUNDLED.length - 1]?.[1] ?? {};
  }
}
