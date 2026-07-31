import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";

// Edge-safe: authConfig carries no providers and no database access.
const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

/**
 * Two middlewares, one matcher.
 *
 * /admin is NOT localised (staff UI is Greek only) and is gated on a valid JWT.
 * Everything else goes through next-intl locale negotiation.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const isLoginPage = pathname === "/admin/login";
    const isAuthed = !!request.auth?.user;

    if (!isAuthed && !isLoginPage) {
      const url = new URL("/admin/login", request.nextUrl);
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    if (isAuthed && isLoginPage) {
      return NextResponse.redirect(new URL("/admin", request.nextUrl));
    }
    return NextResponse.next();
  }

  return intlMiddleware(request as NextRequest);
});

export const config = {
  // Skip Next internals, the auth endpoints and anything with a file extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
