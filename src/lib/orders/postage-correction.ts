import "server-only";
import { prisma } from "@/lib/prisma";
import { grossAmount } from "@/lib/format";
import { FREE_SHIPPING_THRESHOLD_NET, SHIPPING_METHODS } from "@/lib/cart/options";
import { quoteLivePostage } from "@/lib/shipping/acs-live";
import { sendPostageCorrectionEmail } from "@/lib/mail/postage-correction-email";

/**
 * Re-pricing the postage of an order that was charged wrongly.
 *
 * The case it exists for: a product stored in millimetres was read as
 * centimetres and a 0,38 kg socket was quoted 163,99 EUR of postage. The fix
 * in the tariff stops it happening again; this is what repairs the orders it
 * already produced, and says sorry to the customer who saw that number.
 *
 * Only an UNPAID order can be corrected. Once money has moved the answer is a
 * refund, which is a different conversation with a different system.
 *
 * The same rules as checkout — live ACS quote, express multiplier, free
 * shipping over the threshold, 24 % VAT on postage — applied to the parcel as
 * the catalogue describes it today. Nothing the operator types changes an
 * amount: the preview and the apply both recompute from scratch, so what is
 * sent is what the rules say, not what a stale screen showed.
 */

const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type PostageAmounts = {
  shippingNet: number;
  shippingGross: number;
  vatAmount: number;
  totalGross: number;
};

export type PostagePreview = {
  orderNumber: string;
  before: PostageAmounts & { chargeableKg: number | null };
  after: PostageAmounts & {
    chargeableKg: number;
    actualKg: number;
    volumetricKg: number;
    source: "acs" | "table";
    zoneLabel: string;
    freeShipping: boolean;
  };
  subtotalGross: number;
};

export type PreviewResult = { ok: true; preview: PostagePreview } | { ok: false; error: string };

async function loadOrder(orderNumber: string) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function refusal(order: LoadedOrder | null): string | null {
  if (!order) return "Η παραγγελία δεν βρέθηκε.";
  if (order.paymentStatus === "PAID") {
    return "Η παραγγελία έχει πληρωθεί — η διαφορά επιστρέφεται, δεν αλλάζει το ποσό.";
  }
  if (order.status !== "PENDING_PAYMENT" && order.status !== "FAILED") {
    return "Διορθώνεται μόνο παραγγελία που περιμένει πληρωμή.";
  }
  const method = SHIPPING_METHODS.find((m) => m.id === order.shippingMethod);
  if (!method || method.expressMultiplier <= 0) return "Η παραγγελία δεν έχει μεταφορικά courier.";
  return null;
}

async function recompute(order: LoadedOrder) {
  const method = SHIPPING_METHODS.find((m) => m.id === order.shippingMethod)!;

  const productIds = order.lines.map((l) => l.productId).filter((id): id is string => !!id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, weight: true, width: true, length: true, height: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const num = (v: unknown) => (v == null ? null : Number(v));

  const quote = await quoteLivePostage({
    items: order.lines.map((l) => {
      const p = l.productId ? byId.get(l.productId) : undefined;
      return {
        quantity: l.quantity,
        weight: num(p?.weight) ?? num(l.weightKg),
        width: num(p?.width),
        length: num(p?.length),
        height: num(p?.height),
      };
    }),
    postcode: order.shipPostcode,
  });

  const subtotalNet = Number(order.subtotalNet);
  const freeShipping = method.freeOverThreshold && subtotalNet >= FREE_SHIPPING_THRESHOLD_NET;
  const shippingNet = freeShipping ? 0 : round(quote.totalNet * method.expressMultiplier);
  const shippingGross = grossAmount(shippingNet, { vatRate: 24 });
  const totalGross = round(Number(order.subtotalGross) + shippingGross + Number(order.paymentFeeGross));
  const totalNet = round(subtotalNet + shippingNet + Number(order.paymentFeeNet));

  return {
    quote,
    freeShipping,
    amounts: { shippingNet, shippingGross, vatAmount: round(totalGross - totalNet), totalGross },
  };
}

export async function previewPostageCorrection(orderNumber: string): Promise<PreviewResult> {
  const order = await loadOrder(orderNumber);
  const refused = refusal(order);
  if (refused || !order) return { ok: false, error: refused ?? "Η παραγγελία δεν βρέθηκε." };

  const { quote, freeShipping, amounts } = await recompute(order);
  const stored = (order.shippingQuote ?? {}) as { chargeableKg?: number };

  return {
    ok: true,
    preview: {
      orderNumber,
      subtotalGross: Number(order.subtotalGross),
      before: {
        shippingNet: Number(order.shippingNet),
        shippingGross: Number(order.shippingGross),
        vatAmount: Number(order.vatAmount),
        totalGross: Number(order.totalGross),
        chargeableKg: stored.chargeableKg ?? null,
      },
      after: {
        ...amounts,
        chargeableKg: quote.chargeableKg,
        actualKg: quote.actualKg,
        volumetricKg: quote.volumetricKg,
        source: quote.source,
        zoneLabel: quote.zoneLabel,
        freeShipping,
      },
    },
  };
}

export type ApplyResult =
  | { ok: true; totalGross: number; emailed: boolean; emailError?: string }
  | { ok: false; error: string };

export async function applyPostageCorrection(
  orderNumber: string,
  actor: { id: string; email: string },
  options: { notify: boolean; message?: string },
): Promise<ApplyResult> {
  const order = await loadOrder(orderNumber);
  const refused = refusal(order);
  if (refused || !order) return { ok: false, error: refused ?? "Η παραγγελία δεν βρέθηκε." };

  const { quote, amounts } = await recompute(order);
  const before = {
    shippingGross: Number(order.shippingGross),
    totalGross: Number(order.totalGross),
    chargeableKg: ((order.shippingQuote ?? {}) as { chargeableKg?: number }).chargeableKg ?? null,
  };
  if (Math.abs(amounts.totalGross - before.totalGross) < 0.005) {
    return { ok: false, error: "Ο επανυπολογισμός δίνει το ίδιο ποσό — δεν υπάρχει κάτι να διορθωθεί." };
  }

  const correctedAt = new Date();
  await prisma.order.update({
    where: { id: order.id },
    data: {
      shippingNet: amounts.shippingNet,
      shippingGross: amounts.shippingGross,
      vatAmount: amounts.vatAmount,
      totalGross: amounts.totalGross,
      status: "PENDING_PAYMENT",
      // The old Viva order carries the old amount. The webhook would refuse a
      // payment on it anyway (amount mismatch); dropping it means the next
      // payment attempt creates one for the right figure.
      vivaOrderCode: null,
      shippingQuote: JSON.parse(
        JSON.stringify({
          ...quote,
          correction: {
            at: correctedAt.toISOString(),
            by: actor.email,
            fromShippingGross: before.shippingGross,
            fromTotalGross: before.totalGross,
            fromChargeableKg: before.chargeableKg,
            notified: options.notify,
          },
        }),
      ),
      history: {
        create: {
          status: "PENDING_PAYMENT",
          actor: actor.email,
          note: `Διόρθωση μεταφορικών ${before.shippingGross.toFixed(2)} → ${amounts.shippingGross.toFixed(2)} €, σύνολο ${before.totalGross.toFixed(2)} → ${amounts.totalGross.toFixed(2)} €`,
        },
      },
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      userId: actor.id,
      action: "order.postage_correction",
      entity: "Order",
      entityId: order.id,
      diff: {
        orderNumber,
        shippingGross: { from: before.shippingGross, to: amounts.shippingGross },
        totalGross: { from: before.totalGross, to: amounts.totalGross },
        notified: options.notify,
      },
    },
  });

  if (!options.notify) return { ok: true, totalGross: amounts.totalGross, emailed: false };

  const mail = await sendPostageCorrectionEmail(orderNumber, {
    previousShippingGross: before.shippingGross,
    previousTotalGross: before.totalGross,
    message: options.message,
  });
  if (!mail.ok) {
    return { ok: true, totalGross: amounts.totalGross, emailed: false, emailError: mail.error };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      history: {
        create: { status: "PENDING_PAYMENT", actor: actor.email, note: `Email διόρθωσης τιμής στο ${order.email}` },
      },
    },
  });
  return { ok: true, totalGross: amounts.totalGross, emailed: true };
}
