import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ContactForm } from "@/components/contact/ContactForm";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { HOURS, openState } from "@/lib/contact/hours";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Επικοινωνία",
  description:
    "Τηλέφωνο, email και φόρμα επικοινωνίας. Πειραιάς, Δευτέρα–Παρασκευή 08:00–16:30. Σηκώνει άνθρωπος.",
};

/**
 * Contact.
 *
 * The one live element is the open/closed badge, computed from the request's
 * clock in Europe/Athens. A hardcoded "ανοιχτά" is a small lie that costs a
 * phone call at nine at night and a customer who does not call twice.
 *
 * The page is dynamic for that reason — `openState` reads the current time, so
 * caching it would freeze the badge at build time.
 */
export const dynamic = "force-dynamic";

export default async function ContactPage({
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

  const now = openState(new Date());
  /** Under half an hour to close is worth saying out loud. */
  const closingSoon = now.open && now.minutesUntilChange <= 30;

  const channels = [
    {
      label: "Τηλέφωνο",
      value: "210 411 1355",
      href: "tel:+302104111355",
      note: "Σηκώνει άνθρωπος, όχι μενού.",
      primary: true,
    },
    {
      label: "Email",
      value: "info@kolleris.com",
      href: "mailto:info@kolleris.com",
      note: "Απάντηση την ίδια εργάσιμη.",
    },
    {
      label: "Κατάστημα",
      value: "Κ. Μαυρομιχάλη 4, Πειραιάς",
      href: "https://maps.google.com/?q=Κ.+Μαυρομιχάλη+4,+Πειραιάς",
      note: "Παραλαβή παραγγελίας σε 2 ώρες.",
      external: true,
    },
    {
      label: "Ωράριο",
      value: `Δευ–Παρ ${String(HOURS.weekday.open).padStart(2, "0")}:00–16:30`,
      note: "Σάββατο και Κυριακή κλειστά.",
    },
  ];

  const direct = [
    { area: "Τεχνική υποστήριξη", body: "Ποιο εργαλείο κάνει για τη δουλειά, συμβατότητες, ανταλλακτικά." },
    { area: "Προσφορές & ποσότητες", body: "Τιμή για ποσότητα, σετ, εξοπλισμός συνεργείου." },
    { area: "Παραγγελίες & αποστολές", body: "Εντοπισμός, τιμολόγια, επιστροφές, εγγυήσεις." },
    { area: "Συνεργασίες B2B", body: "Εταιρικός λογαριασμός, τιμή συνεργάτη, πληρωμή επί πιστώσει." },
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
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek("Αρχική")}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek("Επικοινωνία")}</span>
          </nav>

          <div className="grid gap-6 pt-2.5 pb-9 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
            <div className="min-w-0">
              <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-balance text-white lg:text-[30px]">
                {upGreek("Πείτε μας τη δουλειά, όχι τον κωδικό")}
              </h1>
              <p className="mt-3.5 max-w-[620px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                Δεν χρειάζεται να ξέρετε τι ακριβώς ζητάτε. Περιγράψτε τι θέλετε να κάνετε —
                σε 46 χρόνια το έχουμε ξανακούσει.
              </p>
            </div>

            {/* Live status — the reason this page is not statically cached. */}
            <div
              className={`shrink-0 border-l-[3px] pl-5 ${now.open ? "border-k-green" : "border-k-amber"}`}
            >
              <p
                className={`t-card-stock flex items-center gap-2 ${
                  now.open ? "text-k-green-2" : "text-k-amber"
                }`}
              >
                <span aria-hidden className="rounded-pill block h-2 w-2 bg-current" />
                {upGreek(now.label)}
              </p>
              <p className="t-brand-count mt-2 font-mono text-white/45">
                {upGreek(`Ώρα Ελλάδας ${now.now}`)}
              </p>
              {closingSoon && (
                <p className="mt-2 text-[12px] leading-[1.5] text-white/70">
                  Κλείνουμε σε {now.minutesUntilChange}′ — προλαβαίνετε ένα τηλέφωνο.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Channels */}
        <dl className="shell-w grid grid-cols-2 gap-px border-b border-k-line bg-k-line lg:grid-cols-4">
          {channels.map((channel) => {
            const body = (
              <>
                <dt className="t-account-label text-k-text-4">{upGreek(channel.label)}</dt>
                <dd
                  className={`mt-1.5 leading-[1.25] font-semibold text-k-ink ${
                    channel.primary ? "font-mono text-[19px] lg:text-[23px]" : "text-[14px]"
                  }`}
                >
                  {channel.value}
                </dd>
                <dd className="mt-1.5 text-[12px] leading-[1.5] text-k-text-3">{channel.note}</dd>
              </>
            );

            return channel.href ? (
              <a
                key={channel.label}
                href={channel.href}
                {...(channel.external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="bg-white px-5 py-4 transition-colors hover:bg-k-surface-2 lg:px-8 lg:py-6"
              >
                {body}
              </a>
            ) : (
              <div key={channel.label} className="bg-white px-5 py-4 lg:px-8 lg:py-6">
                {body}
              </div>
            );
          })}
        </dl>

        {/* Form + who answers what */}
        <section className="band-base">
          <div className="shell-x py-9 lg:py-14">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_clamp(300px,30%,400px)] lg:gap-16">
              <div className="min-w-0">
                <SectionHead
                  eyebrow="Φόρμα"
                  title="Γράψτε μας"
                  lead="Διαλέξτε θέμα και τα πεδία προσαρμόζονται. Απαντάμε συνήθως την ίδια εργάσιμη."
                />
                <div className="mt-8 lg:mt-10">
                  <ContactForm locale={locale} pagePath="/epikoinonia" />
                </div>
              </div>

              <aside className="self-start border border-k-line bg-white">
                <p className="flex items-center gap-2.5 border-b border-k-line px-5 py-3.5">
                  <span aria-hidden className="rule-accent block shrink-0" />
                  <span className="t-eyebrow text-k-red">{upGreek("Ποιος απαντά τι")}</span>
                </p>
                <ul>
                  {direct.map((item) => (
                    <li key={item.area} className="border-b border-k-line px-5 py-3.5 last:border-b-0">
                      <p className="text-[13px] font-semibold text-k-ink">{item.area}</p>
                      <p className="mt-1 text-[12px] leading-[1.55] text-k-text-3">{item.body}</p>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-k-line bg-k-surface-2 px-5 py-4">
                  <p className="text-[12.5px] leading-[1.6] text-k-text-2">
                    Όλα περνούν από το ίδιο τηλέφωνο. Δεν σας μεταφέρουμε σε τμήματα.
                  </p>
                  <a
                    href="tel:+302104111355"
                    className="t-btn-sm mt-3.5 inline-block bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
                  >
                    210 411 1355
                  </a>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Self-service, so the obvious questions never become a message */}
        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-9 lg:py-12">
            <SectionHead
              eyebrow="Πριν μας γράψετε"
              title="Ίσως το βρείτε πιο γρήγορα μόνοι σας"
              lead="Τα τρία πράγματα που μας ρωτούν περισσότερο έχουν απάντηση χωρίς τηλέφωνο."
            />
            <div className="mt-7 grid gap-px border border-k-line bg-k-line sm:grid-cols-3 lg:mt-9">
              {[
                {
                  title: "Διαθεσιμότητα και τιμή",
                  body: "Ό,τι βλέπετε στο site είναι το ERP μας. Αν λέει 3 τεμάχια, υπάρχουν 3.",
                  href: "/katalogos",
                  cta: "Στον κατάλογο",
                },
                {
                  title: "Ψάχνετε κωδικό",
                  body: "Η αναζήτηση δέχεται κωδικό Kolleris, κωδικό κατασκευαστή και EAN.",
                  href: "/anazitisi",
                  cta: "Αναζήτηση",
                },
                {
                  title: "Τιμή συνεργάτη",
                  body: "Εταιρικός λογαριασμός με μόνιμη έκπτωση, τιμολόγιο και πληρωμή επί πιστώσει.",
                  href: "/eggrafi",
                  cta: "Αίτηση B2B",
                },
              ].map((item) => (
                <div key={item.title} className="flex flex-col gap-2.5 bg-white p-5 lg:p-6">
                  <p className="text-[13.5px] leading-[1.3] font-semibold text-k-ink">
                    {item.title}
                  </p>
                  <p className="text-[12.5px] leading-[1.65] text-k-text-3">{item.body}</p>
                  <Link
                    href={item.href}
                    className="t-card-cta mt-auto self-start border-b-[1.5px] border-k-red pt-2 pb-[3px] text-k-ink transition-colors hover:text-k-red"
                  >
                    {upGreek(item.cta)} →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
