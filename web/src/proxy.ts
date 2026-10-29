/**
 * Next 16 Proxy (formerly Middleware; Node.js runtime by default). One job: give every page visitor a signed
 * visitor cookie (server/api/visitor.ts) so rate limits are per visitor rather than per shared address.
 *
 * A request without a valid cookie is minted a new one, set on the response AND written into the request this
 * proxy forwards, so the page rendering this very request already keys by the new id (a first visit straight to
 * /results doesn't fall into the shared address bucket). The page re-verifies the signature itself, so nothing
 * here is trusted on the proxy's say-so. No secret configured: pass through untouched (address keying).
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  VISITOR_COOKIE, mintVisitorCookie, readCookie, verifyVisitorCookie, visitorCookieOptions, visitorSecret, withCookie,
} from "../server/api/visitor.ts";

export function proxy(request: NextRequest) {
  const secret = visitorSecret();
  if (!secret) return NextResponse.next();
  const cookieHeader = request.headers.get("cookie");
  if (verifyVisitorCookie(readCookie(cookieHeader, VISITOR_COOKIE), secret)) return NextResponse.next();

  const { value } = mintVisitorCookie(secret);
  const headers = new Headers(request.headers);
  headers.set("cookie", withCookie(cookieHeader, VISITOR_COOKIE, value));
  const response = NextResponse.next({ request: { headers } });
  const secure = request.nextUrl.protocol === "https:" || process.env.VERCEL === "1";
  response.cookies.set(VISITOR_COOKIE, value, visitorCookieOptions(secure));
  return response;
}

// Pages and route handlers only: not build assets, image optimization, metadata files or anything with a file
// extension (public/ files), which never read the cookie.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[A-Za-z0-9]+$).*)"],
};
