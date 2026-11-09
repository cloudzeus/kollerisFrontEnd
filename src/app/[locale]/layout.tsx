import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { pickClientMessages } from "@/i18n/client-namespaces";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getSettingNumber } from "@/lib/settings/settings";

/** Pre-render all three locales at build time. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for static rendering of this segment.
  setRequestLocale(locale);

  /*
   * The width the storefront stops growing at.
   *
   * Set here rather than in the stylesheet so an operator can change it without
   * a deploy, and read on the storefront only — `/admin` is a different tree
   * with its own density. `.shell-x` already centres content at this width by
   * turning the surplus into padding; the banner shell now honours it too, so a
   * full-bleed band and the catalogue beneath it line up instead of the banner
   * running out to the bezel on its own.
   */
  const [maxWidth, messages] = await Promise.all([getSettingNumber("shop.maxWidth"), getMessages()]);

  return (
    <NextIntlClientProvider messages={pickClientMessages(messages)}>
      <div
        className="page-shell"
        style={maxWidth ? ({ "--shell-max": `${maxWidth}px` } as React.CSSProperties) : undefined}
      >
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
