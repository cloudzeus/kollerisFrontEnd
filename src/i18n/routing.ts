import { defineRouting } from "next-intl/routing";

/**
 * Three locales, Greek default — mirrors HDCtool exactly (MTRAN,
 * ProductSpecifications, OfferTranslation are all el/en/it).
 *
 * `localePrefix: "as-needed"` means Greek is served from `/` and only `/en/…`
 * and `/it/…` carry a prefix. Greek is the primary market; giving it the bare
 * root is both the SEO-correct choice and what the existing site does.
 */
export const routing = defineRouting({
  locales: ["el", "en", "it"] as const,
  defaultLocale: "el",
  localePrefix: "as-needed",
  /**
   * Off deliberately. With an unprefixed default locale, Accept-Language
   * negotiation would make `/` serve Greek to one visitor and English to
   * another — different content at one URL, which breaks CDN caching and gives
   * crawlers an unstable canonical. `/` is always Greek; `/en` and `/it` are
   * reached explicitly via the switcher (which writes the cookie below).
   */
  localeDetection: false,
  localeCookie: {
    name: "KOLLERIS_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  el: "ΕΛ",
  en: "EN",
  it: "IT",
};
