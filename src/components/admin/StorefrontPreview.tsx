import { NextIntlClientProvider } from "next-intl";
import { ADMIN_LOCALE } from "@/lib/admin/locale";
import messages from "@/messages/el.json";

/**
 * Storefront components, rendered inside the back office.
 *
 * `/admin` sits outside the `[locale]` segment on purpose and therefore has no
 * next-intl provider. That is the right arrangement, and `ADMIN_LOCALE` covers
 * anything admin-written that needs a locale. What it does not cover is the
 * other direction: the admin previews real storefront components so that what
 * the editor sees is what the customer gets, and those components translate
 * themselves. Reached from here they threw "the context from
 * NextIntlClientProvider was not found", which React reports at the leaf
 * (`Strip`, `OfferCountdown`) rather than at the import that caused it.
 *
 * This is the provider for exactly that case. It carries only the namespaces
 * the previewed components ask for, not the whole 63 KB bundle: `offers` is
 * 0.3 KB, so a preview costs nothing a staff page will notice.
 *
 * **Adding a new preview?** Add its namespace below. The message-key test walks
 * the import graph out of `/admin` and names any storefront component that
 * translates itself without one, so a missing namespace fails the build rather
 * than a page.
 */

/** Namespaces used by storefront components the admin renders. */
const PREVIEW_NAMESPACES = ["offers"] as const;

const previewMessages = Object.fromEntries(
  PREVIEW_NAMESPACES.map((ns) => [ns, messages[ns]]),
);

export function StorefrontPreview({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale={ADMIN_LOCALE} messages={previewMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
