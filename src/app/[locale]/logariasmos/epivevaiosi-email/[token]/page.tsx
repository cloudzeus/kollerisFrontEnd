import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getCatalogueStats, getMenuTree, getRootCategories, getTopBrands } from "@/lib/catalog/queries";
import { confirmEmailProof } from "@/lib/account/email-proof";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Επιβεβαίωση email",
  robots: { index: false, follow: false },
};

/**
 * The link from the «Επιβεβαίωση email» message.
 *
 * Opening it is the proof: it reached the mailbox. It needs no sign-in — the
 * customer often opens mail on a phone where they are not signed in — and it
 * says plainly what happened and where to go next, including when the link is
 * spent, which is what a second click or a mail scanner's visit looks like.
 */
export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const [result, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    confirmEmailProof(token),
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  return (
    <>
      <SiteChrome locale={locale} cart={miniCart} categories={menuTree} brands={brands} stats={stats} />
      <main id="main" className="shell-w bg-white">
        <div className="mx-auto max-w-[480px] px-4 py-14 lg:py-20">
          {result ? (
            <>
              <h1 className="font-display text-[26px] leading-[1.16] t-display text-k-ink">
                Το email σας επιβεβαιώθηκε
              </h1>
              <p className="mt-3 text-[13.5px] leading-[1.65] text-k-text-2">
                {result.adopted === 1
                  ? "Μία παραγγελία που κάνατε ως επισκέπτης προστέθηκε στον λογαριασμό σας."
                  : result.adopted > 1
                    ? `${result.adopted} παραγγελίες που κάνατε ως επισκέπτης προστέθηκαν στον λογαριασμό σας.`
                    : "Δεν βρέθηκαν παραγγελίες επισκέπτη με αυτό το email. Όσες κάνετε από εδώ και πέρα θα εμφανίζονται στον λογαριασμό σας."}
              </p>
              <p className="mt-2 mb-7 text-[13px] leading-[1.65] text-k-text-3">
                Αν σας ζητηθεί, συνδεθείτε με το email και τον κωδικό σας για να τις δείτε.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-[26px] leading-[1.16] t-display text-k-ink">
                Ο σύνδεσμος δεν ισχύει πια
              </h1>
              <p className="mt-3 text-[13.5px] leading-[1.65] text-k-text-2">
                Έχει λήξει ή έχει ήδη χρησιμοποιηθεί. Αν τον πατήσατε ήδη μία φορά, το email σας
                είναι επιβεβαιωμένο και δεν χρειάζεται να κάνετε κάτι άλλο.
              </p>
              <p className="mt-2 mb-7 text-[13px] leading-[1.65] text-k-text-3">
                Αλλιώς, συνδεθείτε και ζητήστε νέο σύνδεσμο από τη σελίδα «Οι παραγγελίες μου».
              </p>
            </>
          )}
          <Link
            href="/logariasmos/paraggelies"
            className="t-btn inline-block bg-k-ink px-8 py-[15px] text-white transition-colors hover:bg-k-red"
          >
            ΟΙ ΠΑΡΑΓΓΕΛΙΕΣ ΜΟΥ
          </Link>
        </div>
      </main>
      <SiteFooter categories={rootCategories} />
    </>
  );
}
