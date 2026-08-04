import type { Locale } from "@/i18n/routing";

/**
 * The back office is Greek, and it is Greek in one place.
 *
 * `/admin` sits outside the `[locale]` segment on purpose — it is staff-facing,
 * it is not translated, and it is not crawled. That also means next-intl's
 * provider is not mounted there, so `useLocale()`, `useTranslations()` and the
 * server equivalents all throw "No intl context found" the moment an admin page
 * renders.
 *
 * That has now broken three separate features — banner button links, the offer
 * widget preview, and the orders table after prices became locale-aware — each
 * time because a component written for the storefront was reused, or a codemod
 * treated `/admin` like everywhere else. So anything under `/admin` that needs
 * a locale takes this constant instead of asking for one.
 */
export const ADMIN_LOCALE: Locale = "el";
