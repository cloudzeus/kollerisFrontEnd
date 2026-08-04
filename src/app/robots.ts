import type { MetadataRoute } from "next";
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
 *   /logariasmos  somebody's orders and addresses
 *
 * The confirmation page is excluded through /checkout. It carries a guest token
 * in the query string, so an indexed copy would be a stranger's order with the
 * key attached.
 *
 * Search parameters are not blocked here. Facet combinations are handled with
 * canonicals on the pages themselves, which is the tool that can tell a useful
 * filter from an infinite one; a `Disallow: /*?` would also hide the ones worth
 * ranking.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/kalathi", "/checkout", "/logariasmos", "/eisodos", "/eggrafi"],
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
