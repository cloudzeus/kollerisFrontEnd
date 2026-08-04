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

/** The site's public address. Set per environment; the fallback is dev only. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

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
