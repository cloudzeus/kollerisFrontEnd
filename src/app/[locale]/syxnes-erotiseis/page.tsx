import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { getFaq } from "@/lib/faq/faq";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Συχνές ερωτήσεις",
  description:
    "Αποστολή, τιμές, εγγύηση, επιστροφές και εταιρικοί λογαριασμοί — οι απαντήσεις που ζητούνται περισσότερο.",
};

export default async function FaqPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [sections, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    getFaq(locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  const total = sections.reduce((n, s) => n + s.entries.length, 0);

  /**
   * FAQPage JSON-LD, built from the SAME array the page renders.
   *
   * Google shows these answers directly in results, so a structured block that
   * drifts from the visible page is worse than none — this cannot drift,
   * because there is only one source.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: sections.flatMap((section) =>
      section.entries.map((entry) => ({
        "@type": "Question",
        name: entry.q,
        acceptedAnswer: { "@type": "Answer", text: entry.a },
      })),
    ),
  };

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek("Αρχική")}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek("Συχνές ερωτήσεις")}</span>
          </nav>

          <div className="grid gap-6 pt-2.5 pb-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
            <div className="min-w-0">
              <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-balance text-white lg:text-[30px]">
                {upGreek("Συχνές ερωτήσεις")}
              </h1>
              <p className="mt-3.5 max-w-[620px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                {total} απαντήσεις για αποστολή, τιμές, εγγύηση και εταιρικούς λογαριασμούς.
                Κάθε νούμερο παρακάτω διαβάζεται από το σύστημα — δεν είναι γραμμένο σε
                κείμενο.
              </p>
            </div>

            <div className="shrink-0 border-l-[3px] border-k-red pl-5">
              <p className="t-account-label text-white/50">{upGreek("Δεν το βρήκατε;")}</p>
              <a
                href="tel:+302104111355"
                className="mt-1.5 block font-mono text-[19px] leading-none font-semibold text-white transition-colors hover:text-k-red lg:text-[24px]"
              >
                210 411 1355
              </a>
              <p className="t-brand-count mt-2 text-white/45">{upGreek("Δευ–Παρ 08:00–16:30")}</p>
            </div>
          </div>
        </div>

        <section className="band-base">
          <div className="shell-x py-8 lg:py-12">
            <FaqAccordion sections={sections} />
          </div>
        </section>

        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-8 lg:py-12">
            <SectionHead
              eyebrow="Δεν απαντήθηκε"
              title="Ρωτήστε μας κατευθείαν"
              lead="Αν η ερώτησή σας δεν είναι εδώ, μάλλον αξίζει να μπει. Γράψτε μας ή σηκώστε το τηλέφωνο."
              meta={
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/epikoinonia"
                    className="t-btn-sm bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
                  >
                    {upGreek("Επικοινωνία")} →
                  </Link>
                  <a
                    href="tel:+302104111355"
                    className="t-btn-sm border-[1.5px] border-k-ink px-7 py-4 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                  >
                    210 411 1355
                  </a>
                </div>
              }
            />
          </div>
        </section>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
