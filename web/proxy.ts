import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);
const LOCALE_PATTERN = new RegExp(`^/(${routing.locales.join("|")})(/.*)?$`);

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const localeMatch = pathname.match(LOCALE_PATTERN);

  // No locale prefix yet — let next-intl negotiate the locale and redirect.
  if (!localeMatch) {
    return intlMiddleware(request);
  }

  const locale = localeMatch[1];
  const rest = localeMatch[2] ?? "/";
  const isPublicPath = rest === "/login";

  // Fast, DB-free check: does a session cookie exist at all? This only
  // guards navigation/UX — it is not a real auth check. The protected layout
  // (app/[locale]/(app)/layout.tsx) and every server action/route handler
  // call requireUser()/requireRole() to validate the session against the
  // database on every request.
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie && !isPublicPath) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  if (hasSessionCookie && isPublicPath) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
