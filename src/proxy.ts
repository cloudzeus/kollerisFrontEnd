import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";
import {
  PER_ROW_COOKIE,
  canonicalizeListingQuery,
  listingKindOf,
} from "@/lib/catalog/listing-query";
import { tinyPage } from "@/lib/security/tiny-response";
import {
  POLICIES,
  TokenBucketLimiter,
  clientIp,
  policyFor,
} from "@/lib/security/rate-limit";

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
 * One spelling per listing URL — before auth, before i18n, before any render.
 *
 * The facet space used to be infinite, and a scraper walked it: every random
 * `sub`/`brand`/`min`/`max`/`perPage` combination was a cache miss and a full
 * render of up to 96 products. `canonicalizeListingQuery` reduces the query to
 * the parameters the page reads, in one order, within limits; here the answer
 * is turned into a response that costs nothing:
 *
 *   - redirect  301 to the canonical URL (307 when it carries a `perRow`
 *               preference — that one sets a cookie and must not be cached);
 *   - reject    a few hundred bytes of static HTML, `noindex`, no database
 *               and no render.
 *
 * GET and HEAD only: a Server Action is a POST to the page's own URL, and
 * redirecting it would turn the action into a page load.
 *
 * The target is built on `request.nextUrl`, so it is same-origin by
 * construction; Next writes a same-origin redirect out as a relative
 * Location, so the host Traefik hands the server never leaks into it. (A raw
 * relative `Location` header is rejected by the proxy adapter: it parses it
 * with `new URL()`.)
 */
function listingCanonicalRedirect(request: NextRequest): NextResponse | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname, search } = request.nextUrl;
  if (!search) return null;
  const kind = listingKindOf(pathname);
  if (!kind) return null;

  const result = canonicalizeListingQuery(kind, request.nextUrl.searchParams);
  if (result.action === "ok") return null;

  if (result.action === "reject") {
    const base = pathname.replace(/\/+$/, "") || "/";
    return tinyPage(result.status, {
      title: result.status === 404 ? "Not found" : "Too many filters",
      message:
        "Αυτός ο συνδυασμός φίλτρων δεν υποστηρίζεται. / This filter combination is not supported.",
      link: { href: base, label: "Καθαρισμός φίλτρων / Clear filters" },
    });
  }

  const target = new URL(request.nextUrl);
  target.search = result.search;
  if (result.perRow != null) {
    const response = NextResponse.redirect(target, 307);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(PER_ROW_COOKIE, String(result.perRow), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return response;
  }
  const response = NextResponse.redirect(target, 301);
  response.headers.set("Cache-Control", "public, max-age=3600");
  return response;
}

/**
 * Per-IP rate limit on the routes that cost a render (see `rate-limit.ts` for
 * the policies). One limiter per process: the proxy module lives as long as
 * the server does.
 */
const limiter = new TokenBucketLimiter();

/*
 * What was refused, summarised once a minute. Logging every 429 during an
 * attack would be its own load; a count and the top offenders is what someone
 * reading the log needs.
 */
const refused = new Map<string, number>();
let refusedSince = Date.now();

function noteRefused(ip: string): void {
  refused.set(ip, (refused.get(ip) ?? 0) + 1);
  const now = Date.now();
  if (now - refusedSince < 60_000) return;
  const total = [...refused.values()].reduce((a, b) => a + b, 0);
  const top = [...refused]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([who, n]) => `${who}=${n}`)
    .join(" ");
  console.warn(
    `[rate-limit] refused ${total} requests from ${refused.size} clients in ${Math.round((now - refusedSince) / 1000)}s; top: ${top}`,
  );
  refused.clear();
  refusedSince = now;
}

function rateLimit(request: NextRequest): NextResponse | null {
  const policy = policyFor({
    method: request.method,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  });
  if (!policy) return null;
  const ip = clientIp(request.headers);
  if (!ip) return null;

  const verdict = limiter.take(`${policy}:${ip}`, POLICIES[policy]);
  if (verdict.ok) return null;

  noteRefused(ip);
  const headers = { "Retry-After": String(verdict.retryAfterSeconds) };
  if (policy === "api") {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: verdict.retryAfterSeconds },
      { status: 429, headers: { ...headers, "Cache-Control": "no-store" } },
    );
  }
  return tinyPage(429, {
    title: "Too many requests",
    message:
      "Πάρα πολλά αιτήματα σε λίγο χρόνο — δοκιμάστε ξανά σε λίγα δευτερόλεπτα. / Too many requests — please try again in a few seconds.",
    headers,
  });
}

/**
 * Two middlewares, one matcher.
 *
 * /admin is NOT localised (staff UI is Greek only) and is gated on a valid JWT.
 * Everything else goes through next-intl locale negotiation.
 */
const authProxy = auth((request) => {
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

/**
 * The cheap checks run first and answer on their own; only what survives them
 * pays for the session decode and the locale negotiation.
 */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const early =
    canonicalHostRedirect(request) ?? rateLimit(request) ?? listingCanonicalRedirect(request);
  if (early) return early;
  // The two APIs below are matched only to be rate-limited; they are not
  // localised and carry their own auth.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  return authProxy(request, event as never);
}

export const config = {
  matcher: [
    // Skip Next internals, the auth endpoints and anything with a file extension.
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // The product listing APIs, for the rate limit only.
    "/api/suggest",
    "/api/acp/products",
  ],
};
