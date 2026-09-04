"use server";

import { redirect } from "next/navigation";
import { hash as hashPassword } from "@node-rs/argon2";
import { sendOrderEmail } from "@/lib/mail/order-email";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { STOCK_HOLD_HOURS, holdExpiry } from "@/lib/orders/hold";
import { computeTotals, getCart, getCartToken } from "@/lib/cart/cart";
import { PAYMENT_METHODS, SHIPPING_METHODS } from "@/lib/cart/options";
import { quoteLivePostage } from "@/lib/shipping/acs-live";
import { createPaymentOrder, isVivaConfigured } from "@/lib/payment/viva";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/account/session";

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
  /** Νομός. */
  shipRegion: z.string().trim().max(120).optional().or(z.literal("")),
  /** Περιφέρεια. */
  shipAdminRegion: z.string().trim().max(120).optional().or(z.literal("")),

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

  /**
   * An account, if the customer wants one — optional, and empty for everybody
   * who does not.
   *
   * A guest has already typed their name, phone and address; asking them to
   * type all of it again later to see what they just bought is asking them to
   * do our filing. A password here is consent and a credential in one field,
   * so the account can be created outright — no link, no waiting — because the
   * person is present and chose it themselves.
   *
   * Eight characters is the same floor `setNewPassword` enforces. Kept in step
   * deliberately: a rule that differs by entrance is a rule somebody discovers
   * by being refused.
   */
  password: z.string().min(8).max(200).optional().or(z.literal("")),
});

/**
 * How long the Viva payment code stays valid: exactly as long as the hold.
 *
 * Derived from `STOCK_HOLD_HOURS` rather than chosen separately. It used to be
 * seven days while the hold was three hours, and a payment link that outlives
 * the hold is worse than a short one — it invites a transfer for goods released
 * to somebody else days earlier, so the money arrives for an order that cannot
 * be filled.
 */
const BANK_TRANSFER_WINDOW_MINUTES = STOCK_HOLD_HOURS * 60;

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

  /*
   * Who is placing this, if anyone.
   *
   * The column existed and was never written, so every order ever placed is
   * orphaned from its account and "my orders" had nothing to list. Guests still
   * get null and still get a token, which is what makes the confirmation page
   * work for someone who never registered.
   */
  const customer = await getCurrentUser();

  // Re-priced against the delivery postcode, not the indicative cart quote.
  const cart = await getCart(locale, input.shipPostcode);
  if (!cart || cart.lines.length === 0) return { error: "Το καλάθι σας είναι άδειο." };

  const shipping =
    SHIPPING_METHODS.find((m) => m.id === input.shippingMethod) ?? SHIPPING_METHODS[0];
  const payment =
    PAYMENT_METHODS.find((m) => m.id === input.paymentMethod) ?? PAYMENT_METHODS[0];

  /*
   * Kept as a guard even though nothing is `partnerOnly` any more: the field
   * exists, and the day something is added to it this is what stops a guest
   * reaching it by posting the id.
   */
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

  /*
   * One query for the whole basket. `products.mtrl` is the ERP id; a line whose
   * product has since been removed simply keeps null, which is honest — better
   * an unmapped line the push can report than a wrong id it cannot.
   */
  const mtrlRows = await prisma.product.findMany({
    where: { id: { in: cart.lines.map((line) => line.productId) } },
    select: { id: true, mtrl: true },
  });
  const mtrlByProductId = new Map(mtrlRows.map((row) => [row.id, row.mtrl]));

  const order = await prisma.order.create({
    data: {
      orderNumber,
      guestToken,
      customerId: customer?.id ?? null,
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
      shipAdminRegion: input.shipAdminRegion || null,

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
          /*
           * The ERP's own product id, resolved here and frozen with the line.
           *
           * The column existed and nothing ever filled it: 17 order lines, zero
           * with an MTRL. HDCtool's intake reported every one of them as
           * `unmappedLines`, so a document issued from an order would have
           * carried no items — the sale, with nothing sold.
           *
           * Resolved at placement rather than at push, and stored rather than
           * looked up again later, for the same reason as every other value on
           * this row: a product can be relisted under a different MTRL, and an
           * order is a record of what was bought, not of what the catalogue
           * says today.
           */
          mtrl: mtrlByProductId.get(line.productId) ?? null,
          sku: line.sku,
          name: line.name,
          brand: line.brandName,
          imageUrl: line.image,
          quantity: line.quantity,
          /* Κανονική τιμή και ποσοστό χωριστά — όπως τα θέλει η γραμμή του
             παραστατικού, και όπως πρέπει να διαβάζεται η παραγγελία σε έξι
             μήνες, όταν η καμπάνια θα έχει λήξει. */
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
        create: { status: "PENDING_PAYMENT", actor: "customer", note: "Order placed" },
      },
    },
    select: { id: true, orderNumber: true, guestToken: true, totalGross: true },
  });

  // The cart is emptied only after the order row exists — a failure above must
  // leave the customer with their basket intact.
  await prisma.cartLine.deleteMany({ where: { cart: { token: cartToken } } });

  /*
   * An account, when the customer asked for one by typing a password.
   *
   * Created outright rather than by emailing a link: the person is here, they
   * chose the password themselves, and everything a registration needs — name,
   * phone, email — they have just typed. Making them confirm by email what
   * they did thirty seconds ago on the same screen is ceremony.
   *
   * The order is attached, and so is every earlier guest order sharing the
   * address, so their history is complete from the first visit rather than
   * starting at this purchase.
   *
   * Deliberately NOT fatal and deliberately last. The order exists and is paid
   * for; an account is a convenience layered on top, and a duplicate email or a
   * hashing hiccup must never cost somebody the thing they actually came for.
   */
  if (input.password) {
    try {
      const email = input.email.trim().toLowerCase();
      const taken = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
      if (!taken) {
        const created = await prisma.customer.create({
          data: {
            email,
            passwordHash: await hashPassword(input.password),
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            /*
             * Retail, always — even when this order carried a ΑΦΜ.
             *
             * A company account grants partner pricing and credit and exists
             * only once somebody has approved it. Nobody gets one by ticking
             * "invoice" at checkout; that route is /b2b, and it goes through
             * a person.
             */
            accountType: "individual",
            status: "active",
          },
          select: { id: true },
        });

        await prisma.order.updateMany({
          where: { email: { equals: email, mode: "insensitive" }, customerId: null },
          data: { customerId: created.id },
        });
      }
    } catch (error) {
      console.error(`[checkout] ${order.orderNumber}: account not created`, error);
    }
  }

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
    /*
     * Stamp the hold BEFORE anything that can fail.
     *
     * Viva may be unreachable and the email may not send; neither changes the
     * fact that this order is holding stock from now. Writing the deadline
     * first means the shop always knows what it committed to, even for an order
     * whose payment link never got created.
     */
    const reservedUntil = holdExpiry();
    await prisma.order.update({
      where: { id: order.id },
      data: { reservedUntil },
    });

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

    /*
     * The email the payment step promises: "Θα λάβετε τα στοιχεία κατάθεσης".
     *
     * For a bank transfer this is not a courtesy — it carries the IBAN and the
     * reference to write on the deposit, without which the money arrives and
     * nobody can tell whose it is. Sent here rather than from the webhook,
     * because the whole point is that it goes out BEFORE the customer pays.
     *
     * Never fatal, and never awaited into the redirect's way for longer than it
     * takes: the order exists and is confirmed. A mail failure is logged and
     * the confirmation page still shows the details on screen.
     */
    const mail = await sendOrderEmail(order.orderNumber);
    if (!mail.ok) {
      console.error(`[checkout] ${order.orderNumber} email not sent: ${mail.error}`);
    }

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
