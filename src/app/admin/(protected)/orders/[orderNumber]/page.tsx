import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Database,
  FileText,
  History,
  MapPin,
  Package,
  Scale,
  StickyNote,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/admin/PageShell";
import { formatMoney } from "@/lib/format";
import { ADMIN_LOCALE } from "@/lib/admin/locale";
import { SHIPPING_METHODS } from "@/lib/cart/options";
import { chargeableWeight } from "@/lib/shipping/acs-tariff";
import { PostageCorrection } from "@/components/admin/PostageCorrection";

export const dynamic = "force-dynamic";

/**
 * One order, in full.
 *
 * The orders table has linked here since it was written — "Πλήρης παραγγελία",
 * twice per row — and the page did not exist. Every one of those links was a
 * 404, which is a particular kind of bad: the interface promised somewhere to
 * look when a customer rings up about an order, and sent whoever followed it
 * to a dead end.
 *
 * Everything on it is read, nothing is decided. The actions that change an
 * order — issue the document, issue the parcel — live on the table where they
 * are used in batches. This is the page somebody opens with a customer on the
 * phone, so it answers the questions a customer asks: what did I order, what
 * did I pay, where is it going, and what has happened to it since.
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Αναμονή πληρωμής",
  CONFIRMED: "Επιβεβαιωμένη",
  SHIPPED: "Απεστάλη",
  DELIVERED: "Παραδόθηκε",
  CANCELLED: "Ακυρώθηκε",
  FAILED: "Απέτυχε",
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Εκκρεμεί",
  PAID: "Πληρωμένη",
  FAILED: "Απέτυχε",
  REFUNDED: "Επιστράφηκε",
};

const METHOD_LABEL: Record<string, string> = {
  card: "Κάρτα",
  bank: "Τραπεζική κατάθεση",
  iris: "IRIS",
  credit: "Επί πιστώσει",
};

type Tone = "amber" | "blue" | "green" | "red" | "ink" | "grey";

/** Filled chip per tone. Tints stay light so the text keeps its contrast. */
const TONE_CHIP: Record<Tone, string> = {
  amber: "border-k-amber/40 bg-k-amber/12 text-k-amber",
  blue: "border-k-blue/35 bg-k-blue/10 text-k-blue",
  green: "border-k-green/35 bg-k-green/10 text-k-green",
  red: "border-k-red/40 bg-k-red/10 text-k-red",
  ink: "border-k-ink bg-k-ink text-white",
  grey: "border-k-line-2 bg-k-surface-2 text-k-text-2",
};

const TONE_TEXT: Record<Tone, string> = {
  amber: "text-k-amber",
  blue: "text-k-blue",
  green: "text-k-green",
  red: "text-k-red",
  ink: "text-k-ink",
  grey: "text-k-text-3",
};

const TONE_BAR: Record<Tone, string> = {
  amber: "bg-k-amber",
  blue: "bg-k-blue",
  green: "bg-k-green",
  red: "bg-k-red",
  ink: "bg-k-ink",
  grey: "bg-k-line-2",
};

const STATUS_TONE: Record<string, Tone> = {
  PENDING_PAYMENT: "amber",
  CONFIRMED: "blue",
  SHIPPED: "ink",
  DELIVERED: "green",
  CANCELLED: "red",
  FAILED: "red",
};

const PAYMENT_TONE: Record<string, Tone> = {
  PENDING: "amber",
  PAID: "green",
  FAILED: "red",
  REFUNDED: "grey",
};

const ZONE_LABEL: Record<string, string> = {
  attica: "Αττική",
  mainland: "Ηπειρωτική Ελλάδα",
  island: "Νησιά",
  remote: "Δυσπρόσιτη περιοχή",
};

/** What checkout stored about the postage, see `LivePostageQuote`. */
type StoredQuote = {
  zone?: string;
  zoneLabel?: string;
  etaDays?: string;
  source?: "acs" | "table";
  station?: string;
  remote?: boolean;
  fallbackReason?: string;
  correction?: {
    at: string;
    by: string;
    fromShippingGross: number;
    fromTotalGross: number;
    notified: boolean;
  };
  actualKg?: number;
  volumetricKg?: number;
  chargeableKg?: number;
  estimated?: boolean;
  baseNet?: number;
  extraWeightNet?: number;
  totalNet?: number;
};

const kg = (v: number | null | undefined) =>
  v == null ? "—" : `${new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(v)} kg`;

const cm = (v: unknown) =>
  v == null ? "—" : new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(Number(v));

function when(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Athens",
  }).format(date);
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "orders");

  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({
    where: { orderNumber: decodeURIComponent(orderNumber) },
    include: {
      lines: true,
      history: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!order) notFound();

  const money = (v: unknown) => formatMoney(Number(v), ADMIN_LOCALE);

  // The catalogue as it is NOW, next to the snapshot the order froze. When
  // postage is disputed, the dimensions are usually the answer.
  const productIds = order.lines.map((l) => l.productId).filter((id): id is string => !!id);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, slug: true, width: true, length: true, height: true, weight: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const quote = (order.shippingQuote ?? null) as StoredQuote | null;
  const method = SHIPPING_METHODS.find((m) => m.id === order.shippingMethod);
  const recomputed = chargeableWeight(
    order.lines.map((l) => {
      const p = l.productId ? productById.get(l.productId) : undefined;
      return {
        quantity: l.quantity,
        weight: p?.weight != null ? Number(p.weight) : l.weightKg != null ? Number(l.weightKg) : null,
        width: p?.width != null ? Number(p.width) : null,
        length: p?.length != null ? Number(p.length) : null,
        height: p?.height != null ? Number(p.height) : null,
      };
    }),
  );
  const suspiciousPostage =
    quote?.chargeableKg != null &&
    quote.actualKg != null &&
    quote.chargeableKg > 10 &&
    quote.chargeableKg > quote.actualKg * 10;
  const discountGross = Number(order.savingsGross);
  const correctable =
    order.paymentStatus !== "PAID" &&
    (order.status === "PENDING_PAYMENT" || order.status === "FAILED") &&
    (method?.expressMultiplier ?? 0) > 0;

  return (
    <PageShell
      title={order.orderNumber}
      description={`${when(order.createdAt)} · ${STATUS_LABEL[order.status] ?? order.status}`}
      actions={
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 border border-k-line bg-white px-2.5 py-1.5 text-[12px] text-k-text-2 transition-colors hover:border-k-line-2 hover:text-k-ink"
        >
          <ArrowLeft className="size-3.5" />
          Παραγγελίες
        </Link>
      }
    >
      <div className="mb-4 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Κατάσταση" tone={STATUS_TONE[order.status] ?? "grey"}>
          <Chip tone={STATUS_TONE[order.status] ?? "grey"}>{STATUS_LABEL[order.status] ?? order.status}</Chip>
          <span className="mt-1 block text-[11px] text-k-text-4">{when(order.createdAt)}</span>
        </SummaryTile>
        <SummaryTile label="Πληρωμή" tone={PAYMENT_TONE[order.paymentStatus] ?? "grey"}>
          <Chip tone={PAYMENT_TONE[order.paymentStatus] ?? "grey"}>
            {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
          </Chip>
          <span className="mt-1 block text-[11px] text-k-text-4">
            {METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}
            {order.paidAt ? ` · ${when(order.paidAt)}` : ""}
          </span>
        </SummaryTile>
        <SummaryTile label="Σύνολο" tone="ink">
          <span className="numeral block text-[22px] leading-none font-semibold tracking-tight text-k-ink">
            {money(order.totalGross)}
          </span>
          <span className="numeral mt-1 block text-[11px] text-k-text-4">
            {order.lines.reduce((n, l) => n + l.quantity, 0)} τεμ. · ΦΠΑ {money(order.vatAmount)}
          </span>
        </SummaryTile>
        <SummaryTile label="Μεταφορικά" tone={suspiciousPostage ? "red" : "blue"}>
          <span
            className={cn(
              "numeral block text-[22px] leading-none font-semibold tracking-tight",
              suspiciousPostage ? "text-k-red" : "text-k-ink",
            )}
          >
            {money(order.shippingGross)}
          </span>
          <span className={cn("numeral mt-1 block text-[11px]", suspiciousPostage ? "text-k-red" : "text-k-text-4")}>
            {quote?.chargeableKg != null ? `${kg(quote.chargeableKg)} χρέωσης` : (method?.label ?? order.shippingMethod)}
            {suspiciousPostage ? " · ύποπτο" : ""}
          </span>
        </SummaryTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="border border-k-line bg-white">
            <SectionTitle icon={Package} tone="red">
              Είδη · {order.lines.reduce((n, l) => n + l.quantity, 0)} τεμ.
            </SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-[13px]">
                <thead>
                  <tr className="border-b border-k-line text-left text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
                    <th className="px-4 py-2 font-medium">Προϊόν</th>
                    <th className="px-2 py-2 text-center font-medium">Τεμ.</th>
                    <th className="px-2 py-2 text-right font-medium">Τιμή μον.</th>
                    <th className="px-2 py-2 text-right font-medium">ΦΠΑ</th>
                    <th className="px-2 py-2 text-right font-medium">Καθαρή</th>
                    <th className="px-4 py-2 text-right font-medium">Αξία</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const product = line.productId ? productById.get(line.productId) : undefined;
                    return (
                      <tr key={line.id} className="border-b border-k-line align-top last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="flex gap-3">
                            {line.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={line.imageUrl}
                                alt=""
                                width={44}
                                height={44}
                                className="size-11 shrink-0 border border-k-line object-contain"
                              />
                            )}
                            <div className="min-w-0">
                              {product?.slug ? (
                                <a
                                  href={`/proion/${product.slug}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline"
                                >
                                  {line.name}
                                </a>
                              ) : (
                                <div>{line.name}</div>
                              )}
                              <div className="numeral text-[11px] text-k-text-3">
                                {line.brand ? `${line.brand} · ` : ""}
                                {line.sku}
                                {line.mtrl ? ` · MTRL ${line.mtrl}` : " · χωρίς MTRL"}
                              </div>
                              <div className="numeral text-[11px] text-k-text-4">
                                Βάρος {kg(line.weightKg != null ? Number(line.weightKg) : null)}
                                {product && (
                                  <>
                                    {" "}· Διαστάσεις καταλόγου {cm(product.width)} × {cm(product.length)} ×{" "}
                                    {cm(product.height)}
                                  </>
                                )}
                              </div>
                              {(Number(line.discountPercent) > 0 || line.offerTitle) && (
                                <div className="text-[11px] text-k-green">
                                  {line.offerTitle ?? "Έκπτωση"}
                                  {Number(line.discountPercent) > 0 ? ` · −${Number(line.discountPercent)}%` : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="numeral px-2 py-2.5 text-center">{line.quantity}</td>
                        <td className="numeral px-2 py-2.5 text-right">
                          {money(line.unitGross)}
                          <div className="text-[11px] text-k-text-4">{money(line.unitNet)} καθ.</div>
                        </td>
                        <td className="numeral px-2 py-2.5 text-right text-k-text-2">{Number(line.vatRate)}%</td>
                        <td className="numeral px-2 py-2.5 text-right text-k-text-2">{money(line.lineNet)}</td>
                        <td className="numeral px-4 py-2.5 text-right">{money(line.lineGross)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <table className="w-full border-t border-k-line text-[13px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
                  <th className="px-4 pt-3 pb-1 text-left font-medium" />
                  <th className="px-2 pt-3 pb-1 text-right font-medium">Καθαρή</th>
                  <th className="px-2 pt-3 pb-1 text-right font-medium">ΦΠΑ</th>
                  <th className="px-4 pt-3 pb-1 text-right font-medium">Σύνολο</th>
                </tr>
              </thead>
              <tbody className="numeral [&>tr:last-of-type]:border-0">
                <TotalRow label="Προϊόντα" net={order.subtotalNet} gross={order.subtotalGross} money={money} />
                <TotalRow
                  label={`Μεταφορικά${method ? ` · ${method.label}` : ""}`}
                  net={order.shippingNet}
                  gross={order.shippingGross}
                  money={money}
                  warn={suspiciousPostage}
                />
                {Number(order.paymentFeeGross) > 0 && (
                  <TotalRow label="Έξοδα πληρωμής" net={order.paymentFeeNet} gross={order.paymentFeeGross} money={money} />
                )}
                <tr className="bg-k-ink font-medium text-white">
                  <td className="px-4 py-2.5">Σύνολο</td>
                  <td className="px-2 py-2.5 text-right text-white/70">
                    {money(Number(order.totalGross) - Number(order.vatAmount))}
                  </td>
                  <td className="px-2 py-2.5 text-right text-white/70">{money(order.vatAmount)}</td>
                  <td className="px-4 py-2.5 text-right text-[15px]">{money(order.totalGross)}</td>
                </tr>
                {discountGross > 0 && (
                  <tr className="bg-k-green/8 text-[12px] text-k-green">
                    <td className="px-4 py-2" colSpan={3}>
                      Εξοικονόμηση από προσφορές
                    </td>
                    <td className="px-4 py-2 text-right">{money(discountGross)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="border border-k-line bg-white">
            <SectionTitle icon={Scale} tone={suspiciousPostage ? "red" : "blue"}>
              Υπολογισμός μεταφορικών
            </SectionTitle>
            {suspiciousPostage && (
              <p className="flex items-start gap-2 border-b border-k-red/25 border-l-[3px] border-l-k-red bg-k-red/8 px-4 py-2.5 text-[12.5px] text-k-red">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Χρεώθηκε με {kg(quote?.chargeableKg)} ενώ τα είδη ζυγίζουν {kg(quote?.actualKg)}. Συνήθως
                  σημαίνει διαστάσεις σε χιλιοστά στο SoftOne. Με τα σημερινά στοιχεία και κανόνες το δέμα
                  λογίζεται {kg(recomputed.chargeableKg)}.
                </span>
              </p>
            )}
            {quote?.correction && (
              <p className="border-b border-k-green/25 border-l-[3px] border-l-k-green bg-k-green/8 px-4 py-2.5 text-[12.5px] text-k-green">
                Διορθώθηκε {when(new Date(quote.correction.at))} από {quote.correction.by}: μεταφορικά{" "}
                <span className="line-through">{money(quote.correction.fromShippingGross)}</span> →{" "}
                {money(order.shippingGross)}, σύνολο{" "}
                <span className="line-through">{money(quote.correction.fromTotalGross)}</span> →{" "}
                {money(order.totalGross)}
                {quote.correction.notified ? " · ο πελάτης ενημερώθηκε με email" : " · χωρίς email στον πελάτη"}
              </p>
            )}
            {quote ? (
              <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-2">
                <Field label="Πηγή τιμής">
                  {quote.source === "acs" ? "ACS (ζωντανή τιμή)" : "Πίνακας τιμών"}
                  {quote.fallbackReason ? ` · ${quote.fallbackReason}` : ""}
                </Field>
                <Field label="Ζώνη">
                  {ZONE_LABEL[quote.zone ?? ""] ?? quote.zoneLabel ?? quote.zone ?? "—"}
                  {quote.station ? ` · σταθμός ${quote.station}` : ""}
                  {quote.etaDays ? ` · ${quote.etaDays} ημέρες` : ""}
                </Field>
                <Field label="Πραγματικό βάρος">
                  {kg(quote.actualKg)}
                  {quote.estimated ? " · με εκτίμηση" : ""}
                </Field>
                <Field label="Ογκομετρικό βάρος">{kg(quote.volumetricKg)}</Field>
                <Field label="Βάρος χρέωσης">{kg(quote.chargeableKg)}</Field>
                <Field label="Σήμερα θα λογιζόταν">
                  {kg(recomputed.chargeableKg)}
                  {recomputed.implausibleItems > 0 ? ` · ${recomputed.implausibleItems} με ύποπτες διαστάσεις` : ""}
                </Field>
                <Field label="Βασική χρέωση (καθαρή)">{quote.baseNet != null ? money(quote.baseNet) : "—"}</Field>
                <Field label="Επιπλέον (καθαρή)">
                  {quote.totalNet != null && quote.baseNet != null
                    ? money(quote.totalNet - quote.baseNet)
                    : "—"}
                  {quote.remote ? " · περιλαμβάνει δυσπρόσιτη" : ""}
                </Field>
              </dl>
            ) : (
              <p className="px-4 py-3 text-[13px] text-k-text-3">
                {order.shippingMethod === "pickup"
                  ? "Παραλαβή από το κατάστημα."
                  : "Η παραγγελία δεν κράτησε ανάλυση των μεταφορικών."}
              </p>
            )}
            {correctable && (
              <PostageCorrection
                orderNumber={order.orderNumber}
                email={order.email}
                suspicious={suspiciousPostage}
              />
            )}
          </section>

          <section className="border border-k-line bg-white">
            <SectionTitle icon={History} tone="grey">
              Ιστορικό
            </SectionTitle>
            <ol className="px-4 py-3">
              {order.history.map((entry, i) => {
                const tone = STATUS_TONE[entry.status] ?? "grey";
                return (
                  <li key={entry.id} className="relative flex gap-3 pb-3 last:pb-0">
                    {i < order.history.length - 1 && (
                      <span className="absolute top-3 bottom-0 left-[4.5px] w-px bg-k-line" aria-hidden />
                    )}
                    <span className={cn("relative mt-1.5 size-2.5 shrink-0", TONE_BAR[tone])} aria-hidden />
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={cn("font-medium", TONE_TEXT[tone])}>
                          {STATUS_LABEL[entry.status] ?? entry.status}
                        </span>
                        <span className="numeral shrink-0 text-[11px] text-k-text-3">{when(entry.createdAt)}</span>
                      </div>
                      <div className="text-[11px] text-k-text-3">
                        {entry.actor}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
              {order.history.length === 0 && <li className="text-[13px] text-k-text-3">Καμία εγγραφή.</li>}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          <Panel title="Πελάτης" icon={UserRound} tone="blue">
            <div className="text-[13px]">
              {order.firstName} {order.lastName}
            </div>
            <a href={`mailto:${order.email}`} className="block text-[12px] text-k-ink hover:underline">
              {order.email}
            </a>
            <a href={`tel:${order.phone}`} className="numeral block text-[12px] text-k-ink hover:underline">
              {order.phone}
            </a>
            <div className="pt-1 text-[11px] text-k-text-3">
              {order.customerId ? "Εγγεγραμμένος πελάτης" : "Επισκέπτης"}
            </div>
          </Panel>

          <Panel title="Αποστολή" icon={MapPin} tone="amber">
            <div className="text-[13px]">
              {order.shipLine1}
              {order.shipLine2 ? `, ${order.shipLine2}` : ""}
            </div>
            <div className="text-[13px]">
              {order.shipPostcode} {order.shipCity}
              {order.shipRegion ? ` · ${order.shipRegion}` : ""}
            </div>
            <div className="text-[12px] text-k-text-3">
              {order.shipAdminRegion && order.shipAdminRegion !== order.shipRegion ? `${order.shipAdminRegion} · ` : ""}
              {order.shipCountry === "GR" ? "Ελλάδα" : order.shipCountry}
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${order.shipLine1}, ${order.shipPostcode} ${order.shipCity}`,
              )}`}
              target="_blank"
              rel="noreferrer"
              className="block text-[11px] text-k-text-3 hover:text-k-ink hover:underline"
            >
              Χάρτης
            </a>
            <div className="pt-2 text-[12px] text-k-text-2">
              {method ? `${method.label} · ${method.meta}` : order.shippingMethod}
            </div>
            <div className="pt-1">
              <Chip tone={order.acsVoucherNo ? "green" : "grey"}>
                {order.acsVoucherNo ? `ACS ${order.acsVoucherNo}` : "Χωρίς αποστολικό ACS"}
              </Chip>
            </div>
            {order.acsPickupDate && (
              <div className="numeral text-[11px] text-k-text-3">Παραλαβή courier {order.acsPickupDate}</div>
            )}
            {order.shippedAt && (
              <div className="numeral text-[11px] text-k-text-3">Απεστάλη {when(order.shippedAt)}</div>
            )}
            {order.deliveredAt && (
              <div className="numeral text-[11px] text-k-text-3">Παραδόθηκε {when(order.deliveredAt)}</div>
            )}
          </Panel>

          {order.wantsInvoice && (
            <Panel title="Τιμολόγιο" icon={Building2} tone="ink">
              <div className="text-[13px]">{order.companyName ?? "—"}</div>
              <div className="numeral text-[12px]">ΑΦΜ {order.vatNumber ?? "—"}</div>
              <div className="text-[12px]">{order.taxOffice ? `ΔΟΥ ${order.taxOffice}` : ""}</div>
              <div className="text-[12px] text-k-text-2">{order.companyTrade ?? ""}</div>
              <div className="pt-2 text-[11px] text-k-text-3">Διεύθυνση τιμολόγησης</div>
              <div className="text-[12px]">
                {order.billLine1
                  ? `${order.billLine1}, ${order.billPostcode ?? ""} ${order.billCity ?? ""}`
                  : "Ίδια με την αποστολή"}
              </div>
            </Panel>
          )}

          <Panel title="Πληρωμή" icon={CreditCard} tone="green">
            <div className="text-[13px]">
              {METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}
            </div>
            <div className="text-[12px] text-k-text-2">
              {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
              {order.paidAt ? ` · ${when(order.paidAt)}` : ""}
            </div>
            {order.vivaOrderCode && (
              <div className="numeral text-[11px] text-k-text-3">
                Viva orderCode {order.vivaOrderCode}
              </div>
            )}
            <div className={cn("numeral text-[11px]", order.vivaTransactionId ? "text-k-text-3" : "text-k-amber")}>
              {order.vivaTransactionId ? `Συναλλαγή ${order.vivaTransactionId}` : "Χωρίς συναλλαγή — η κάρτα δεν χρεώθηκε"}
            </div>
            {order.reservedUntil && (
              <div className="numeral text-[11px] text-k-text-3">Δέσμευση αποθέματος έως {when(order.reservedUntil)}</div>
            )}
            {/*
             * Shown when Viva reported a method of its own. It is the raw id
             * because that is what we have: the mapping is learned from real
             * payments rather than guessed, and hiding an unmapped number would
             * hide the one thing that identifies it.
             */}
            {order.vivaPaymentMethodId != null && (
              <div className="numeral text-[11px] text-k-text-3">
                Viva paymentMethodId {order.vivaPaymentMethodId}
              </div>
            )}
          </Panel>

          <Panel title="SoftOne" icon={Database} tone="blue">
            {order.erpFindoc ? (
              <>
                {/*
                  Ο αριθμός παραστατικού, όχι το FINDOC.

                  Το FINDOC είναι κλειδί πίνακα — αύξων αριθμός όλων των
                  παραστατικών της εγκατάστασης, χωρίς νόημα έξω από τη βάση
                  του SoftOne. Ο πελάτης, το λογιστήριο και η ΑΑΔΕ μιλούν με το
                  ΠΑΡΚ000123. Το FINDOC μένει από κάτω, μικρό: χρειάζεται μόνο
                  όταν κάποιος ψάχνει την εγγραφή στην ίδια τη βάση.
                */}
                <div className="numeral text-[13px] text-k-green">
                  {order.erpFincode ?? `${order.erpSeries ? `${order.erpSeries} / ` : ""}${order.erpFindoc}`}
                </div>
                <div className="text-[11px] text-k-text-3">
                  Παραστατικό · {when(order.erpPushedAt)}
                </div>
                {order.erpFincode && (
                  <div className="numeral text-[10.5px] text-k-text-4">
                    FINDOC {order.erpFindoc}
                    {order.erpSeries ? ` · σειρά ${order.erpSeries}` : ""}
                  </div>
                )}
              </>
            ) : (
              <Chip tone="grey">Δεν έχει σταλεί</Chip>
            )}
            {order.erpTrdr && (
              <div className="numeral text-[11px] text-k-text-3">TRDR {order.erpTrdr}</div>
            )}
            {order.erpError && (
              <div className="pt-1 text-[11px] text-k-red">{order.erpError}</div>
            )}

            {/*
              Everything the ERP answered, verbatim and folded away.
              ─────────────────────────────────────────────────────────────
              Nobody reads it on an ordinary day. On the day a figure is
              disputed it is the only evidence of what SoftOne actually said,
              and a parsed summary is a record of what we happened to think
              mattered at the time.
            */}
            {order.erpResponse != null && (
              <details className="pt-2">
                <summary className="cursor-pointer text-[11px] text-k-text-3 hover:text-k-ink">
                  Απάντηση SoftOne
                </summary>
                <pre className="numeral mt-1.5 max-h-48 overflow-auto border border-k-line bg-k-surface-2 p-2 text-[10px] leading-[1.5] whitespace-pre-wrap text-k-text-2">
                  {JSON.stringify(order.erpResponse, null, 2)}
                </pre>
              </details>
            )}
          </Panel>

          <Panel title="Σημειώσεις πελάτη" icon={StickyNote} tone="amber">
            <div className="whitespace-pre-wrap text-[13px] text-k-text-2">{order.notes || "Καμία."}</div>
          </Panel>

          <Panel title="Εγγραφή" icon={FileText} tone="grey">
            <div className="numeral text-[11px] text-k-text-3">Δημιουργία {when(order.createdAt)}</div>
            <div className="numeral text-[11px] text-k-text-3">Τελευταία αλλαγή {when(order.updatedAt)}</div>
            {order.reviewRequestedAt && (
              <div className="numeral text-[11px] text-k-text-3">Αίτημα αξιολόγησης {when(order.reviewRequestedAt)}</div>
            )}
            <div className="numeral text-[10.5px] text-k-text-4">id {order.id}</div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}

function TotalRow({
  label,
  net,
  gross,
  money,
  warn,
}: {
  label: string;
  net: unknown;
  gross: unknown;
  money: (v: unknown) => string;
  warn?: boolean;
}) {
  return (
    <tr className={warn ? "text-k-red" : "text-k-text-2"}>
      <td className="px-4 py-1">{label}</td>
      <td className="px-2 py-1 text-right">{money(net)}</td>
      <td className="px-2 py-1 text-right">{money(Number(gross) - Number(net))}</td>
      <td className={warn ? "px-4 py-1 text-right" : "px-4 py-1 text-right text-k-ink"}>{money(gross)}</td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">{label}</dt>
      <dd className="text-k-ink">{children}</dd>
    </div>
  );
}

function Panel({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-k-line bg-white">
      <SectionTitle icon={icon} tone={tone}>
        {title}
      </SectionTitle>
      <div className="space-y-0.5 px-4 py-3">{children}</div>
    </section>
  );
}

function SectionTitle({
  icon: Icon,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 border-b border-k-line bg-k-surface-2/60 px-4 py-2.5 text-[12.5px] font-semibold tracking-tight text-k-ink">
      <span className={cn("flex size-6 items-center justify-center", TONE_CHIP[tone])}>
        <Icon className="size-3.5" />
      </span>
      {children}
    </h2>
  );
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center border px-2 py-0.5 text-[12px] font-medium", TONE_CHIP[tone])}>
      {children}
    </span>
  );
}

function SummaryTile({ label, tone, children }: { label: string; tone: Tone; children: React.ReactNode }) {
  return (
    <div className="relative bg-white px-4 py-3.5">
      <span className={cn("absolute inset-x-0 top-0 h-[3px]", TONE_BAR[tone])} aria-hidden />
      <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-k-text-4">{label}</p>
      {children}
    </div>
  );
}
