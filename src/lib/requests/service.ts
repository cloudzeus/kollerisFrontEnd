import "server-only";
import { prisma } from "@/lib/prisma";
import { createPaymentOrder, isVivaConfigured } from "@/lib/payment/viva";
import { syncRequestToHdctool } from "@/lib/orders/send-to-erp";
import { sendInternalRequestEmail, sendRequestEmail } from "@/lib/mail/request-emails";
import { quoteOfferShipping } from "@/lib/requests/shipping";
import {
  isWellFormedToken,
  offerExpiry,
  offerShippingNet,
  priceLines,
  readSnapshot,
  readStoredOffer,
  unknownLineRefs,
  type OfferWebhookBody,
  type StoredOffer,
} from "@/lib/requests/model";

/**
 * Back-order requests — the state changes (docs/backorder-requests.md).
 *
 *   REQUESTED → OFFERED | REJECTED     HDCtool, through `applyOfferWebhook`
 *   OFFERED   → ACCEPTED | DECLINED    the customer, through `acceptRequest` / `declineRequest`
 *   OFFERED   → EXPIRED                the sweep (`request-sweep.ts`)
 *   ACCEPTED  → paid                   the EXISTING Viva webhook / recheck / sweep
 *
 * Every transition is a conditional `updateMany` on the state it leaves, so a
 * double click, a retried webhook and the sweep racing the customer all end
 * with one transition, one email and one intake post.
 *
 * After every change the shop makes, HDCtool hears about it through the
 * ordinary intake (`syncRequestToHdctool`). Emails and the intake are awaited,
 * logged and never allowed to undo the state change that caused them.
 */

export { newRequestToken } from "@/lib/requests/token";

async function notifyHdctool(orderNumber: string, context: string): Promise<void> {
  const synced = await syncRequestToHdctool(orderNumber).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  }));
  if (!synced.ok) console.error(`[request] ${orderNumber} ${context}: HDCtool not told: ${synced.error}`);
}

async function email(kind: Parameters<typeof sendRequestEmail>[0], orderNumber: string): Promise<boolean> {
  const sent = await sendRequestEmail(kind, orderNumber).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  }));
  if (!sent.ok) console.error(`[request] ${orderNumber}: ${kind} email not sent: ${sent.error}`);
  return sent.ok;
}

// ── HDCtool → eshop: the offer ─────────────────────────────────────────────

export type OfferWebhookResult = {
  status: number;
  body: Record<string, unknown> & { ok: boolean };
};

export async function applyOfferWebhook(
  body: OfferWebhookBody,
  now: Date = new Date(),
): Promise<OfferWebhookResult> {
  const order = await prisma.order.findUnique({
    where: { orderNumber: body.orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      shippingMethod: true,
      shipPostcode: true,
      requestStatus: true,
      requestLines: true,
      offerVersion: true,
    },
  });
  if (!order) return { status: 404, body: { ok: false, error: "order_not_found" } };
  if (!order.requestStatus) return { status: 409, body: { ok: false, error: "not_a_request" } };

  const answered = (current: number | null): OfferWebhookResult =>
    current != null && body.offerVersion < current
      ? { status: 200, body: { ok: true, ignored: "stale_offer_version", offerVersion: current } }
      : { status: 200, body: { ok: true, duplicate: true, offerVersion: current } };

  // Idempotent per (orderNumber, offerVersion): the same version again is a
  // retry, an older one arrived late. Neither changes anything or emails anyone.
  if (order.offerVersion != null && body.offerVersion <= order.offerVersion) {
    return answered(order.offerVersion);
  }

  if (order.requestStatus === "ACCEPTED" || order.paymentStatus === "PAID") {
    return { status: 409, body: { ok: false, error: "already_accepted" } };
  }

  const requested = readSnapshot(order.requestLines)?.lines ?? [];
  const receivedAt = now.toISOString();
  let stored: StoredOffer;
  let data: Record<string, unknown>;

  if (body.decision === "offer") {
    const unknown = unknownLineRefs(body, requested);
    if (unknown.length > 0) {
      return { status: 422, body: { ok: false, error: "unknown_line_ids", lineIds: unknown } };
    }

    /*
     * Postage when staff left it to us: quoted ONCE, now, and stored with the
     * offer. The page, the emails and the amount charged on acceptance then all
     * read the same figure instead of three ACS calls that could disagree.
     */
    let quotedShippingNet: number | null = null;
    if (body.shippingNet == null) {
      try {
        const quoted = await quoteOfferShipping(order, body.lines);
        if (quoted.ok) quotedShippingNet = quoted.shippingNet;
      } catch (error) {
        console.error(`[request] ${order.orderNumber}: shipping quote failed, retried on acceptance`, error);
      }
    }

    const expiresAt = offerExpiry(body.expiresAt, now);
    stored = {
      decision: "offer",
      version: body.offerVersion,
      receivedAt,
      lines: body.lines,
      removedLineIds: body.removedLineIds,
      leadTimeText: body.leadTimeText,
      note: body.note,
      shippingNet: body.shippingNet,
      quotedShippingNet,
      expiresAt: expiresAt.toISOString(),
    };
    data = {
      requestStatus: "OFFERED",
      offerVersion: body.offerVersion,
      offerJson: stored,
      offerExpiresAt: expiresAt,
      offerRemindedAt: null,
      requestDecisionAt: null,
    };
  } else {
    stored = { decision: "reject", version: body.offerVersion, receivedAt, reason: body.reason };
    data = {
      requestStatus: "REJECTED",
      offerVersion: body.offerVersion,
      offerJson: stored,
      offerExpiresAt: null,
      requestDecisionAt: now,
    };
  }

  const { count } = await prisma.order.updateMany({
    where: {
      id: order.id,
      requestStatus: { not: "ACCEPTED" },
      paymentStatus: { not: "PAID" },
      OR: [{ offerVersion: null }, { offerVersion: { lt: body.offerVersion } }],
    },
    data,
  });
  if (count === 0) {
    // Another delivery got there first, or the customer accepted meanwhile.
    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      select: { offerVersion: true, requestStatus: true },
    });
    if (fresh?.requestStatus === "ACCEPTED") {
      return { status: 409, body: { ok: false, error: "already_accepted" } };
    }
    return answered(fresh?.offerVersion ?? null);
  }

  await prisma.orderStatusHistory.create({
    data: {
      orderId: order.id,
      status: order.status,
      actor: "hdctool",
      note:
        body.decision === "offer"
          ? `Αίτημα: πρόταση v${body.offerVersion} από το HDCtool`
          : `Αίτημα: απορρίφθηκε από το HDCtool${body.reason ? ` — ${body.reason}` : ""}`.slice(0, 1000),
    },
  });

  const emailed = await email(body.decision === "offer" ? "offer" : "rejected", order.orderNumber);
  return {
    status: 200,
    body: {
      ok: true,
      requestStatus: body.decision === "offer" ? "OFFERED" : "REJECTED",
      offerVersion: body.offerVersion,
      emailed,
    },
  };
}

// ── The customer: accept, decline ──────────────────────────────────────────

export type AcceptOutcome =
  | { ok: true; redirectUrl: string }
  | {
      ok: false;
      error:
        | "not_found"
        | "not_offered"
        | "stale_offer"
        | "expired"
        | "already_paid"
        | "conflict"
        | "unserviceable"
        | "payment_unavailable"
        | "payment_failed";
    };

const requestSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  shippingMethod: true,
  shipPostcode: true,
  totalGross: true,
  requestStatus: true,
  requestLines: true,
  offerVersion: true,
  offerJson: true,
  offerExpiresAt: true,
} as const;

/**
 * «Αποδοχή & πληρωμή».
 *
 * The browser sends the token and the version it was shown — the version only
 * so an offer that changed under the customer is not accepted blind. Lines,
 * prices, shipping and the total all come from the offer STORED on the order;
 * nothing the browser sends can move the amount Viva is asked to charge.
 */
export async function acceptRequest(
  token: unknown,
  shownVersion: unknown,
  now: Date = new Date(),
): Promise<AcceptOutcome> {
  if (!isWellFormedToken(token)) return { ok: false, error: "not_found" };
  const order = await prisma.order.findUnique({ where: { requestToken: token }, select: requestSelect });
  if (!order || !order.requestStatus) return { ok: false, error: "not_found" };
  if (order.paymentStatus === "PAID") return { ok: false, error: "already_paid" };

  // Accepted already (a second click, or back after closing Viva): pay again.
  if (order.requestStatus === "ACCEPTED") return startPayment(order, readSnapshot(order.requestLines)?.locale);

  if (order.requestStatus !== "OFFERED") return { ok: false, error: "not_offered" };
  const offer = readStoredOffer(order.offerJson);
  if (offer?.decision !== "offer" || order.offerVersion == null) return { ok: false, error: "not_offered" };
  if (Number(shownVersion) !== order.offerVersion) return { ok: false, error: "stale_offer" };
  if (!order.offerExpiresAt || order.offerExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "expired" };
  }

  let shippingNet = offerShippingNet(offer);
  if (shippingNet == null) {
    const quoted = await quoteOfferShipping(order, offer.lines);
    if (!quoted.ok) return { ok: false, error: "unserviceable" };
    shippingNet = quoted.shippingNet;
  }
  const totals = priceLines(offer.lines, shippingNet);

  // The catalogue fills what the offer does not carry: product id, picture, brand, weight.
  const mtrls = [...new Set(offer.lines.map((l) => l.mtrl))];
  const products = await prisma.product.findMany({
    where: { mtrl: { in: mtrls } },
    select: {
      id: true,
      mtrl: true,
      mtrmark: true,
      weight: true,
      images: { where: { isFeature: true }, take: 1, select: { url: true } },
    },
  });
  const byMtrl = new Map(products.map((p) => [p.mtrl, p]));
  const marks = [...new Set(products.map((p) => p.mtrmark).filter((m): m is number => m != null))];
  const brands = marks.length
    ? await prisma.brand.findMany({ where: { mtrmark: { in: marks } }, select: { mtrmark: true, nameEl: true } })
    : [];
  const brandByMark = new Map(brands.map((b) => [b.mtrmark, b.nameEl]));

  const lines = offer.lines.map((line, index) => {
    const product = byMtrl.get(line.mtrl);
    const priced = totals.lines[index];
    const weight = Number(product?.weight);
    return {
      orderId: order.id,
      productId: product?.id ?? null,
      mtrl: line.mtrl > 0 ? line.mtrl : null,
      sku: line.sku,
      name: line.name,
      brand: product?.mtrmark != null ? (brandByMark.get(product.mtrmark) ?? null) : null,
      imageUrl: product?.images[0]?.url ?? null,
      quantity: line.qty,
      unitNet: line.unitNet,
      discountPercent: 0,
      offerTitle: null,
      unitGross: priced.unitGross,
      vatRate: line.vatRate,
      lineNet: priced.lineNet,
      lineGross: priced.lineGross,
      weightKg: Number.isFinite(weight) && weight > 0 ? weight : null,
    };
  });

  const accepted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, requestStatus: "OFFERED", offerVersion: order.offerVersion },
      data: {
        requestStatus: "ACCEPTED",
        requestDecisionAt: now,
        status: "PENDING_PAYMENT",
        paymentMethod: "card",
        subtotalNet: totals.subtotalNet,
        subtotalGross: totals.subtotalGross,
        shippingNet: totals.shippingNet,
        shippingGross: totals.shippingGross,
        paymentFeeNet: 0,
        paymentFeeGross: 0,
        vatAmount: totals.vatAmount,
        totalGross: totals.totalGross,
        savingsGross: 0,
      },
    });
    if (count === 0) return false;
    // The original request stays in `requestLines`; the order's lines become the offer.
    await tx.orderLine.deleteMany({ where: { orderId: order.id } });
    await tx.orderLine.createMany({ data: lines });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "PENDING_PAYMENT",
        actor: "customer",
        note: `Αίτημα: αποδοχή πρότασης v${order.offerVersion} — ${totals.totalGross.toFixed(2)} €`,
      },
    });
    return true;
  });
  if (!accepted) return { ok: false, error: "conflict" };

  await notifyHdctool(order.orderNumber, "ACCEPTED");
  return startPayment(
    { ...order, totalGross: totals.totalGross },
    readSnapshot(order.requestLines)?.locale,
  );
}

/**
 * The Viva payment order for an accepted request — the same `createPaymentOrder`
 * the checkout uses, and from here on the order is paid through the existing
 * webhook / recheck / sweep like any other card or IRIS order.
 */
type PayableRequest = {
  id: string;
  orderNumber: string;
  totalGross: unknown;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
};

async function startPayment(order: PayableRequest, locale: string | undefined): Promise<AcceptOutcome> {
  if (!isVivaConfigured()) return { ok: false, error: "payment_unavailable" };
  try {
    const payment = await createPaymentOrder({
      amountGross: Number(order.totalGross),
      orderNumber: order.orderNumber,
      description: `Kolleris ${order.orderNumber}`,
      locale: locale === "en" || locale === "it" ? locale : "el",
      customer: {
        email: order.email,
        fullName: `${order.firstName} ${order.lastName}`,
        phone: order.phone,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { vivaOrderCode: payment.orderCode, status: "PENDING_PAYMENT" },
    });
    return { ok: true, redirectUrl: payment.checkoutUrl };
  } catch (error) {
    console.error(`[request] ${order.orderNumber}: Viva order not created`, error);
    return { ok: false, error: "payment_failed" };
  }
}

export type DeclineOutcome =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_offered" | "stale_offer" | "expired" };

export async function declineRequest(
  token: unknown,
  shownVersion: unknown,
  now: Date = new Date(),
): Promise<DeclineOutcome> {
  if (!isWellFormedToken(token)) return { ok: false, error: "not_found" };
  const order = await prisma.order.findUnique({ where: { requestToken: token }, select: requestSelect });
  if (!order || !order.requestStatus) return { ok: false, error: "not_found" };
  if (order.requestStatus === "DECLINED") return { ok: true };
  if (order.requestStatus !== "OFFERED") return { ok: false, error: "not_offered" };
  if (Number(shownVersion) !== order.offerVersion) return { ok: false, error: "stale_offer" };
  if (!order.offerExpiresAt || order.offerExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "expired" };
  }

  const { count } = await prisma.order.updateMany({
    where: { id: order.id, requestStatus: "OFFERED", offerVersion: order.offerVersion },
    data: { requestStatus: "DECLINED", requestDecisionAt: now },
  });
  if (count === 0) return { ok: false, error: "not_offered" };

  await prisma.orderStatusHistory.create({
    data: {
      orderId: order.id,
      status: order.status,
      actor: "customer",
      note: `Αίτημα: ο πελάτης απέρριψε την πρόταση v${order.offerVersion}`,
    },
  });
  await notifyHdctool(order.orderNumber, "DECLINED");
  return { ok: true };
}

// ── The timer ───────────────────────────────────────────────────────────────

/** OFFERED → EXPIRED for one order, if it still is OFFERED and past its expiry. */
export async function expireRequest(order: { id: string; orderNumber: string; status: string }, now: Date) {
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, requestStatus: "OFFERED", offerExpiresAt: { lte: now } },
    data: { requestStatus: "EXPIRED", requestDecisionAt: now },
  });
  if (count === 0) return false;
  await prisma.orderStatusHistory.create({
    data: {
      orderId: order.id,
      status: order.status as "PENDING_PAYMENT",
      actor: "request-sweep",
      note: "Αίτημα: η πρόταση έληξε χωρίς απάντηση",
    },
  });
  await email("expired", order.orderNumber);
  await notifyHdctool(order.orderNumber, "EXPIRED");
  return true;
}

/** The one reminder. Claimed before sending, so two sweeps never send two. */
export async function remindRequest(order: { id: string; orderNumber: string }, now: Date) {
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, requestStatus: "OFFERED", offerRemindedAt: null, offerExpiresAt: { gt: now } },
    data: { offerRemindedAt: now },
  });
  if (count === 0) return false;
  await email("reminder", order.orderNumber);
  return true;
}

/** The submission side-effects, after the request order exists. */
export async function announceNewRequest(orderNumber: string): Promise<void> {
  await email("received", orderNumber);
  const internal = await sendInternalRequestEmail(orderNumber).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  }));
  if (!internal.ok) console.error(`[request] ${orderNumber}: internal email not sent: ${internal.error}`);
  await notifyHdctool(orderNumber, "REQUESTED");
}
