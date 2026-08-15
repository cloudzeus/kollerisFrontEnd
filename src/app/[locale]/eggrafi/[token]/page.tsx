import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { AcceptInviteForm } from "@/components/account/EntryForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getCatalogueStats, getMenuTree, getRootCategories, getTopBrands } from "@/lib/catalog/queries";
import { resolveInvite } from "@/lib/account/registration-invite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ολοκλήρωση εγγραφής",
  robots: { index: false, follow: false },
};

/**
 * The end of a registration invitation.
 *
 * An expired or spent link is answered on the page rather than with a 404: the
 * person following it did nothing wrong, and "this link has expired, here is
 * how to get another" is the only useful thing to say. A 404 would read as
 * though the shop had lost them.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const [invite, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    resolveInvite(token),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  const name = invite ? `${invite.firstName} ${invite.lastName}`.trim() : "";

  return (
    <>
      <SiteChrome locale={locale} cart={miniCart} categories={menuTree} brands={brands} stats={stats} />
      <main id="main" className="shell-w bg-white">
        <div className="mx-auto max-w-[440px] px-4 py-14 lg:py-20">
          <h1 className="font-display text-[26px] leading-[1.16] font-medium text-k-ink">
            Ολοκλήρωση εγγραφής
          </h1>

          {invite ? (
            <>
              <p className="mt-3 mb-7 text-[13.5px] leading-[1.65] text-k-text-2">
                Επιλέξτε κωδικό. Θα βρείτε αμέσως όλες τις παραγγελίες που έχετε κάνει με
                αυτό το email.
              </p>
              <AcceptInviteForm token={token} email={invite.email} name={name} />
            </>
          ) : (
            <>
              <p className="mt-3 mb-7 text-[13.5px] leading-[1.65] text-k-text-2">
                Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί. Ζητήστε καινούριο με το email
                και τον κωδικό μιας παραγγελίας σας.
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
