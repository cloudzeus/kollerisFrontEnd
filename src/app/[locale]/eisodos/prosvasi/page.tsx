import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ClaimAccountForm, ForgotPasswordForm } from "@/components/account/EntryForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getCatalogueStats, getMenuTree, getRootCategories, getTopBrands } from "@/lib/catalog/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Πρόσβαση στον λογαριασμό",
  robots: { index: false, follow: false },
};

/**
 * The two ways back in, side by side.
 *
 * They look like one problem to whoever is stuck — "I cannot get into my
 * account" — and splitting them across two pages makes somebody guess which of
 * the two they have before they can ask for help. Both are here, labelled by
 * the situation rather than by the mechanism.
 */
export default async function AccessPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
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
        <div className="mx-auto max-w-[880px] px-4 py-14 lg:py-20">
          <h1 className="font-artegra text-[26px] leading-[1.16] font-medium text-k-ink">
            Πρόσβαση στον λογαριασμό
          </h1>
          <p className="mt-3 text-[13.5px] leading-[1.65] text-k-text-2">
            Επιλέξτε αυτό που σας ταιριάζει. Σε κάθε περίπτωση θα λάβετε έναν σύνδεσμο στο
            email σας.
          </p>

          <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-14">
            <section>
              <h2 className="t-eyebrow mb-1 text-k-red">ΕΧΩ ΞΕΧΑΣΕΙ ΤΟΝ ΚΩΔΙΚΟ</h2>
              <p className="mb-6 text-[13px] leading-[1.6] text-k-text-3">
                Έχετε λογαριασμό αλλά δεν θυμάστε τον κωδικό.
              </p>
              <ForgotPasswordForm />
            </section>

            <section className="border-t border-k-line pt-10 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-14">
              <h2 className="t-eyebrow mb-1 text-k-red">ΕΧΩ ΠΑΡΑΓΓΕΙΛΕΙ, ΔΕΝ ΕΧΩ ΛΟΓΑΡΙΑΣΜΟ</h2>
              <p className="mb-6 text-[13px] leading-[1.6] text-k-text-3">
                Αγοράσατε ως επισκέπτης και θέλετε να βλέπετε τις παραγγελίες σας.
              </p>
              <ClaimAccountForm />
            </section>
          </div>

          <p className="mt-12 border-t border-k-line pt-6 text-[13px] text-k-text-3">
            Θυμηθήκατε τον κωδικό σας;{" "}
            <Link href="/eisodos" className="text-k-ink underline-offset-2 hover:underline">
              Σύνδεση
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter categories={rootCategories} />
    </>
  );
}
