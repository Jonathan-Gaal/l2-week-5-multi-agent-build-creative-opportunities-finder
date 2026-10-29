import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Dev only: the Versions panel's "Save all to code" button posts the saved looks here, and they are written to
 * src/data/design-versions.json so they can be committed and shared. Not available in production, same-origin only,
 * a fixed file path, and a size cap.
 */
const FILE = path.join(process.cwd(), "src", "data", "design-versions.json");
const MAX_BYTES = 500_000;

const isLook = (v: unknown): boolean => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && o.id.length <= 40 && typeof o.name === "string" && o.name.length <= 120 && typeof o.at === "number" && !!o.settings && typeof o.settings === "object";
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "Same-origin requests only" }, { status: 403 });

  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Not JSON" }, { status: 400 });
  }
  if (!Array.isArray(list) || !list.every(isLook)) return NextResponse.json({ error: "Not a list of saved looks" }, { status: 400 });

  await writeFile(FILE, JSON.stringify(list, null, 2) + "\n", "utf8");
  return NextResponse.json({ saved: list.length });
}
