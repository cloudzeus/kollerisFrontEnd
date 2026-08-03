import type { routing } from "@/i18n/routing";

/**
 * Tell next-intl which locales this app has.
 *
 * Without it `useLocale()` and `getLocale()` return a bare `string`, so every
 * call site that passes the result somewhere typed — `formatMoney(amount,
 * locale)` — needs a cast, and a cast is exactly the thing that would let
 * `"de"` through unnoticed. Declared once here, the three literals flow
 * everywhere.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
  }
}
