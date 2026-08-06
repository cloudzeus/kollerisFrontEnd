import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { NewPasswordForm } from "@/components/account/EntryForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getCatalogueStats, getMenuTree, getRootCategories, getTopBrands } from "@/lib/catalog/queries";
import { resolveResetToken } from "@/lib/account/password-reset";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Νέος κωδικός",
  robots: { index: false, follow: false },
};

/** Set a new password. An expired link is explained, not 404'd. */
export default async function NewPasswordPage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const [resolved, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    resolveResetToken(token),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  return (
    <>
      <SiteChrome locale={locale} cart={miniCart} categories={menuTree} brands={brands} stats={stats} />
      <main id="main" className="shell-w bg-white">
        <div className="mx-auto max-w-[440px] px-4 py-14 lg:py-20">
          <h1 className="font-artegra text-[26px] leading-[1.16] font-medium text-k-ink">
            Νέος κωδικός
          </h1>

          {resolved ? (
            <>
              <p className="numeral mt-3 mb-7 text-[13px] text-k-text-3">{resolved.email}</p>
              <NewPasswordForm token={token} />
            </>
          ) : (
            <>
              <p className="mt-3 mb-7 text-[13.5px] leading-[1.65] text-k-text-2">
                Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί. Ζητήστε καινούριο.
              </p>
              <Link
                href="/eisodos/prosvasi"
                className="t-btn inline-block bg-k-ink px-8 py-[15px] text-white transition-colors hover:bg-k-red"
              >
                ΝΕΟΣ ΣΥΝΔΕΣΜΟΣ
              </Link>
            </>
          )}
        </div>
      </main>
      <SiteFooter categories={rootCategories} />
    </>
  );
}
