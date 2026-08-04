"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeTotals, getCart, getCartToken } from "@/lib/cart/cart";
import { PAYMENT_METHODS, SHIPPING_METHODS } from "@/lib/cart/options";
import { quoteLivePostage } from "@/lib/shipping/acs-live";
import { createPaymentOrder, isVivaConfigured } from "@/lib/payment/viva";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Order placement.
 *
 * Everything is recomputed here from the database — prices, postage, VAT,
 * totals. The form supplies only the address, the choices and the consent. A
 * disabled submit button is a UX affordance; this is the actual control.
 */

const checkoutSchema = z.object({
  email: z.email().max(320),
  phone: z.string().trim().min(8).max(64),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),

  shipLine1: z.string().trim().min(3).max(255),
  shipLine2: z.string().trim().max(255).optional().or(z.literal("")),
  shipCity: z.string().trim().min(2).max(120),
  shipPostcode: z.string().trim().min(4).max(16),
  shipRegion: z.string().trim().max(120).optional().or(z.literal("")),

  wantsInvoice: z.union([z.literal("on"), z.literal("")]).optional(),
  companyName: z.string().trim().max(255).optional().or(z.literal("")),
  vatNumber: z.string().trim().max(32).optional().or(z.literal("")),
  taxOffice: z.string().trim().max(120).optional().or(z.literal("")),
  companyTrade: z.string().trim().max(255).optional().or(z.literal("")),
  /// Set by the ΑΦΜ lookup when HDCtool already knows this company.
  erpTrdr: z.coerce.number().int().positive().optional().or(z.literal("")),

  shippingMethod: z.string().max(32),
  paymentMethod: z.string().max(32),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  terms: z.union([z.literal("on"), z.literal("")]).optional(),
  locale: z.string().max(5).optional(),
});

/**
 * How long a bank-transfer payment code stays valid.
 *
 * Seven days. A SEPA credit between Greek banks clears in one working day, and
 * the customer has to reach a banking app first; the 30 minutes a card payment
 * gets would expire before the transfer was made.
 */
const BANK_TRANSFER_WINDOW_MINUTES = 7 * 24 * 60;

export type CheckoutState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** KOL-YYYYMMDD-NNNN, sequential within the day. */
async function nextOrderNumber(): Promise<string> {
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const prefix = `KOL-${day}-`;

  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  const next = last ? Number.parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function placeOrder(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Ελέγξτε τα στοιχεία σας.", fieldErrors };
  }
  const input = parsed.data;

  // The checkbox is disabled client-side too, but that is decoration.
  if (input.terms !== "on") {
    return {
      error: "Πρέπει να αποδεχτείτε τους όρους χρήσης.",
      fieldErrors: { terms: "Απαιτείται" },
    };
  }

  const wantsInvoice = input.wantsInvoice === "on";
  if (wantsInvoice && (!input.companyName || !input.vatNumber)) {
    return {
      error: "Για τιμολόγιο χρειάζονται επωνυμία και ΑΦΜ.",
      fieldErrors: {
        ...(input.companyName ? {} : { companyName: "Απαιτείται" }),
        ...(input.vatNumber ? {} : { vatNumber: "Απαιτείται" }),
      },
    };
  }

  const locale = (routing.locales.includes(input.locale as Locale)
    ? input.locale
    : routing.defaultLocale) as Locale;

  const cartToken = await getCartToken();
  if (!cartToken) return { error: "Το καλάθι σας είναι άδειο." };

  // Re-priced against the delivery postcode, not the indicative cart quote.
  const cart = await getCart(locale, input.shipPostcode);
  if (!cart || cart.lines.length === 0) return { error: "Το καλάθι σας είναι άδειο." };

  const shipping =
    SHIPPING_METHODS.find((m) => m.id === input.shippingMethod) ?? SHIPPING_METHODS[0];
  const payment =
    PAYMENT_METHODS.find((m) => m.id === input.paymentMethod) ?? PAYMENT_METHODS[0];

  // "Επί πιστώσει" is partner-only; guests must not reach it by posting the id.
  if (payment.partnerOnly) {
    return { error: "Ο τρόπος πληρωμής δεν είναι διαθέσιμος για τον λογαριασμό σας." };
  }

  /*
   * Priced on what was SUBMITTED, not on what the cart row remembers.
   *
   * `getCart` reads the shipping and payment method from the Cart row, which is
   * written by the basket page. The checkout form has its own controls and did
   * not write back, so choosing "collect from the shop" here produced an order
   * stamped `pickup` and charged the courier rate that was still sitting in the
   * database. The customer was billed for delivery on an order they came to
   * fetch.
   *
   * The form is the last word and the ids above are already validated against
   * the offered list, so the totals are recomputed from them.
   */
  const totals = await computeTotals(cart.lines, shipping.id, payment.id, input.shipPostcode);

  const quote =
    shipping.expressMultiplier > 0
      ? await quoteLivePostage({
          items: cart.lines.map((l) => ({
            quantity: l.quantity,
            weight: l.weight,
            width: l.width,
            length: l.length,
            height: l.height,
          })),
          postcode: input.shipPostcode,
        })
      : null;

  const orderNumber = await nextOrderNumber();
  const guestToken = randomBytes(24).toString("base64url");

  const order = await prisma.order.create({
    data: {
      orderNumber,
      guestToken,
      status: "PENDING_PAYMENT",
      // Every method now settles before or after dispatch, never on it: cash on
      // delivery is not accepted, so ON_DELIVERY can no longer be reached.
      paymentStatus: "PENDING",

      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,

      shipLine1: input.shipLine1,
      shipLine2: input.shipLine2 || null,
      shipCity: input.shipCity,
      shipPostcode: input.shipPostcode,
      shipRegion: input.shipRegion || null,

      wantsInvoice,
      companyName: wantsInvoice ? input.companyName || null : null,
      vatNumber: wantsInvoice ? input.vatNumber || null : null,
      taxOffice: wantsInvoice ? input.taxOffice || null : null,
      companyTrade: wantsInvoice ? input.companyTrade || null : null,
      erpTrdr: wantsInvoice && typeof input.erpTrdr === "number" ? input.erpTrdr : null,

      shippingMethod: shipping.id,
      paymentMethod: payment.id,
      notes: input.notes || null,

      subtotalNet: totals.subtotalNet,
      subtotalGross: totals.subtotalGross,
      shippingNet: totals.shippingNet,
      shippingGross: totals.shippingGross,
      paymentFeeNet: totals.paymentFeeNet,
      paymentFeeGross: totals.paymentFeeGross,
      vatAmount: totals.vatAmount,
      totalGross: totals.totalGross,
      savingsGross: totals.savingsGross,
      shippingQuote: quote ? JSON.parse(JSON.stringify(quote)) : undefined,

      lines: {
        create: cart.lines.map((line) => ({
          productId: line.productId,
          sku: line.sku,
          name: line.name,
          brand: line.brandName,
          imageUrl: line.image,
          quantity: line.quantity,
          unitNet: line.unitNet,
          unitGross: line.lineGross / line.quantity,
          vatRate: line.vatRate,
          lineNet: line.lineNet,
          lineGross: line.lineGross,
          weightKg: line.weight,
        })),
      },
      history: {
        create: { status: "PENDING_PAYMENT", actor: "customer", note: "Order placed" },
      },
    },
    select: { id: true, orderNumber: true, guestToken: true, totalGross: true },
  });

  // The cart is emptied only after the order row exists — a failure above must
  // leave the customer with their basket intact.
  await prisma.cartLine.deleteMany({ where: { cart: { token: cartToken } } });

  /*
   * Bank transfer: accepted now, reconciled later, and it needs a reference.
   *
   * The order used to be confirmed with nothing tying a future deposit to it,
   * so matching a bank statement line to an order was a manual search by name
   * and amount. Asking Viva for a payment order gives the customer a code to
   * quote on the transfer, and when the money lands Viva notifies
   * `/api/webhooks/viva` with our order number in `merchantTrns` — the same
   * path a card payment already takes. Reconciliation stops being clerical.
   *
   * Deliberately NOT fatal. The order is placed and the goods are reserved; a
   * Viva outage must not undo that. Without a code the confirmation page simply
   * asks the customer to quote the order number, which is what happened before.
   *
   * The window is long because a transfer is not a card: SEPA credit between
   * Greek banks routinely takes a working day, and a code that expires in half
   * an hour would expire before anyone reached a banking app.
   */
  if (payment.id === "bank") {
    if (isVivaConfigured()) {
      try {
        const paymentOrder = await createPaymentOrder({
          amountGross: Number(order.totalGross),
          orderNumber: order.orderNumber,
          description: `Kolleris ${order.orderNumber}`,
          locale,
          customer: {
            email: input.email,
            fullName: `${input.firstName} ${input.lastName}`,
            phone: input.phone,
          },
          expiryMinutes: BANK_TRANSFER_WINDOW_MINUTES,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { vivaOrderCode: paymentOrder.orderCode },
        });
      } catch (error) {
        console.error(`[checkout] no Viva code for ${order.orderNumber}`, error);
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });
    redirect(`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`);
  }

  // Anything else that settles off-site needs no redirect and no code.
  if (payment.id !== "card" && payment.id !== "iris") {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });
    redirect(`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`);
  }

  if (!isVivaConfigured()) {
    // The order exists and is recoverable; say so instead of losing it.
    return {
      error:
        "Η πληρωμή με κάρτα δεν είναι διαθέσιμη αυτή τη στιγμή. Η παραγγελία " +
        `${order.orderNumber} καταχωρήθηκε — θα επικοινωνήσουμε μαζί σας.`,
    };
  }

  let checkoutUrl: string;
  try {
    const paymentOrder = await createPaymentOrder({
      amountGross: Number(order.totalGross),
      orderNumber: order.orderNumber,
      description: `Kolleris ${order.orderNumber}`,
      locale,
      customer: {
        email: input.email,
        fullName: `${input.firstName} ${input.lastName}`,
        phone: input.phone,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { vivaOrderCode: paymentOrder.orderCode },
    });
    checkoutUrl = paymentOrder.checkoutUrl;
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "FAILED",
        history: {
          create: {
            status: "FAILED",
            actor: "system",
            note: error instanceof Error ? error.message : "Viva order failed",
          },
        },
      },
    });
    return {
      error: `Η σύνδεση με την τράπεζα απέτυχε. Η παραγγελία ${order.orderNumber} καταχωρήθηκε — καλέστε μας στο 210 411 1355.`,
    };
  }

  // Outside the try: `redirect` throws by design, and catching it here would
  // turn a successful checkout into an error message.
  redirect(checkoutUrl);
}
