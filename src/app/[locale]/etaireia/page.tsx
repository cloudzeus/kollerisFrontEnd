import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getCompanyProof } from "@/lib/catalog/editorial";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Η εταιρεία",
  description:
    "46 χρόνια στα βιομηχανικά εργαλεία. Δείτε τα νούμερα της αποθήκης μας ζωντανά — κωδικοί, απόθεμα, τόνοι στο ράφι.",
};

const FOUNDED = 1978;

/**
 * The company page.
 *
 * The idea, and the reason it is not the usual about page: every company page
 * in this trade says "decades of experience" and "wide range", and every buyer
 * has read a hundred of them. So this one makes no claim it cannot back with a
 * number read out of the warehouse at request time.
 *
 * "Μεγάλη γκάμα" becomes 5.305 codes. "Άμεση διαθεσιμότητα" becomes 4.644 of
 * them on the shelf, 891 tonnes of steel. "Τεχνική υποστήριξη" becomes 400.499
 * catalogued specifications. An engineer skims the adjectives and reads the
 * figures — so the figures are the page.
 */
export default async function CompanyPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [proof, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    getCompanyProof(locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  const years = new Date().getFullYear() - FOUNDED;
  const tonnes = Math.round(proof.stockKg / 1000);

  /*
   * Claim → evidence. The left column is what a company page normally asserts;
   * the right is the figure that makes it checkable. Pairing them is the whole
   * argument of the page.
   */
  const proofRows = [
    {
      claim: "Μεγάλη γκάμα",
      evidence: proof.products.toLocaleString("el-GR"),
      unit: "κωδικοί online",
      note: `σε ${proof.categories} κατηγορίες και ${proof.nodes.toLocaleString("el-GR")} υποκατηγορίες`,
    },
    {
      claim: "Άμεση διαθεσιμότητα",
      evidence: proof.inStock.toLocaleString("el-GR"),
      unit: "κωδικοί στο ράφι",
      note: `${proof.units.toLocaleString("el-GR")} τεμάχια, τώρα, στον Πειραιά`,
    },
    {
      claim: "Πραγματικό απόθεμα",
      evidence: tonnes.toLocaleString("el-GR"),
      unit: "τόνοι εργαλείων",
      note: "υπολογισμένοι από το βάρος κάθε κωδικού επί το απόθεμά του",
    },
    {
      claim: "Τεχνική τεκμηρίωση",
      evidence: proof.specs.toLocaleString("el-GR"),
      unit: "χαρακτηριστικά",
      note: `και ${proof.images.toLocaleString("el-GR")} φωτογραφίες προϊόντων`,
    },
    {
      claim: "Επίσημη αντιπροσώπευση",
      evidence: String(proof.brands),
      unit: "brands",
      note: "με εγγύηση κατασκευαστή, σέρβις και ανταλλακτικά",
    },
    {
      claim: "Συνέπεια στον χρόνο",
      evidence: String(years),
      unit: "χρόνια",
      note: `από το ${FOUNDED}, στην ίδια δουλειά`,
    },
  ];

  const timeline = [
    {
      year: "1978",
      title: "Η αρχή, στον Πειραιά",
      body: "Η Kolleris ξεκινά προμηθεύοντας εργαλεία σε ναυπηγεία και ναυτιλιακές εταιρείες. Η ίδια πόλη, η ίδια δουλειά, μέχρι σήμερα.",
    },
    {
      year: "1990s",
      title: "Από τα ναυπηγεία στη βιομηχανία",
      body: "Εργοστάσια, συνεργεία και τεχνικές εταιρείες. Η γκάμα ανοίγει από τα εργαλεία χειρός στα ηλεκτρικά και τα μηχανήματα.",
    },
    {
      year: "2000s",
      title: "Επίσημες αντιπροσωπείες",
      body: `Συνεργασίες με κατασκευαστές που κρατούν μέχρι σήμερα — ${proof.brands} brands με εγγύηση, σέρβις και ανταλλακτικά από εμάς.`,
    },
    {
      year: "Σήμερα",
      title: "Ο κατάλογος online",
      body: `Ολόκληρο το απόθεμα, με τιμές και διαθεσιμότητα σε πραγματικό χρόνο. ${proof.products.toLocaleString("el-GR")} κωδικοί, ενημερωμένοι από το ERP μας.`,
    },
  ];

  const promises = [
    {
      title: "Σηκώνουμε το τηλέφωνο",
      body: "Δεν υπάρχει chatbot ανάμεσα. Ρωτάτε για μια δουλειά, απαντά κάποιος που την έχει κάνει.",
    },
    {
      title: "Ό,τι λέει διαθέσιμο, είναι",
      body: "Η διαθεσιμότητα στο site είναι το ERP μας. Αν λέει 3 τεμάχια, υπάρχουν 3 τεμάχια.",
    },
    {
      title: "Γνήσιο, με εγγύηση",
      body: "Επίσημη αντιπροσώπευση σημαίνει εγγύηση κατασκευαστή και ανταλλακτικά — όχι παράλληλη εισαγωγή.",
    },
    {
      title: "Φεύγει σήμερα",
      body: "Παραγγελία πριν τις 15:00 φεύγει αυθημερόν. Παράδοση 24-48 ώρες πανελλαδικά.",
    },
  ];

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        {/* Hero */}
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek("Αρχική")}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek("Η εταιρεία")}</span>
          </nav>

          <div className="grid gap-8 pt-2.5 pb-9 lg:grid-cols-[1fr_360px] lg:items-end lg:gap-16 lg:pb-12">
            <div className="min-w-0">
              <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
                <span aria-hidden className="rule-accent block shrink-0" />
                {upGreek(`Πειραιάς · από το ${FOUNDED}`)}
              </p>
              <h1 className="font-artegra mt-3.5 text-[26px] leading-[1.12] font-medium text-balance text-white lg:text-[42px]">
                {upGreek("Δεν σας ζητάμε να μας πιστέψετε.")}
                <br />
                <span className="text-k-red">{upGreek("Δείτε τα νούμερα.")}</span>
              </h1>
              <p className="mt-5 max-w-[600px] text-[13.5px] leading-[1.7] text-white/60 lg:text-[15px]">
                Κάθε προμηθευτής εργαλείων γράφει «μεγάλη γκάμα» και «άμεση διαθεσιμότητα».
                Παρακάτω δεν θα βρείτε επίθετα — θα βρείτε τι ακριβώς υπάρχει στην αποθήκη
                μας αυτή τη στιγμή, διαβασμένο από το ERP μας τη στιγμή που φορτώνει η
                σελίδα.
              </p>
            </div>

            <div className="border-l-[3px] border-k-red pl-5 lg:pl-6">
              <p className="font-mono text-[46px] leading-none font-semibold text-white lg:text-[64px]">
                {years}
              </p>
              <p className="t-account-label mt-2 text-white/50">
                {upGreek("χρόνια στα εργαλεία")}
              </p>
              <p className="mt-3 text-[12.5px] leading-[1.6] text-white/45">
                Ναυπηγεία, εργοστάσια, συνεργεία. Οι ίδιοι πελάτες επί δεκαετίες — αυτό
                είναι το μόνο νούμερο που δεν μπορούμε να σας δείξουμε σε πίνακα.
              </p>
            </div>
          </div>
        </div>

        {/* Claim → evidence */}
        <section className="band-base">
          <div className="shell-x py-9 lg:py-14">
            <SectionHead
              eyebrow="Ζωντανά από την αποθήκη"
              title="Κάθε ισχυρισμός, με το νούμερό του"
              lead="Οι τιμές δεξιά δεν είναι γραμμένες σε κείμενο. Διαβάζονται από τη βάση σε κάθε επίσκεψη — αν αύριο αλλάξει το απόθεμα, αλλάζει και η σελίδα."
            />

            <dl className="mt-8 grid gap-px border border-k-line bg-k-line lg:mt-10 lg:grid-cols-2">
              {proofRows.map((row) => (
                <div
                  key={row.claim}
                  className="flex items-start justify-between gap-6 bg-white p-5 transition-colors hover:bg-k-surface-2 lg:p-7"
                >
                  <div className="min-w-0">
                    <dt className="text-[14px] leading-[1.3] font-semibold text-k-ink lg:text-[15px]">
                      {row.claim}
                    </dt>
                    <dd className="mt-1.5 text-[12.5px] leading-[1.6] text-k-text-3">{row.note}</dd>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block font-mono text-[24px] leading-none font-semibold text-k-ink lg:text-[30px]">
                      {row.evidence}
                    </span>
                    <span className="t-account-label mt-1.5 block text-k-text-4">
                      {upGreek(row.unit)}
                    </span>
                  </div>
                </div>
              ))}
            </dl>

            {proof.heaviestCategory && (
              <p className="mt-5 flex flex-wrap items-center gap-2 text-[12.5px] text-k-text-3">
                <span aria-hidden className="block h-1.5 w-1.5 bg-k-red" />
                Η μεγαλύτερη κατηγορία μας είναι{" "}
                <Link
                  href={`/katalogos/${proof.heaviestCategory.slug}`}
                  className="font-semibold text-k-ink underline underline-offset-4 hover:text-k-red"
                >
                  {proof.heaviestCategory.name}
                </Link>{" "}
                με {proof.heaviestCategory.count.toLocaleString("el-GR")} κωδικούς.
              </p>
            )}
          </div>
        </section>

        {/* Timeline */}
        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-9 lg:py-14">
            <SectionHead eyebrow="Η διαδρομή" title={`Από το ${FOUNDED} μέχρι σήμερα`} />

            <ol className="mt-8 grid gap-px border border-k-line bg-k-line lg:mt-10 lg:grid-cols-4">
              {timeline.map((step, index) => (
                <li key={step.year} className="flex flex-col gap-2.5 bg-white p-5 lg:p-7">
                  <span
                    className={`t-cat-num ${index === timeline.length - 1 ? "text-k-red" : "text-k-text-5"}`}
                  >
                    {step.year}
                  </span>
                  <span className="text-[14px] leading-[1.3] font-semibold text-k-ink">
                    {step.title}
                  </span>
                  <span className="text-[12.5px] leading-[1.65] text-k-text-3">{step.body}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Promises */}
        <section className="band-base border-t border-k-line">
          <div className="shell-x py-9 lg:py-14">
            <SectionHead
              eyebrow="Τι σημαίνει να αγοράζετε από εμάς"
              title="Τέσσερα πράγματα που δεν αλλάζουν"
            />
            <div className="mt-8 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-10 lg:grid-cols-4">
              {promises.map((item) => (
                <div key={item.title} className="border-l-[3px] border-k-red bg-white p-5 lg:p-6">
                  <p className="text-[13.5px] leading-[1.3] font-semibold text-k-ink">
                    {item.title}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-[1.65] text-k-text-3">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Brands */}
        {brands.length > 0 && (
          <section className="band-alt border-t border-k-line">
            <div className="shell-x py-9 lg:py-14">
              <SectionHead
                eyebrow="Επίσημη αντιπροσώπευση"
                title="Τα brands που εκπροσωπούμε"
                lead="Γνήσιο προϊόν, εγγύηση κατασκευαστή, σέρβις και ανταλλακτικά από εμάς — όχι παράλληλη εισαγωγή."
                meta={
                  <Link
                    href="/brands"
                    className="t-btn-sm inline-block border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                  >
                    {upGreek("Όλα τα brands")} →
                  </Link>
                }
              />
              <div className="mt-8 grid grid-cols-3 gap-px border border-k-line bg-k-line sm:grid-cols-4 lg:mt-10 lg:grid-cols-8">
                {brands.map((brand) => (
                  <Link
                    key={brand.slug}
                    href={`/brands/${brand.slug}`}
                    className="flex min-h-[96px] flex-col items-center justify-center gap-2 bg-white p-4 transition-colors hover:bg-k-surface-2"
                  >
                    {brand.logo ? (
                      <Image
                        src={brand.logo}
                        alt={brand.name}
                        width={128}
                        height={128}
                        className="block h-11 w-11 object-contain"
                      />
                    ) : (
                      <span className="t-brand-name text-center text-k-ink">{brand.name}</span>
                    )}
                    <span className="t-brand-count text-center text-k-text-4">{brand.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Contact */}
        <section className="band-ink band-grid">
          <div className="rule-hazard" />
          <div className="shell-x py-9 lg:py-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <SectionHead
                  tone="dark"
                  eyebrow="Μιλήστε μας"
                  title="Πείτε μας τη δουλειά, όχι τον κωδικό"
                  lead="Δεν ξέρετε ποιο εργαλείο κάνει; Περιγράψτε τι θέλετε να κάνετε. Σε 46 χρόνια το έχουμε ξανακούσει."
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="tel:+302104111355"
                  className="t-btn bg-k-red px-8 py-4 text-white transition-colors hover:bg-k-red-hover"
                >
                  210 411 1355
                </a>
                <Link
                  href="/epikoinonia"
                  className="t-btn-outline border-[1.5px] border-white/34 px-7 py-4 text-white transition-colors hover:border-white hover:bg-white hover:text-k-ink"
                >
                  {upGreek("Επικοινωνία")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
