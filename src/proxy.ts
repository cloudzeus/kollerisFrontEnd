import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";

// Edge-safe: authConfig carries no providers and no database access.
const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

/**
 * Το κανονικό host του καταστήματος, από τη ΜΙΑ ρύθμιση που ορίζει και τα
 * canonical, το sitemap και τα δομημένα δεδομένα. Κενό όταν δεν έχει οριστεί —
 * δηλαδή σε ανάπτυξη — και τότε δεν ανακατευθύνεται τίποτα.
 */
const CANONICAL_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/[\s,;]+$/, "");
  if (!raw?.startsWith("https://")) return "";
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
})();

/**
 * Ένα κατάστημα, ένα όνομα.
 *
 * Το `kolleris.com`, το `www.` και το `web.` δείχνουν στον ίδιο container, και
 * μέχρι τη μετακόμιση και τα τρία απαντούσαν 200 με το ίδιο περιεχόμενο. Για
 * μια μηχανή αναζήτησης αυτό είναι τρία αντίγραφα που ανταγωνίζονται μεταξύ
 * τους· για έναν πελάτη είναι τρία καλάθια και τρεις συνδέσεις, αφού τα cookies
 * ανήκουν στο host.
 *
 * Ο κανόνας ζει ΚΑΙ στο Cloudflare, που πιάνει και το `/api` και τα αρχεία. Εδώ
 * είναι το δίχτυ: αν κάποιος σβήσει τον κανόνα, το κατάστημα δεν ξαναγίνεται
 * σιωπηλά διπλό.
 *
 * 301 και όχι 307: η ανακατεύθυνση είναι μόνιμη και θέλουμε οι μηχανές να
 * μεταφέρουν την αξία της παλιάς διεύθυνσης στη νέα.
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  if (!CANONICAL_HOST) return null;
  const host = request.headers.get("host");
  if (!host || host === CANONICAL_HOST) return null;
  /*
   * Μόνο τα δικά μας ονόματα. Ένα άγνωστο host (έλεγχος υγείας σε IP, δοκιμαστικό
   * domain του Coolify) δεν πρέπει να στέλνει τον επισκέπτη αλλού — και μια
   * ανακατεύθυνση σε βρόχο είναι χειρότερη από διπλό περιεχόμενο.
   */
  if (!/(^|\.)kolleris\.com$/i.test(host.split(":")[0])) return null;

  const url = new URL(request.nextUrl);
  url.host = CANONICAL_HOST;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url, 301);
}

/**
 * Two middlewares, one matcher.
 *
 * /admin is NOT localised (staff UI is Greek only) and is gated on a valid JWT.
 * Everything else goes through next-intl locale negotiation.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;

  const canonical = canonicalHostRedirect(request as NextRequest);
  if (canonical) return canonical;

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
