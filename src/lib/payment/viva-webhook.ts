import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIVA_STATUS_PAID, getTransaction } from "@/lib/payment/viva";
import { sendOrderEmail } from "@/lib/mail/order-email";
import { syncPaymentToErp } from "@/lib/orders/send-to-erp";

/**
 * The one implementation behind every Viva webhook route.
 *
 * Viva registers a URL per event and verifies each one separately, which is
 * worth having: a failing event can be switched off in Viva's portal without
 * taking the others down, and a delivery on the wrong path is visible in the
 * access log. What is not worth having is four copies of the same handler, so
 * the route files are three lines each and the thinking lives here.
 *
 * A POST body is a NOTIFICATION, never evidence. Anything arriving over HTTP
 * can be forged, so nothing here believes a payment until it has read the
 * transaction back from Viva's API. The body says *which* transaction to ask
 * about; that is all it is trusted for.
 *
 * The four events are not variations on one shape. Two carry a transaction, one
 * carries only an order code, and one is not about an order at all. Ids and
 * payload fields confirmed against Viva's developer portal, 2026-08-04.
 */

export const VIVA_EVENTS = {
  /** 1796 — a payment succeeded. EventData carries TransactionId + MerchantTrns. */
  paymentCreated: 1796,
  /** 1798 — a payment attempt failed. Same payload shape as 1796. */
  transactionFailed: 1798,
  /** 4865 — a payment order changed. EventData carries OrderCode, no transaction. */
  orderUpdated: 4865,
  /** 8448 — money settled into the merchant wallet. Nothing to do with one order. */
  transferCreated: 8448,
} as const;

export type VivaEventName = keyof typeof VIVA_EVENTS;

/**
 * Viva verifies ownership of each URL with a GET that must echo its key back.
 *
 * The same key for every route: it authenticates the merchant account, not the
 * endpoint.
 */
export function vivaVerificationResponse() {
  const key = process.env.VIVA_WEBHOOK_VERIFICATION_KEY;
  if (!key) {
    // 503, not 500. Nothing is wrong with the request; this end is not ready,
    // and Viva's portal reports that rather than a broken endpoint.
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.json({ Key: key });
}

type Body = {
  EventTypeId?: number;
  EventData?: {
    TransactionId?: string;
    MerchantTrns?: string;
    OrderCode?: number | string;
    TransferId?: string;
    Amount?: number;
  };
};

export async function handleVivaEvent(request: NextRequest, event: VivaEventName) {
  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // Logged, not enforced. Refusing an event because it arrived on a sibling
  // path would drop a real payment over a portal misconfiguration, and each
  // branch below decides from what it can verify, not from the path.
  if (payload.EventTypeId && payload.EventTypeId !== VIVA_EVENTS[event]) {
    console.warn(
      `[viva] ${event} route received event ${payload.EventTypeId}; handling as ${event}`,
    );
  }

  if (event === "transferCreated") return handleTransfer(payload);
  if (event === "orderUpdated") return handleOrderUpdated(payload);
  return handleTransaction(payload, event);
}

/**
 * 8448 — a settlement into the merchant wallet.
 *
 * There is deliberately nothing to update. The payload is wallet-level
 * (TransferId, TargetWalletId, amounts) and carries no order reference at all,
 * so any attempt to attribute it to a customer order would be a guess. It is
 * acknowledged and logged so the money movement is visible in the server log
 * next to the payments that caused it; matching a settlement to its orders is
 * an accounting job, done from Viva's own reporting.
 */
function handleTransfer(payload: Body) {
  console.log(
    `[viva] transfer ${payload.EventData?.TransferId ?? "—"} amount ${payload.EventData?.Amount ?? "—"}`,
  );
  return NextResponse.json({ ok: true, noted: "transfer" });
}

/**
 * 4865 — a payment order changed.
 *
 * Recorded, not acted on. The event carries an OrderCode and no transaction, so
 * there is nothing here that can be verified against Viva the way a payment is,
 * and a payment status changed on the strength of an unauthenticated POST is
 * exactly what the read-back rule exists to prevent. What it does give is a
 * timeline entry: it is how a bank-transfer code that expired, or an order
 * amended in Viva's portal, becomes visible on the order rather than being
 * discovered by a customer.
 *
 * Payment itself always arrives as 1796 on its own route.
 */
async function handleOrderUpdated(payload: Body) {
  const code = payload.EventData?.OrderCode;
  if (code == null) return NextResponse.json({ ok: true, ignored: "no_order_code" });

  const order = await prisma.order.findUnique({
    where: { vivaOrderCode: String(code) },
    select: { id: true, orderNumber: true },
  });
  if (!order) return NextResponse.json({ ok: true, ignored: "unknown_order" });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      history: {
        create: {
          status: "PENDING_PAYMENT",
          actor: "viva-webhook",
          note: `Viva order ${code} updated`,
        },
      },
    },
  });
  return NextResponse.json({ ok: true, noted: "order_updated" });
}

/** 1796 and 1798 — both carry a transaction, and both are decided by reading it back. */
async function handleTransaction(payload: Body, event: VivaEventName) {
  const transactionId = payload.EventData?.TransactionId;
  if (!transactionId) {
    // Acknowledge anything we cannot act on: retrying it forever helps nobody.
    return NextResponse.json({ ok: true, ignored: "no_transaction_id" });
  }

  let transaction;
  try {
    transaction = await getTransaction(transactionId);
  } catch (error) {
    // 500 so Viva retries. A transient outage must not lose a payment.
    console.error(`[viva] ${event}: could not verify ${transactionId}`, error);
    return NextResponse.json({ error: "verification_failed" }, { status: 500 });
  }

  const orderNumber = transaction.merchantTrns ?? payload.EventData?.MerchantTrns;
  if (!orderNumber) return NextResponse.json({ ok: true, ignored: "no_order_reference" });

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, paymentStatus: true, totalGross: true },
  });
  if (!order) return NextResponse.json({ ok: true, ignored: "unknown_order" });

  // Idempotent: Viva retries, and a second delivery must not double-confirm.
  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ ok: true, ignored: "already_paid" });
  }

  const paid = transaction.statusId === VIVA_STATUS_PAID;

  if (paid) {
    // Guard against a captured amount that does not match what was ordered.
    const expectedCents = Math.round(Number(order.totalGross) * 100);
    const capturedCents = Math.round(transaction.amount * 100);
    if (capturedCents !== expectedCents) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          history: {
            create: {
              status: "PENDING_PAYMENT",
              actor: "viva-webhook",
              note: `Amount mismatch: captured ${capturedCents}, expected ${expectedCents}`,
            },
          },
        },
      });
      return NextResponse.json({ ok: true, flagged: "amount_mismatch" });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "CONFIRMED",
        paymentStatus: "PAID",
        paidAt: new Date(),
        vivaTransactionId: transactionId,
        /*
         * What Viva says was used, not what was chosen here.
         *
         * The shopper picks again inside Viva's page — IRIS, instalments,
         * another card — and the ERP needs a different payment code for each.
         * Recorded raw and logged, so the first payment through each method
         * teaches us its number instead of a guess hardening into a mapping.
         */
        vivaPaymentMethodId: transaction.paymentMethodId,
        history: {
          create: { status: "CONFIRMED", actor: "viva-webhook", note: "Payment captured" },
        },
      },
    });
    console.log(
      `[viva] ${orderNumber} paid · chosen at checkout, Viva paymentMethodId=${transaction.paymentMethodId ?? "—"}`,
    );

    /*
     * The receipt goes out from HERE, not from the return URL.
     *
     * The browser coming back proves only that a browser came back; this runs
     * after the transaction has been read from Viva's API. And it is awaited
     * but never allowed to fail the response: the money has moved, and telling
     * Viva the webhook failed — which makes it retry — because a mail server
     * was slow would turn a sent receipt into a duplicate one.
     */
    const mail = await sendOrderEmail(orderNumber);
    if (!mail.ok) console.error(`[viva] ${orderNumber} receipt not sent: ${mail.error}`);

    /*
     * And tell HDCtool, if the order ever got there.
     *
     * The copy in HDCtool was written at checkout, when this order was
     * PENDING with no `paidAt` — a bank transfer lands hours later, and
     * nothing was updating it. Anybody reconciling from that screen was
     * reading a snapshot taken before the customer paid.
     *
     * Same rule as the receipt: awaited, logged, never allowed to fail the
     * response. Reporting a failed webhook to Viva makes it retry, and the
     * money has already moved.
     */
    const synced = await syncPaymentToErp(orderNumber);
    if (!synced.ok) console.error(`[viva] ${orderNumber} payment not synced to HDCtool: ${synced.error}`);

    return NextResponse.json({ ok: true, paid: true });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "FAILED",
      paymentStatus: "FAILED",
      vivaTransactionId: transactionId,
      history: {
        create: {
          status: "FAILED",
          actor: "viva-webhook",
          note: `Viva status ${transaction.statusId}`,
        },
      },
    },
  });
  return NextResponse.json({ ok: true, paid: false });
}
