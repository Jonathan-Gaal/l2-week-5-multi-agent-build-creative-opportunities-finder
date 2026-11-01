import { readFile } from "node:fs/promises";
import path from "node:path";

/** `how`: "address" and "venue" are exact; "area" is near the listing's borough or town (it had no street address). */
export type MapPoint = { lat: number; lng: number; how?: string };

/**
 * The map points for a snapshot's listings, keyed by the listing's dedupe key. They come from the file written by
 * scripts/geocode_listings.py (data/geo/<snapshot id>.json); a snapshot with no file just has no pins.
 */
export async function loadPoints(snapshotId: string): Promise<Record<string, MapPoint>> {
  if (!/^[\w.-]+$/.test(snapshotId)) return {};
  try {
    const file = path.resolve(process.cwd(), "..", "data", "geo", `${snapshotId}.json`);
    const raw = JSON.parse(await readFile(file, "utf-8")) as Record<string, MapPoint>;
    return raw;
  } catch {
    return {};
  }
}
