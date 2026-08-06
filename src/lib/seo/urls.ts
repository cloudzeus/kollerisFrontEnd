import { routing, type Locale } from "@/i18n/routing";

/**
 * Canonical and alternate addresses for a page.
 *
 * With `localePrefix: "as-needed"` Greek is served from the bare path and only
 * `/en` and `/it` carry a prefix. That is the right choice for the primary
 * market and it is also the thing that makes canonicals easy to get wrong: the
 * same page has three addresses, one of which looks like the root, and a
 * crawler with no `hreflang` treats them as duplicates competing with each
 * other rather than as translations of one page.
 *
 * So the rule lives here once. Every page asks for its alternates rather than
 * assembling a URL, because a URL assembled in fourteen places is a URL that is
 * wrong in one of them.
 */

const DEV_ORIGIN = "http://localhost:3000";

/** Letters, digits and hyphens in dot-separated labels, optionally with a port. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

/**
 * Make sense of whatever NEXT_PUBLIC_SITE_URL turned out to be.
 *
 * This is not defensiveness for its own sake. In production the value was
 * `https://web.kolleris.com,` — one trailing comma, typed once into a
 * deployment form — and the old one-line implementation stripped trailing
 * slashes and passed the rest through. The result was every absolute URL the
 * site produces being invalid at the same time: 5.200 product links in the
 * Merchant Center feed, every entry in the sitemap, the `rel="canonical"` on
 * every page and the shop's own identity in JSON-LD. Google reported it as
 * "Invalid URL" and "Missing product page", which is three steps removed from
 * the comma.
 *
 * `new URL()` alone would not have caught it: the WHATWG parser accepts a
 * comma as part of a hostname and returns `https://web.kolleris.com,` intact.
 * So the host is checked against what a hostname may actually contain.
 *
 * Returns `{ origin, problem }` rather than throwing. A malformed setting must
 * not take the storefront down — but it must not pass silently either, which
 * is what `assertSiteOrigin()` in `instrumentation.ts` is for.
 */
function resolveOrigin(raw: string | undefined): {
  origin: string;
  problem?: string;
  configured?: boolean;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { origin: DEV_ORIGIN };

  // Trailing punctuation a person types by accident, or that a copied
  // comma-separated list leaves behind.
  const cleaned = trimmed.replace(/[\s,;]+$/, "").replace(/\/+$/, "");

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return { origin: DEV_ORIGIN, problem: `${JSON.stringify(trimmed)} is not a URL` };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { origin: DEV_ORIGIN, problem: `${JSON.stringify(trimmed)} is not http(s)` };
  }
  if (!HOSTNAME.test(url.hostname)) {
    return {
      origin: DEV_ORIGIN,
      problem: `${JSON.stringify(url.hostname)} is not a valid hostname`,
    };
  }

  // `.origin` normalises the rest: any path, query or fragment is dropped.
  return {
    configured: true,
    origin: url.origin,
    problem: cleaned === trimmed ? undefined : `trailing characters removed from ${JSON.stringify(trimmed)}`,
  };
}

/*
 * Resolved once. The value comes from the environment and cannot change while
 * the process runs, and the feed alone asks for it fifteen thousand times.
 */
const RESOLVED = resolveOrigin(process.env.NEXT_PUBLIC_SITE_URL);

/** The site's public address. Set per environment; the fallback is dev only. */
export function siteOrigin(): string {
  return RESOLVED.origin;
}

/**
 * What, if anything, is wrong with NEXT_PUBLIC_SITE_URL.
 *
 * `null` when the setting is clean. Reported at boot rather than per request:
 * the point is that somebody reads it in the deployment log.
 */
export function siteOriginProblem(): string | null {
  return RESOLVED.problem ?? null;
}

/**
 * Whether the public address was actually configured, as opposed to defaulted.
 *
 * `siteOrigin()` answers with localhost when the setting is missing, which is
 * right for a canonical URL in development and WRONG for a redirect in
 * production: a customer returning from a payment would be sent to their own
 * machine. Callers that navigate a real person need to know the difference,
 * and `siteOriginProblem()` cannot tell them — an unset variable is not
 * malformed, so it reports nothing.
 */
export function siteOriginConfigured(): boolean {
  return RESOLVED.configured === true;
}

/** Exported for the test — everything else should use `siteOrigin()`. */
export { resolveOrigin as __resolveOrigin };

/** `/proion/x` in a given language. Greek keeps the bare path. */
export function localisedPath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const bare = clean === "/" ? "" : clean;
  return locale === routing.defaultLocale ? bare || "/" : `/${locale}${bare}`;
}

export function absoluteUrl(path: string, locale: Locale = routing.defaultLocale): string {
  return `${siteOrigin()}${localisedPath(path, locale)}`;
}

/**
 * The `alternates` block for Next's metadata.
 *
 * `canonical` is this language's own address, not the Greek one: each
 * translation is a page in its own right and should rank in its own market.
 * `x-default` points at Greek, which is what a visitor with no matching
 * language should be given.
 */
export function alternatesFor(path: string, locale: Locale) {
  const languages: Record<string, string> = {};
  for (const other of routing.locales) {
    languages[other] = absoluteUrl(path, other);
  }
  languages["x-default"] = absoluteUrl(path, routing.defaultLocale);

  return { canonical: absoluteUrl(path, locale), languages };
}

/** The same thing shaped for a sitemap entry, which wants no `x-default`. */
export function sitemapAlternates(path: string): Record<string, string> {
  return Object.fromEntries(
    routing.locales.map((locale) => [locale, absoluteUrl(path, locale)]),
  );
}
