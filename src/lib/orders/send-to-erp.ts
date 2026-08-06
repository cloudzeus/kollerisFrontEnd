import "server-only";
import { prisma } from "@/lib/prisma";
import { hdctoolRequest } from "@/lib/hdctool/client";
import { resolvePaymentMethod } from "@/lib/orders/viva-payment-method";

/**
 * Sending a paid order to SoftOne — the half that was missing.
 *
 * Everything else already existed. HDCtool has intake
 * (`POST /api/public/orders`), a push that creates the document
 * (`POST /api/public/orders/{orderNumber}/push`), the retail-customer lookup
 * for a buyer with no ΑΦΜ, and the document configuration: series 7020,
 * warehouse 1000, payment 1025 card / 1007 bank transfer / 1024 IRIS. The
 * admin even had the menu item.
 *
 * What it did not have was anything behind the menu item. `Αποστολή στο
 * SoftOne` was a `DropdownMenuItem` with no handler — it rendered, it
 * highlighted, it closed the menu, and that was all. `eshop_orders` in HDCtool
 * held zero rows, so no eshop order had ever reached the ERP.
 *
 * ── Two calls, never one ────────────────────────────────────────────────────
 *
 * Intake stores; push issues the document. That separation is HDCtool's and it
 * is right: a SoftOne outage must not lose the order, and a push must be safe
 * to repeat against a row that already exists. So this does both in order and
 * reports which one failed — "stored but not invoiced" and "not stored at all"
 * need different answers from whoever reads it.
 *
 * ── Money crosses as strings ────────────────────────────────────────────────
 *
 * Deliberate, and HDCtool's intake documents why: it keeps the raw body for
 * comparison when a figure is disputed, and a JSON number would normalise
 * 51.50 to 51.5 before anyone could compare anything. `Decimal.toFixed(2)`
 * preserves what was agreed at checkout.
 */

export type SendToErpResult =
  | { ok: true; findoc: number | null; alreadySent: boolean }
  | { ok: false; stage: "intake" | "push" | "order"; error: string };

type PushResponse = {
  success?: boolean;
  error?: string;
  findoc?: number | string | null;
  saldoc?: number | string | null;
  needsConfiguration?: boolean;
};

/** `12.30`, not `12.3` — see the note above about comparing stored figures. */
function money(value: { toFixed: (n: number) => string } | null | undefined): string | undefined {
  return value == null ? undefined : value.toFixed(2);
}

export async function sendOrderToErp(orderNumber: string): Promise<SendToErpResult> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });

  if (!order) return { ok: false, stage: "order", error: "Η παραγγελία δεν βρέθηκε." };

  /*
   * Already done. Not an error, and deliberately not a re-push: a second
   * document for one sale is the failure this whole path exists to avoid, and
   * HDCtool's own idempotence should never be the only thing standing between
   * a double click and a double invoice.
   */
  if (order.erpFindoc) {
    return { ok: true, findoc: order.erpFindoc, alreadySent: true };
  }

  /*
   * Unpaid orders are not documents.
   *
   * The admin only offers the action on a PAID order, but the check belongs
   * here too: a menu is a suggestion and this issues a financial record.
   */
  if (order.paymentStatus !== "PAID") {
    return { ok: false, stage: "order", error: "Η παραγγελία δεν είναι πληρωμένη." };
  }

  const body = {
    orderNumber: order.orderNumber,
    orderId: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,

    email: order.email,
    phone: order.phone,
    firstName: order.firstName,
    lastName: order.lastName,

    shipLine1: order.shipLine1,
    shipLine2: order.shipLine2,
    shipCity: order.shipCity,
    shipPostcode: order.shipPostcode,
    shipRegion: order.shipRegion,
    shipCountry: order.shipCountry,

    wantsInvoice: order.wantsInvoice,
    companyName: order.companyName,
    vatNumber: order.vatNumber,
    taxOffice: order.taxOffice,
    companyTrade: order.companyTrade,
    billLine1: order.billLine1,
    billCity: order.billCity,
    billPostcode: order.billPostcode,

    shippingMethod: order.shippingMethod,
    /*
     * What was actually used, not what was chosen here.
     *
     * Viva's page lets the shopper pick again, so an order that says "card"
     * may have been paid with IRIS — and the ERP has a different code for
     * each. `resolvePaymentMethod` prefers Viva's own answer and falls back to
     * the checkout choice when Viva's id is one we have not identified yet.
     */
    paymentMethod: resolvePaymentMethod(
      order.paymentMethod,
      order.vivaPaymentMethodId,
      order.orderNumber,
    ).method,
    notes: order.notes,

    subtotalNet: money(order.subtotalNet),
    subtotalGross: money(order.subtotalGross),
    shippingNet: money(order.shippingNet),
    shippingGross: money(order.shippingGross),
    paymentFeeNet: money(order.paymentFeeNet),
    paymentFeeGross: money(order.paymentFeeGross),
    vatAmount: money(order.vatAmount),
    totalGross: money(order.totalGross),

    vivaOrderCode: order.vivaOrderCode,
    vivaTransactionId: order.vivaTransactionId,
    paidAt: order.paidAt?.toISOString() ?? null,
    erpTrdr: order.erpTrdr,

    /*
     * The document configuration is NOT sent.
     *
     * HDCtool holds it — series 7020, warehouse 1000, and the payment code
     * chosen from `paymentMethod` — in `eshop-order-erp-config.ts`. Sending it
     * from here would put the same four numbers in two places, and the one that
     * issues the document is the one that should own them. `paymentMethod`
     * travels instead, which is the fact; the code is the interpretation.
     */

    lines: order.lines.map((line) => ({
      mtrl: line.mtrl,
      sku: line.sku,
      name: line.name,
      brand: line.brand,
      quantity: line.quantity,
      unitNet: money(line.unitNet),
      unitGross: money(line.unitGross),
      vatRate: money(line.vatRate),
      lineNet: money(line.lineNet),
      lineGross: money(line.lineGross),
      weightKg: line.weightKg == null ? null : line.weightKg.toFixed(3),
    })),
  };

  try {
    await hdctoolRequest<{ success?: boolean }>("/api/public/orders", body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordFailure(order.id, `Αποθήκευση στο HDCtool: ${message}`);
    return { ok: false, stage: "intake", error: message };
  }

  let push: PushResponse;
  try {
    push = await hdctoolRequest<PushResponse>(
      `/api/public/orders/${encodeURIComponent(order.orderNumber)}/push`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordFailure(order.id, `Παραστατικό SoftOne: ${message}`);
    return { ok: false, stage: "push", error: message };
  }

  if (!push.success) {
    const message = push.error ?? "Το SoftOne απέρριψε το παραστατικό χωρίς μήνυμα.";
    await recordFailure(order.id, message);
    return { ok: false, stage: "push", error: message };
  }

  const findocRaw = push.findoc ?? push.saldoc ?? null;
  const findoc = findocRaw == null ? null : Number(findocRaw);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      erpFindoc: Number.isFinite(findoc) && findoc ? findoc : null,
      erpPushedAt: new Date(),
      erpError: null,
    },
  });

  return { ok: true, findoc: Number.isFinite(findoc) ? findoc : null, alreadySent: false };
}

/**
 * The reason is written to the order, not only returned.
 *
 * The admin list reads `erpError` and shows it under the row. A failure that
 * lives only in a toast is a failure nobody can act on an hour later.
 */
async function recordFailure(orderId: string, message: string): Promise<void> {
  await prisma.order
    .update({ where: { id: orderId }, data: { erpError: message.slice(0, 1000) } })
    .catch(() => {
      // The push already failed; losing the note is worse but not worth a
      // second failure on top of it.
    });
}
