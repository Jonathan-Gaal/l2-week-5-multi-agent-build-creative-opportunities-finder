import { asBackendError, backendHealth, FRIENDLY, getMeta, searchBackend, visitorAddress } from "@/lib/backend";
import { labelsFor, pickerChoices, pickIds } from "@/lib/taxonomy";

const pick = (value: unknown, allowed: Set<string>): string[] => (Array.isArray(value) ? pickIds(value, allowed) : []);

const STATUS: Record<string, number> = { unreachable: 503, rate_limited: 429, busy: 503, no_snapshot: 503 };
const MAX_BODY_BYTES = 2_048;

// Only the dev page (/dev, itself hidden in production) calls this route, so a production build doesn't serve it:
// no public JSON endpoint that spends model calls or reveals where the results service lives.
const devOnly = () => (process.env.NODE_ENV === "production" ? new Response(null, { status: 404 }) : null);

/** A request from a page on this site (so another site can't make a visitor's browser run searches here). */
function sameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

/** Is the results service reachable? Used by the dev page. */
export async function GET() {
  return devOnly() ?? Response.json(await backendHealth());
}

/** The dev tools' search endpoint. It makes one call to the results service (backend/). */
export async function POST(request: Request) {
  const hidden = devOnly();
  if (hidden) return hidden;
  if (!sameOrigin(request)) return Response.json({ error: "origin_not_allowed", message: FRIENDLY.origin_not_allowed }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "bad_request", message: "Send JSON: { places, types, disciplines }" }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "bad_request", message: "Request too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new Error("too large");
    body = JSON.parse(text);
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
