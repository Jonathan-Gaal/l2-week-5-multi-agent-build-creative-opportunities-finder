import { asBackendError, backendHealth, FRIENDLY, getMeta, searchBackend, visitorAddress } from "@/lib/backend";
import { labelsFor, pickerChoices, pickIds } from "@/lib/taxonomy";

const pick = (value: unknown, allowed: Set<string>): string[] => (Array.isArray(value) ? pickIds(value, allowed) : []);

const STATUS: Record<string, number> = { unreachable: 503, rate_limited: 429, busy: 503, no_snapshot: 503 };

/** Is the results service reachable? Used by the dev page. */
export async function GET() {
  return Response.json(await backendHealth());
}

/** The front end's one search endpoint (used by the dev tools). It makes one call to the results service (backend/). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Send JSON: { places, types, disciplines }" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  try {
    const meta = await getMeta();
    const allowed = pickerChoices(meta);
    const places = pick(b.places, allowed.places);
    const types = pick(b.types, allowed.types);
    const disciplines = pick(b.disciplines, allowed.disciplines);
    if (!places.length || !types.length) {
      return Response.json({ error: "bad_request", message: "Pick at least one place and one type." }, { status: 400 });
    }
    const out = await searchBackend({ places, types, disciplines }, { visitor: visitorAddress(request.headers), labels: labelsFor(meta) });
    return Response.json(out);
  } catch (e) {
    const { code } = asBackendError(e);
    return Response.json({ error: code, message: FRIENDLY[code] ?? FRIENDLY.internal }, { status: STATUS[code] ?? 502 });
  }
}
