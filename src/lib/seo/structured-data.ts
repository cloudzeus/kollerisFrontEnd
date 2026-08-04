import { absoluteUrl, siteOrigin } from "@/lib/seo/urls";
import type { Locale } from "@/i18n/routing";

/**
 * Structured data for the whole site.
 *
 * The product schema on the product page already tells a machine what one item
 * is. What was missing is what the *shop* is: who runs it, where it is, how to
 * search it. A search engine builds a knowledge panel from that, and a language
 * model answering "where can I buy Milwaukee tools in Piraeus" has nothing to
 * quote without it.
 *
 * Written from the same constants the pages use rather than restated, so the
 * phone number in a knowledge panel cannot drift from the one in the footer.
 */

/** The shop. Kept here because three surfaces need the same facts. */
export const SHOP = {
  name: "Kolleris",
  legalName: "ΚΟΛΛΕΡΗΣ",
  phone: "+302104111355",
  email: "info@kolleris.com",
  street: "Κ. Μαυρομιχάλη 4",
  city: "Πειραιάς",
  postcode: "18545",
  country: "GR",
  lat: 37.949726,
  lon: 23.642506,
  founded: "1980",
} as const;

/**
 * Organisation and site.
 *
 * `LocalBusiness` rather than plain `Organization`: there is a counter, an
 * address and opening hours, and "collect in two hours from Piraeus" is the
 * thing worth surfacing. A `SearchAction` lets a search engine offer the site's
 * own search box, and tells an agent the URL shape for a query rather than
 * leaving it to guess.
 */
export function siteJsonLd(locale: Locale) {
  const origin = siteOrigin();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HardwareStore",
        "@id": `${origin}/#shop`,
        name: SHOP.name,
        legalName: SHOP.legalName,
        url: absoluteUrl("/", locale),
        telephone: SHOP.phone,
        email: SHOP.email,
        foundingDate: SHOP.founded,
        priceRange: "€€",
        currenciesAccepted: "EUR",
        address: {
          "@type": "PostalAddress",
          streetAddress: SHOP.street,
          addressLocality: SHOP.city,
          postalCode: SHOP.postcode,
          addressCountry: SHOP.country,
        },
        geo: { "@type": "GeoCoordinates", latitude: SHOP.lat, longitude: SHOP.lon },
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            opens: "08:00",
            closes: "16:30",
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: absoluteUrl("/", locale),
        name: SHOP.name,
        publisher: { "@id": `${origin}/#shop` },
        inLanguage: locale,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${absoluteUrl("/anazitisi", locale)}?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/**
 * A trail a machine can follow.
 *
 * The storefront shows breadcrumbs as text; this is the same trail said in a
 * way a crawler uses to draw the path under a search result, instead of the
 * bare URL it falls back to.
 */
export function breadcrumbJsonLd(
  trail: Array<{ name: string; path: string }>,
  locale: Locale,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absoluteUrl(step.path, locale),
    })),
  };
}
