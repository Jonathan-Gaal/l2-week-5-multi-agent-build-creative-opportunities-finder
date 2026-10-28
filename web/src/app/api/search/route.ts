import { BackendError, backendHealth, FRIENDLY, searchBackend } from "@/lib/backend";
import { BOROUGHS, DISCIPLINES, PLACE_GROUPS, TYPES } from "@/lib/taxonomy";

const ids = (choices: readonly { id: string }[]) => new Set(choices.map((c) => c.id));
const PLACES = ids([...BOROUGHS, ...PLACE_GROUPS]);
const TYPE_IDS = ids(TYPES);
const DISCIPLINE_IDS = ids(DISCIPLINES);

const pick = (value: unknown, allowed: Set<string>): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && allowed.has(v)))] : [];

/** Is the results service reachable? Used by the dev page. */
export async function GET() {
  return Response.json(await backendHealth());
}

/** The front end's one search endpoint. It asks the results service (backend/) and merges the answers. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Send JSON: { places, types, disciplines }" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const places = pick(b.places, PLACES);
  const types = pick(b.types, TYPE_IDS);
  const disciplines = pick(b.disciplines, DISCIPLINE_IDS);
  if (!places.length || !types.length) {
    return Response.json({ error: "bad_request", message: "Pick at least one place and one type." }, { status: 400 });
  }
  try {
    return Response.json(await searchBackend({ places, types, disciplines }));
  } catch (e) {
    const code = e instanceof BackendError ? e.code : "internal";
    const status = code === "unreachable" ? 503 : code === "rate_limited" ? 429 : code === "busy" || code === "no_snapshot" ? 503 : 502;
    return Response.json({ error: code, message: FRIENDLY[code] ?? FRIENDLY.internal }, { status });
  }
}
