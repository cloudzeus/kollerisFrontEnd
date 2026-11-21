import { routing } from "./routing";

/**
 * Top-level segments that are real routes of their own, not a locale.
 * `/admin`, `/api` and `/feeds` have dynamic children that must still reach
 * them; `_next` and `_vercel` belong to the framework.
 */
const NOT_LOCALISED = ["admin", "api", "feeds", "_next", "_vercel"] as const;

/**
 * The `[locale]` segment only ever sees a supported locale.
 *
 * The proxy's matcher skips any path with a dot in it (so files cost nothing),
 * and with it next-intl's rewrite of an unprefixed path to the default locale.
 * `/wp-login.php` therefore fell through to `app/[locale]` as
 * `locale = "wp-login.php"`. The layout calls `notFound()`, but Next renders
 * the page beside the layout, not after it, and the page's
 * `n.toLocaleString(locale)` threw `RangeError: Incorrect locale information
 * provided` first — once per scanner request, in the production log.
 *
 * This rewrite does for those paths what the proxy does for the others:
 * a path whose first segment is not a locale is the default locale's, so
 * `/wp-login.php` is served as `/el/wp-login.php` — a 404 from a valid locale.
 * It runs as `afterFiles`, after `public/` and the static routes (`/robots.txt`,
 * `/sitemap.xml`, `/favicon.ico`) have had their turn, and before the dynamic
 * routes. A path the proxy already rewrote starts with `el` and is left alone.
 */
export const unprefixedToDefaultLocale = {
  source: `/:first((?!(?:${[...routing.locales, ...NOT_LOCALISED].join("|")})(?:/|$))[^/]+)/:rest*`,
  destination: `/${routing.defaultLocale}/:first/:rest*`,
};
