import { connection } from "next/server";
import { listRuns, replayHref } from "@/lib/savedRuns";

/** The saved runs for the demo badge's drop-down. Empty on the live site, where nothing is saved. */
export async function GET() {
  await connection();
  return Response.json(listRuns().map((r) => ({ name: r.name, savedAt: r.savedAt, href: replayHref(r.url), top: r.top.slice(0, 3).map((t) => t.title) })));
}
