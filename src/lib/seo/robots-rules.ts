import { routing } from "@/i18n/routing";

/**
 * The robots.txt rules that are generated rather than listed, kept out of
 * `app/robots.ts` so they can be tested without the metadata route.
 */

/** "" for Greek (served from the bare path), then `/en`, `/it`. */
export const LOCALE_PREFIXES = [
  "",
  ...routing.locales
    .filter((locale) => locale !== routing.defaultLocale)
    .map((locale) => `/${locale}`),
];

/** Listing paths whose query string is a facet space. `*` is the slug. */
const LISTINGS = ["/katalogos/*", "/brands/*", "/proionta", "/prosfores/*"];

export function facetRules(): { allow: string[]; disallow: string[] } {
  const allow: string[] = [];
  const disallow: string[] = [];
  for (const prefix of LOCALE_PREFIXES) {
    for (const listing of LISTINGS) {
      const base = `${prefix}${listing}`;
      disallow.push(`${base}?`, `${base}?page=*&`);
      allow.push(`${base}?page=`);
    }
  }
  return { allow, disallow };
}


/**
 * Private pages, in every language.
 *
 * Only the bare paths used to be listed, so `/en/kalathi`, `/it/checkout` and
 * the rest were open to every crawler — the same basket and the same account
 * pages, one prefix away. `/admin` and `/api` are not localised and stay as
 * they are.
 */
const PRIVATE_LOCALISED = ["/kalathi", "/checkout", "/logariasmos", "/eisodos", "/eggrafi"];
const NOT_LOCALISED = ["/admin", "/api"];

/**
 * Public pages that live under a private prefix. The order-tracking page is in
 * the sitemap, and a sitemap URL that robots.txt blocks is a Search Console
 * error; the longer Allow wins over `/logariasmos`.
 */
const PUBLIC_UNDER_PRIVATE = ["/logariasmos/entopismos"];

export function privateRules(): { allow: string[]; disallow: string[] } {
  const disallow = [...NOT_LOCALISED];
  const allow: string[] = [];
  for (const prefix of LOCALE_PREFIXES) {
    for (const path of PRIVATE_LOCALISED) disallow.push(`${prefix}${path}`);
    for (const path of PUBLIC_UNDER_PRIVATE) allow.push(`${prefix}${path}`);
  }
  return { allow, disallow };
}
