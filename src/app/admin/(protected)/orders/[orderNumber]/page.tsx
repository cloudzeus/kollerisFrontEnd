import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/admin/PageShell";
import { formatMoney } from "@/lib/format";
import { ADMIN_LOCALE } from "@/lib/admin/locale";

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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="border border-k-line bg-white">
            <h2 className="border-b border-k-line px-4 py-2.5 text-[12px] font-medium text-k-text-2">
              ΕΙΔΗ
            </h2>
            <table className="w-full text-[13px]">
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.id} className="border-b border-k-line last:border-0">
                    <td className="px-4 py-2.5">
                      <div>{line.name}</div>
                      <div className="numeral text-[11px] text-k-text-3">
                        {line.sku}
                        {line.mtrl ? ` · MTRL ${line.mtrl}` : " · χωρίς MTRL"}
                      </div>
                    </td>
                    <td className="numeral px-2 py-2.5 text-center">{line.quantity}</td>
                    <td className="numeral px-4 py-2.5 text-right">{money(line.lineGross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1 border-t border-k-line px-4 py-3 text-[13px]">
              <Row label="Μερικό σύνολο" value={money(order.subtotalGross)} />
              <Row label="Μεταφορικά" value={money(order.shippingGross)} />
              {Number(order.paymentFeeGross) > 0 && (
                <Row label="Έξοδα πληρωμής" value={money(order.paymentFeeGross)} />
              )}
              <Row label="ΦΠΑ" value={money(order.vatAmount)} />
              <div className="flex justify-between border-t border-k-ink pt-2 font-medium">
                <dt>Σύνολο</dt>
                <dd className="numeral">{money(order.totalGross)}</dd>
              </div>
            </dl>
          </section>

          <section className="border border-k-line bg-white">
            <h2 className="border-b border-k-line px-4 py-2.5 text-[12px] font-medium text-k-text-2">
              ΙΣΤΟΡΙΚΟ
            </h2>
            <ol className="divide-y divide-k-line">
              {order.history.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5 text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{STATUS_LABEL[entry.status] ?? entry.status}</span>
                    <span className="numeral shrink-0 text-[11px] text-k-text-3">
                      {when(entry.createdAt)}
                    </span>
                  </div>
                  <div className="text-[11px] text-k-text-3">
                    {entry.actor}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </div>
                </li>
              ))}
              {order.history.length === 0 && (
                <li className="px-4 py-3 text-[13px] text-k-text-3">Καμία εγγραφή.</li>
              )}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          <Panel title="ΠΕΛΑΤΗΣ">
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
              {order.customerId ? "Εγγεγραμμένος" : "Επισκέπτης"}
            </div>
          </Panel>

          <Panel title="ΑΠΟΣΤΟΛΗ">
            <div className="text-[13px]">
              {order.shipLine1}
              {order.shipLine2 ? `, ${order.shipLine2}` : ""}
            </div>
            <div className="text-[13px]">
              {order.shipPostcode} {order.shipCity}
              {order.shipRegion ? ` · ${order.shipRegion}` : ""}
            </div>
            <div className="pt-2 text-[12px] text-k-text-2">{order.shippingMethod}</div>
            <div className="numeral text-[12px]">
              {order.acsVoucherNo ? `ACS ${order.acsVoucherNo}` : "Χωρίς αποστολή ACS"}
            </div>
          </Panel>

          {order.wantsInvoice && (
            <Panel title="ΤΙΜΟΛΟΓΙΟ">
              <div className="text-[13px]">{order.companyName ?? "—"}</div>
              <div className="numeral text-[12px]">ΑΦΜ {order.vatNumber ?? "—"}</div>
              <div className="text-[12px]">{order.taxOffice ?? ""}</div>
              <div className="text-[12px] text-k-text-2">{order.companyTrade ?? ""}</div>
            </Panel>
          )}

          <Panel title="ΠΛΗΡΩΜΗ">
            <div className="text-[13px]">
              {METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}
            </div>
            <div className="text-[12px] text-k-text-2">
              {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
              {order.paidAt ? ` · ${when(order.paidAt)}` : ""}
            </div>
            {order.vivaOrderCode && (
              <div className="numeral text-[11px] text-k-text-3">
                Viva {order.vivaOrderCode}
              </div>
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

          <Panel title="SOFTONE">
            {order.erpFindoc ? (
              <>
                {/*
                  Series AND number. A FINDOC is unique only within its series,
                  so a bare number is not something anybody can look up in
                  SoftOne — they would have to know which book to open.
                */}
                <div className="numeral text-[13px] text-k-green">
                  {order.erpSeries ? `${order.erpSeries} / ` : ""}
                  {order.erpFindoc}
                </div>
                <div className="text-[11px] text-k-text-3">
                  Παραστατικό · {when(order.erpPushedAt)}
                </div>
              </>
            ) : (
              <div className="text-[13px] text-k-text-2">Δεν έχει σταλεί</div>
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

          {order.notes && (
            <Panel title="ΣΗΜΕΙΩΣΕΙΣ">
              <div className="whitespace-pre-wrap text-[13px]">{order.notes}</div>
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-k-text-2">
      <dt>{label}</dt>
      <dd className="numeral text-k-ink">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-k-line bg-white">
      <h2 className="border-b border-k-line px-4 py-2.5 text-[12px] font-medium text-k-text-2">
        {title}
      </h2>
      <div className="space-y-0.5 px-4 py-3">{children}</div>
    </section>
  );
}
