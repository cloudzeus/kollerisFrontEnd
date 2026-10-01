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

