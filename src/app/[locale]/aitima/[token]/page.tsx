import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { RequestActions } from "@/components/requests/RequestActions";
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
import {
  compareOffer,
  isWellFormedToken,
  offerHasExpired,
  offerShippingNet,
  priceLines,
  readSnapshot,
  readStoredOffer,
  type ComparisonRow,
} from "@/lib/requests/model";
import { quoteOfferShipping } from "@/lib/requests/shipping";

export const dynamic = "force-dynamic";

/**
 * A back-order request, as its customer sees it (docs/backorder-requests.md §5).
 *
 * Opened by the link in the emails and by nothing else: the token in the path
 * is the whole authorisation, 43 characters of crypto randomness, so the page
 * is never indexed and never sends the token on as a referrer.
 *
 * Read-only apart from the two buttons, which post to server actions that
 * check the token, the state, the expiry and the offer version again.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "aitima.page" });
  return {
    title: t("titlos"),
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

type PageProps = { params: Promise<{ locale: Locale; token: string }> };

type View = "REQUESTED" | "OFFERED" | "ACCEPTED" | "PAID" | "DECLINED" | "EXPIRED" | "REJECTED";

function stamp(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : locale === "it" ? "it-IT" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Athens",
  }).format(date);
}

export default async function RequestPage({ params }: PageProps) {
  const t = await getTranslations("aitima.page");
  const { locale, token } = await params;
  setRequestLocale(locale);

  if (!isWellFormedToken(token)) notFound();

  const [order, miniCart, menuTree, brands, stats, rootCategories] = await Promise.all([
    prisma.order.findUnique({ where: { requestToken: token }, include: { lines: true } }),
    getMiniCart(locale),
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
  ]);
  if (!order || !order.requestStatus) notFound();

  const requested = readSnapshot(order.requestLines)?.lines ?? [];
  const offer = readStoredOffer(order.offerJson);
  const offerExpired = offerHasExpired(order);

  const view: View =
    order.paymentStatus === "PAID"
      ? "PAID"
      : offerExpired
        ? "EXPIRED"
        : (order.requestStatus as View);

  const money = (n: number) => formatMoney(n, locale);
  const grossOf = (unitNet: number, vatRate: number, qty: number) => priceLines([{ unitNet, vatRate, qty }], 0).lines[0];

  // The offer, priced exactly as acceptance will price it.
  let rows: ComparisonRow[] = [];
  let offerTotals: ReturnType<typeof priceLines> | null = null;
  let shippingKnown = true;
  if (view === "OFFERED" && offer?.decision === "offer") {
    rows = compareOffer(requested, offer.lines);
    let shippingNet = offerShippingNet(offer);
    if (shippingNet == null) {
      const quoted = await quoteOfferShipping(order, offer.lines).catch(() => null);
      if (quoted?.ok) shippingNet = quoted.shippingNet;
      else shippingKnown = false;
    }
    offerTotals = priceLines(offer.lines, shippingNet ?? 0, order.shipCountry);
  }
  const requestedTotals = priceLines(requested, 0);

  /*
   * A split cart: the in-stock half is its own order, paid and shipped on its
   * own. Its number, amount and page, so this request reads as the second
   * shipment it is — with its own postage, shown here and nowhere else.
   */
  const parent = order.parentOrderNumber
    ? await prisma.order.findUnique({
        where: { orderNumber: order.parentOrderNumber },
        select: { orderNumber: true, guestToken: true, totalGross: true, shippingGross: true, paymentStatus: true },
      })
    : null;
  const parentHref = parent
    ? `${locale === "el" ? "" : `/${locale}`}/checkout/epibebaiosi/${encodeURIComponent(parent.orderNumber)}?t=${encodeURIComponent(parent.guestToken)}`
    : null;

  const confirmationHref =
    view === "PAID" || view === "ACCEPTED"
      ? `${locale === "el" ? "" : `/${locale}`}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`
      : null;

  const tag = (row: ComparisonRow) =>
    row.kind === "same"
      ? t("tag_same")
      : row.kind === "modified"
        ? t("tag_modified")
        : row.kind === "alternative"
          ? t("tag_alternative")
          : row.kind === "added"
            ? t("tag_added")
            : t("tag_removed");

  return (
    <>
      <SiteChrome locale={locale} cart={miniCart} categories={menuTree} brands={brands} stats={stats} />

      <main id="main">
        <div className="shell-x bg-k-ink-deep py-10 lg:py-14">
          <p className="t-eyebrow mb-3.5 text-k-red">{upGreek(t("eyebrow"))}</p>
          <h1 className="font-display text-[26px] leading-[1.14] t-display text-white lg:text-[34px]">
            {upGreek(t(`headline_${view}`))}
          </h1>
          <p className="mt-4 flex flex-wrap items-center gap-3">
            <span className="t-account-label text-white/50">{upGreek(t("arithmos"))}</span>
            <span className="border border-white/20 px-3 py-2 font-mono text-[15px] font-semibold text-white">
              {order.orderNumber}
            </span>
          </p>
          <p className="mt-4 max-w-[600px] text-[13.5px] leading-[1.65] text-white/60">{t(`intro_${view}`)}</p>
          {order.parentOrderNumber && (
            <p className="mt-2 max-w-[600px] text-[12.5px] leading-[1.6] text-white/50">
              {parent
                ? parent.paymentStatus === "PAID"
                  ? t("parent_note_paid", {
                      number: parent.orderNumber,
                      total: money(Number(parent.totalGross)),
                      shipping: Number(parent.shippingGross) === 0 ? t("dorean") : money(Number(parent.shippingGross)),
                    })
                  : t("parent_note_amount", {
                      number: parent.orderNumber,
                      total: money(Number(parent.totalGross)),
                      shipping: Number(parent.shippingGross) === 0 ? t("dorean") : money(Number(parent.shippingGross)),
                    })
                : t("parent_note", { number: order.parentOrderNumber })}{" "}
              {parentHref && (
                <a href={parentHref} className="text-white/80 underline-offset-2 hover:underline">
                  {t("parent_link")} →
                </a>
              )}
            </p>
          )}
        </div>

        <div className="shell-w lg:grid lg:grid-cols-[1fr_400px] lg:items-start">
          <div className="min-w-0 border-k-line px-4 py-8 lg:border-r lg:px-10">
            {view === "REJECTED" && offer?.decision === "reject" && offer.reason && (
              <Note title={t("reason_title")}>{offer.reason}</Note>
            )}

            {view === "OFFERED" && offer?.decision === "offer" && (
              <>
                {(offer.leadTimeText || order.offerExpiresAt) && (
                  <div className="mb-5 grid gap-px border border-k-line bg-k-line sm:grid-cols-2">
                    {offer.leadTimeText && (
                      <Block title={t("lead_time")}>{offer.leadTimeText}</Block>
                    )}
                    {order.offerExpiresAt && (
                      <Block title={t("validity")}>
                        {t("expires_at", { date: stamp(order.offerExpiresAt, locale) })}
                      </Block>
                    )}
                  </div>
                )}
                {offer.note && <Note title={t("note_title")}>{offer.note}</Note>}

                <h2 className="t-footer-col mt-6 mb-3 text-k-text-4">{upGreek(t("offer_title"))}</h2>
                <div className="border border-k-line">
                  {rows.map((row, index) => {
                    const removed = row.kind === "removed";
                    const line = removed ? row.requested : row.offered;
                    const priced = grossOf(line.unitNet, line.vatRate, removed ? row.requested.qty : row.offered.qty);
                    const qty = removed ? row.requested.qty : row.offered.qty;
                    const highlight = row.kind !== "same";
                    return (
                      <div
                        key={`${row.kind}-${index}`}
                        className={`flex items-start gap-4 border-b border-k-line-3 px-4 py-3.5 last:border-0 ${
                          highlight && !removed ? "bg-k-amber/6" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={`t-badge inline-block px-1.5 py-0.5 ${
                              removed
                                ? "bg-k-surface-3 text-k-text-3"
                                : highlight
                                  ? "bg-k-amber text-white"
                                  : "bg-k-surface-2 text-k-text-3"
                            }`}
                          >
                            {upGreek(tag(row))}
                          </span>
                          <span
                            className={`mt-1 block text-[12.5px] font-semibold ${
                              removed ? "text-k-text-4 line-through" : "text-k-ink"
                            }`}
                          >
                            {line.name}
                          </span>
                          {row.kind === "alternative" && row.requested && (
                            <span className="mt-0.5 block text-[11.5px] text-k-text-3">
                              {t("instead_of", { name: row.requested.name })}
                            </span>
                          )}
                          <span className="t-card-sku mt-0.5 block text-k-text-4">
                            {line.sku} ·{" "}
                            <span className={row.kind === "modified" && row.qtyChanged ? "font-semibold text-k-amber" : ""}>
                              {qty} {t("tem")}
                            </span>{" "}
                            ×{" "}
                            <span className={row.kind === "modified" && row.priceChanged ? "font-semibold text-k-amber" : ""}>
                              {money(priced.unitGross)}
                            </span>
                            {!removed && row.offered.leadTimeText ? ` · ${row.offered.leadTimeText}` : ""}
                          </span>
                          {row.kind === "modified" && (row.qtyChanged || row.priceChanged) && (
                            <span className="mt-0.5 block text-[11px] text-k-text-4">
                              {[
                                row.qtyChanged ? t("requested_qty", { qty: row.requested.qty }) : null,
                                row.priceChanged
                                  ? t("requested_price", {
                                      price: money(grossOf(row.requested.unitNet, row.requested.vatRate, 1).unitGross),
                                    })
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[14px] font-semibold ${
                            removed ? "text-k-text-4 line-through" : "text-k-ink"
                          }`}
                        >
                          {money(priced.lineGross)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {(view === "ACCEPTED" || view === "PAID") && (
              <>
                <h2 className="t-footer-col mb-3 text-k-text-4">{upGreek(t("offer_title"))}</h2>
                <div className="border border-k-line">
                  {order.lines.map((line) => (
                    <div key={line.id} className="flex items-center gap-4 border-b border-k-line-3 px-4 py-3.5 last:border-0">
                      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1">
                        {line.imageUrl && (
                          <Image src={line.imageUrl} alt="" width={56} height={56} className="max-h-full max-w-full object-contain" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-k-ink">{line.name}</span>
                        <span className="t-card-sku mt-0.5 block text-k-text-4">
                          {line.sku} · {line.quantity} {t("tem")}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[14px] font-semibold text-k-ink">
                        {money(Number(line.lineGross))}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(view === "REQUESTED" || view === "DECLINED" || view === "EXPIRED" || view === "REJECTED") && (
              <>
                <h2 className="t-footer-col mb-3 text-k-text-4">{upGreek(t("requested_title"))}</h2>
                <div className="border border-k-line">
                  {requested.map((line) => (
                    <div key={line.lineId} className="flex items-center gap-4 border-b border-k-line-3 px-4 py-3.5 last:border-0">
                      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1">
                        {line.imageUrl && (
                          <Image src={line.imageUrl} alt="" width={56} height={56} className="max-h-full max-w-full object-contain" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="t-card-brand block text-k-red">{line.brand ?? "—"}</span>
                        <span className="mt-0.5 block text-[12.5px] font-semibold text-k-ink">{line.name}</span>
                        <span className="t-card-sku mt-0.5 block text-k-text-4">
                          {line.sku} · {line.qty} {t("tem")}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[14px] font-semibold text-k-text-3">
                        {money(grossOf(line.unitNet, line.vatRate, line.qty).lineGross)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="mt-6 text-[11.5px] text-k-text-4">{t("private_link")}</p>
          </div>

          <aside className="px-4 py-8 lg:px-8">
            {order.parentOrderNumber && view !== "PAID" && (
              <p className="mb-3 border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12px] leading-[1.55] text-k-text-2">
                {t("second_shipment", { number: order.parentOrderNumber })}
              </p>
            )}
            <div className="bg-k-ink px-5 py-6">
              {offerTotals ? (
                <>
                  <dl className="flex flex-col gap-2.5">
                    {[
                      { k: t("kathari_axia"), v: money(offerTotals.subtotalNet) },
                      {
                        k: t("metaforika"),
                        v: !shippingKnown
                          ? "—"
                          : offerTotals.shippingGross === 0
                            ? upGreek(t("dorean"))
                            : money(offerTotals.shippingGross),
                      },
                      { k: t("fpa"), v: money(offerTotals.vatAmount) },
                    ].map((row) => (
                      <div key={row.k} className="flex items-baseline justify-between gap-4">
                        <dt className="text-[12.5px] text-white/55">{row.k}</dt>
                        <dd className="font-mono text-[13px] font-medium text-white">{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/16 pt-4">
                    <p className="t-footer-col text-white/50">{upGreek(t("synolo"))}</p>
                    <p className="font-mono text-[30px] leading-none font-semibold tracking-[-0.03em] text-white">
                      {money(offerTotals.totalGross)}
                    </p>
                  </div>
                </>
              ) : view === "ACCEPTED" || view === "PAID" ? (
                <div className="flex items-end justify-between gap-4">
                  <p className="t-footer-col text-white/50">{upGreek(t("synolo"))}</p>
                  <p className="font-mono text-[30px] leading-none font-semibold tracking-[-0.03em] text-white">
                    {money(Number(order.totalGross))}
                  </p>
                </div>
              ) : (
                <>
                  <p className="flex items-baseline justify-between gap-4">
                    <span className="text-[12.5px] text-white/55">{t("metaforika")}</span>
                    <span className="text-[12.5px] text-white/80">{t("shipping_with_offer")}</span>
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/16 pt-4">
                    <p className="t-footer-col text-white/50">{upGreek(t("endeiktiki_axia"))}</p>
                    <p className="font-mono text-[26px] leading-none font-semibold tracking-[-0.03em] text-white">
                      {money(requestedTotals.subtotalGross)}
                    </p>
                  </div>
                </>
              )}
            </div>

            {view === "OFFERED" && (
              <RequestActions
                token={token}
                offerVersion={order.offerVersion}
                expiresAt={order.offerExpiresAt?.toISOString() ?? null}
                mode="offer"
              />
            )}
            {view === "ACCEPTED" && (
              <RequestActions token={token} offerVersion={order.offerVersion} expiresAt={null} mode="pay" />
            )}
            {confirmationHref && view === "PAID" && (
              <a
                href={confirmationHref}
                className="t-btn-sm mt-4 flex h-12 items-center justify-center bg-k-ink text-white transition-colors hover:bg-k-red"
              >
                {upGreek(t("view_order"))} →
              </a>
            )}
            {(view === "EXPIRED" || view === "DECLINED" || view === "REJECTED") && (
              <Link
                href="/epikoinonia"
                className="t-btn-sm mt-4 flex h-12 items-center justify-center border-[1.5px] border-k-ink text-k-ink transition-colors hover:bg-k-ink hover:text-white"
              >
                {upGreek(t("contact"))} →
              </Link>
            )}
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

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <p className="mb-5 border-l-[3px] border-k-ink bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.6] whitespace-pre-line text-k-ink">
      <span className="t-account-label mb-1 block text-k-text-4">{upGreek(title)}</span>
      {children}
    </p>
  );
}
