import type { MetadataRoute } from "next";
import { facetRules, privateRules } from "@/lib/seo/robots-rules";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * What a crawler may take.
 *
 * Everything on the storefront is open. What is closed is closed for a reason
 * and not out of caution:
 *
 *   /admin        staff only, and behind auth anyway
 *   /api          machine surfaces; the agent API is metered per key
 *   /kalathi      a basket is one visitor's, and every crawl of it is a session
 *   /checkout     the same, plus it would index a form
 *   /logariasmos  somebody's orders and addresses (but not the public
 *                 order-tracking page under it, which is in the sitemap)
 *
 * Each of them under /en and /it as well: a basket one prefix away is still a
 * basket.
 *
 * The confirmation page is excluded through /checkout. It carries a guest token
 * in the query string, so an indexed copy would be a stranger's order with the
 * key attached.
 *
 * ── Filtered listings ──────────────────────────────────────────────────────
 *
 * A category, a brand, "all products" and an offer are crawlable, and so is
 * their `?page=`. Every OTHER query on them — facets, sorting, density — is
 * disallowed. They used to be left to canonicals alone, on the theory that a
 * canonical can tell a useful filter from an infinite one; in practice the
 * facet space was infinite, every combination was a full server render, and
 * a crawler that respects robots.txt has no business walking it. The pages
 * themselves still say `noindex, follow` with a canonical to the unfiltered
 * listing, for the crawler that arrives anyway through a link.
 *
 * Google and Bing pick the MOST SPECIFIC (longest) matching rule, so:
 *
 *   Disallow /katalogos/*?           any query …
 *   Allow    /katalogos/*?page=       … except one that starts with page= …
 *   Disallow /katalogos/*?page=*&     … and has nothing after it.
 */

export default function robots(): MetadataRoute.Robots {
  const facets = facetRules();
  const privatePaths = privateRules();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", ...privatePaths.allow, ...facets.allow],
        disallow: [...privatePaths.disallow, ...facets.disallow],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
    // The Merchant Center feed is fetched by Google on a schedule it is given
    // in the Merchant Center account, not discovered here — it is listed so a
    // person reading robots.txt can find it, and left crawlable so a fetch does
    // not have to be whitelisted.
    host: siteOrigin(),
  };
}
