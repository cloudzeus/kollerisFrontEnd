import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CartLineView } from "@/lib/cart/options";
import { priceLines, type RequestLine, type RequestSnapshot } from "@/lib/requests/model";
import { newRequestToken } from "@/lib/requests/token";

/**
 * A back-order request, written at checkout.
 *
 * It is an `orders` row like any other — the same contact, address and invoice
 * columns, the same lines — so HDCtool's intake, the admin and the emails read
 * it without a second shape. What makes it a request is `requestStatus`, and
 * what keeps it from becoming a sale is that nothing pays it (no Viva order, no
 * stock hold) and `sendOrderToErp` refuses it until it is ACCEPTED and PAID.
 *
 * Shipping is 0 on purpose: it is decided with the offer (contract §1), and a
 * figure here would be a promise nobody has priced.
 */

/** The columns a request shares with the order the customer was placing. */
export type OrderBase = Pick<
  Prisma.OrderUncheckedCreateInput,
  | "email"
  | "phone"
  | "firstName"
  | "lastName"
  | "shipLine1"
  | "shipLine2"
  | "shipCity"
  | "shipPostcode"
  | "shipCountry"
  | "billCountry"
  | "shipRegion"
  | "shipAdminRegion"
  | "wantsInvoice"
  | "companyName"
  | "vatNumber"
  | "taxOffice"
  | "companyTrade"
  | "erpTrdr"
  | "customerType"
  | "shippingMethod"
  | "notes"
>;

export function snapshotLines(
  lines: ReadonlyArray<CartLineView>,
  ids: ReadonlyArray<string>,
  mtrlByProductId: ReadonlyMap<string, number | null>,
): RequestLine[] {
  return lines.map((line, index) => ({
    lineId: ids[index],
    productId: line.productId,
    mtrl: mtrlByProductId.get(line.productId) ?? null,
    sku: line.sku,
    name: line.name,
    brand: line.brandName,
    imageUrl: line.image,
    qty: line.quantity,
    unitNet: line.unitNetFinal,
    vatRate: line.vatRate,
    stockAtRequest: Number.isFinite(line.availableQty) ? Math.max(0, line.availableQty) : null,
  }));
}

export async function createRequestOrder(input: {
  orderNumber: string;
  guestToken: string;
  customerId: string | null;
  locale: string;
  base: OrderBase;
  lines: ReadonlyArray<CartLineView>;
  mtrlByProductId: ReadonlyMap<string, number | null>;
  parentOrderNumber: string | null;
  now?: Date;
}): Promise<{ id: string; orderNumber: string; requestToken: string }> {
  const now = input.now ?? new Date();
  const requestToken = newRequestToken();
  const ids = input.lines.map(() => randomUUID());
  const requested = snapshotLines(input.lines, ids, input.mtrlByProductId);
  const snapshot: RequestSnapshot = { v: 1, locale: input.locale, lines: requested };
  const totals = priceLines(requested, 0);

  const created = await prisma.order.create({
    data: {
      ...input.base,
      orderNumber: input.orderNumber,
      guestToken: input.guestToken,
      customerId: input.customerId,
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      /* The customer did not choose one: an offer is paid on Viva's page,
         card or IRIS, and `resolvePaymentMethod` records what was used. */
      paymentMethod: "card",

      subtotalNet: totals.subtotalNet,
      subtotalGross: totals.subtotalGross,
      shippingNet: 0,
      shippingGross: 0,
      vatAmount: totals.vatAmount,
      totalGross: totals.totalGross,

      requestStatus: "REQUESTED",
      requestToken,
      requestedAt: now,
      parentOrderNumber: input.parentOrderNumber,
      requestLines: snapshot as unknown as Prisma.InputJsonValue,

      lines: {
        create: input.lines.map((line, index) => ({
          id: ids[index],
          productId: line.productId,
          mtrl: input.mtrlByProductId.get(line.productId) ?? null,
          sku: line.sku,
          name: line.name,
          brand: line.brandName,
          imageUrl: line.image,
          quantity: line.quantity,
          unitNet: line.unitNet,
          discountPercent: line.discountPercent,
          offerTitle: line.offerTitle,
          unitGross: line.lineGross / line.quantity,
          vatRate: line.vatRate,
          lineNet: line.lineNet,
          lineGross: line.lineGross,
          weightKg: line.weight,
        })),
      },
      history: {
        create: {
          status: "PENDING_PAYMENT",
          actor: "customer",
          note: input.parentOrderNumber
            ? `Αίτημα κατόπιν παραγγελίας (τα διαθέσιμα στην ${input.parentOrderNumber})`
            : "Αίτημα κατόπιν παραγγελίας",
        },
      },
    },
    select: { id: true, orderNumber: true },
  });

  return { ...created, requestToken };
}
