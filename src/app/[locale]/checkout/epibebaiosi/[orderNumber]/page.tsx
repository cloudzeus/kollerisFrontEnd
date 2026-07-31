import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Η παραγγελία σας",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ locale: Locale; orderNumber: string }>;
  searchParams: Promise<{ t?: string; s?: string }>;
};

const STEPS = [
  { key: "PENDING_PAYMENT", label: "Καταχωρήθηκε" },
  { key: "CONFIRMED", label: "Επιβεβαιώθηκε" },
  { key: "SHIPPED", label: "Απεστάλη" },
  { key: "DELIVERED", label: "Παραδόθηκε" },
] as const;

export default async function ConfirmationPage({ params, searchParams }: PageProps) {
  const { locale, orderNumber } = await params;
  const { t } = await searchParams;
  setRequestLocale(locale);

  const [order, miniCart, menuTree, brands, stats, rootCategories] = await Promise.all([
    prisma.order.findUnique({ where: { orderNumber }, include: { lines: true } }),
    getMiniCart(locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
  ]);

  /*
   * The guest token is what makes this page private. Without it an order number
   * — which is sequential and therefore guessable — would expose a stranger's
   * name, address and phone. Accounts (Phase 6) will add a second way in.
   */
  if (!order || !t || t !== order.guestToken) notFound();

  const currentStep = STEPS.findIndex((s) => s.key === order.status);
  const stepIndex = currentStep === -1 ? 0 : currentStep;
  const quote = order.shippingQuote as
    | { zoneLabel?: string; chargeableKg?: number; etaDays?: string }
    | null;

  const awaitingPayment = order.paymentStatus === "PENDING";

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
        <div className="shell-x bg-k-ink-deep py-10 lg:py-14">
          <p className="t-eyebrow mb-3.5 text-k-red">
            {awaitingPayment
              ? upGreek("Αναμονή πληρωμής")
              : upGreek("Ευχαριστούμε για την παραγγελία")}
          </p>
          <h1 className="font-artegra text-[26px] leading-[1.14] font-medium text-white lg:text-[34px]">
            {awaitingPayment
              ? upGreek("Η παραγγελία σας κρατήθηκε")
              : upGreek("Η παραγγελία σας καταχωρήθηκε")}
          </h1>
          <p className="mt-4 flex flex-wrap items-center gap-3">
            <span className="t-account-label text-white/50">{upGreek("Αριθμός")}</span>
            <span className="border border-white/20 px-3 py-2 font-mono text-[15px] font-semibold text-white">
              {order.orderNumber}
            </span>
          </p>
          <p className="mt-4 max-w-[560px] text-[13.5px] leading-[1.65] text-white/60">
            Στείλαμε επιβεβαίωση στο {order.email}.
            {awaitingPayment &&
              " Μόλις ολοκληρωθεί η πληρωμή, η παραγγελία περνά αυτόματα σε επεξεργασία."}
          </p>
        </div>

        {/* Tracking */}
        <div className="grid gap-px border-b border-k-line bg-k-line sm:grid-cols-4">
          {STEPS.map((step, index) => {
            const done = index <= stepIndex && order.status !== "FAILED";
            return (
              <div key={step.key} className="bg-white px-4 py-5">
                <span
                  className={`t-cat-num ${done ? "text-k-red" : "text-k-text-5"}`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p
                  className={`mt-2 text-[12.5px] font-semibold ${
                    done ? "text-k-ink" : "text-k-text-4"
                  }`}
                >
                  {step.label}
                </p>
                <span
                  className={`mt-2.5 block h-1 ${done ? "bg-k-red" : "bg-k-line"}`}
                />
              </div>
            );
          })}
        </div>

        <div className="shell-w lg:grid lg:grid-cols-[1fr_400px] lg:items-start">
          <div className="min-w-0 border-k-line px-4 py-8 lg:border-r lg:px-10">
            {/* Details */}
            <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2">
              <Block title="Παράδοση">
                {order.firstName} {order.lastName}
                <br />
                {order.shipLine1}
                {order.shipLine2 && <>, {order.shipLine2}</>}
                <br />
                {order.shipPostcode} {order.shipCity}
                <br />
                {order.phone}
              </Block>

              <Block title="Τιμολόγηση">
                {order.wantsInvoice ? (
                  <>
                    {order.companyName}
                    <br />
                    ΑΦΜ {order.vatNumber}
                    {order.taxOffice && <> · ΔΟΥ {order.taxOffice}</>}
                  </>
                ) : (
                  <>Απόδειξη λιανικής</>
                )}
              </Block>

              <Block title="Αποστολή">
                {order.shippingMethod === "pickup"
                  ? "Παραλαβή από Πειραιά"
                  : `ACS · ${quote?.zoneLabel ?? "—"}`}
                {quote?.chargeableKg != null && (
                  <>
                    <br />
                    {quote.chargeableKg} kg χρεώσιμο βάρος
                  </>
                )}
                {quote?.etaDays && (
                  <>
                    <br />
                    {quote.etaDays} εργάσιμες
                  </>
                )}
              </Block>

              <Block title="Πληρωμή">
                {
                  {
                    card: "Κάρτα (Viva Wallet)",
                    iris: "IRIS",
                    bank: "Τραπεζική κατάθεση",
                    cod: "Αντικαταβολή",
                    credit: "Επί πιστώσει",
                  }[order.paymentMethod] ?? order.paymentMethod
                }
                <br />
                {
                  {
                    PENDING: "Σε αναμονή",
                    PAID: "Εξοφλήθηκε",
                    FAILED: "Απέτυχε",
                    REFUNDED: "Επιστράφηκε",
                    ON_DELIVERY: "Κατά την παράδοση",
                  }[order.paymentStatus]
                }
              </Block>
            </div>

            {order.notes && (
              <p className="mt-5 border-l-[3px] border-k-line-2 bg-k-surface-2 px-4 py-3 text-[12.5px] text-k-text-2">
                <span className="t-account-label mb-1 block text-k-text-4">
                  {upGreek("Σχόλια")}
                </span>
                {order.notes}
              </p>
            )}

            {/* Items */}
            <h2 className="t-footer-col mt-8 mb-3 text-k-text-4">{upGreek("Προϊόντα")}</h2>
            <div className="border border-k-line">
              {order.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-4 border-b border-k-line-3 px-4 py-3.5 last:border-0"
                >
                  <span className="relative flex h-14 w-14 shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1">
                    {line.imageUrl && (
                      <Image
                        src={line.imageUrl}
                        alt=""
                        width={56}
                        height={56}
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-card-brand block text-k-red">{line.brand ?? "—"}</span>
                    <span className="mt-0.5 block text-[12.5px] font-semibold text-k-ink">
                      {line.name}
                    </span>
                    <span className="t-card-sku mt-0.5 block text-k-text-4">
                      {line.sku} · {line.quantity} τεμ.
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[14px] font-semibold text-k-ink">
                    {formatMoney(Number(line.lineGross))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <aside className="px-4 py-8 lg:px-8">
            <div className="bg-k-ink px-5 py-6">
              <dl className="flex flex-col gap-2.5">
                {[
                  { k: "Καθαρή αξία", v: formatMoney(Number(order.subtotalNet)) },
                  {
                    k: "Μεταφορικά",
                    v:
                      Number(order.shippingGross) === 0
                        ? upGreek("Δωρεάν")
                        : formatMoney(Number(order.shippingGross)),
                  },
                  { k: "ΦΠΑ", v: formatMoney(Number(order.vatAmount)) },
                ].map((row) => (
                  <div key={row.k} className="flex items-baseline justify-between gap-4">
                    <dt className="text-[12.5px] text-white/55">{row.k}</dt>
                    <dd className="font-mono text-[13px] font-medium text-white">{row.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/16 pt-4">
                <p className="t-footer-col text-white/50">{upGreek("Σύνολο")}</p>
                <p className="font-mono text-[30px] leading-none font-semibold tracking-[-0.03em] text-white">
                  {formatMoney(Number(order.totalGross))}
                </p>
              </div>
            </div>

            <Link
              href="/katalogos"
              className="t-btn-sm mt-4 flex h-12 items-center justify-center border-[1.5px] border-k-ink text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek("Συνεχίστε τις αγορές")} →
            </Link>
          </aside>
        </div>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-4">
      <p className="t-account-label mb-2 text-k-text-4">{upGreek(title)}</p>
      <p className="text-[12.5px] leading-[1.6] text-k-ink">{children}</p>
    </div>
  );
}
