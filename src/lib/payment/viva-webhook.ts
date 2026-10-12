import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIVA_STATUS_PAID, getTransaction, isVivaBasicConfigured } from "@/lib/payment/viva";
import { sendPaymentFailedEmail } from "@/lib/mail/payment-failed-email";
import {
  afterPaymentConfirmed,
  applyVivaPayment,
  recheckVivaPayment,
} from "@/lib/payment/confirm-payment";

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
 * Viva documents this event as the cancellation notice (Smart Checkout's back
 * button, or a cancel via API; `IsCancelled` in the body). It carries an
 * OrderCode and no transaction, so the body itself proves nothing and changes
 * nothing — a payment status set on the strength of an unauthenticated POST is
 * exactly what the read-back rule exists to prevent.
 *
 * What it IS used for: a timeline entry, as before, and a prompt to ask Viva.
 * When the Merchant ID / API Key are configured, the order code is read back
 * through the same recheck the admin button runs, and if Viva holds a finished
 * payment for it the order goes through the normal paid path. That is a
 * second chance for a payment whose 1796 never arrived — an e-banking (ΔΙΑΣ)
 * deposit made against the Viva code lands asynchronously, possibly after the
 * code expired. Any failure in that read-back is logged and acknowledged: this
 * event is not the payment signal, and retrying it forever helps nobody.
 */
async function handleOrderUpdated(payload: Body) {
  const code = payload.EventData?.OrderCode;
  if (code == null) return NextResponse.json({ ok: true, ignored: "no_order_code" });

  const order = await prisma.order.findUnique({
    where: { vivaOrderCode: String(code) },
    select: { id: true, orderNumber: true, paymentStatus: true },
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

  if (order.paymentStatus !== "PAID" && isVivaBasicConfigured()) {
    try {
      const outcome = await recheckVivaPayment(order.orderNumber, "viva-webhook");
      if (outcome.kind === "paid") {
        return NextResponse.json({ ok: true, noted: "order_updated", paid: true });
      }
      if (outcome.kind === "error") {
        console.error(`[viva] 4865 ${order.orderNumber}: read-back failed: ${outcome.error}`);
      }
    } catch (error) {
      console.error(`[viva] 4865 ${order.orderNumber}: read-back failed`, error);
    }
  }
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
  /*
   * Found by our order number first, and by Viva's order code when that fails.
   *
   * The order code comes from the transaction as Viva's API returned it, not
   * from the body, so it is as trustworthy as the amount. A payment that does
   * not echo `merchantTrns` back — an e-banking (ΔΙΑΣ) deposit made against the
   * Viva code is the likely case — used to be acknowledged as
   * "no_order_reference" and silently dropped, leaving a paid order at
   * «Εκκρεμεί» with nothing in the log.
   */
  const select = {
    id: true,
    orderNumber: true,
    status: true,
    paymentStatus: true,
    totalGross: true,
  } as const;
  let order = orderNumber
    ? await prisma.order.findUnique({ where: { orderNumber }, select })
    : null;
  if (!order && transaction.orderCode != null) {
    order = await prisma.order.findUnique({
      where: { vivaOrderCode: String(transaction.orderCode) },
      select,
    });
  }
  if (!order) {
    console.warn(
      `[viva] ${event}: transaction ${transactionId} matches no order ` +
        `(merchantTrns=${orderNumber ?? "—"}, orderCode=${transaction.orderCode ?? "—"})`,
    );
    return NextResponse.json({
      ok: true,
      ignored: orderNumber || transaction.orderCode != null ? "unknown_order" : "no_order_reference",
    });
  }

  // Idempotent: Viva retries, and a second delivery must not double-confirm.
  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ ok: true, ignored: "already_paid" });
  }

  const paid = transaction.statusId === VIVA_STATUS_PAID;

  if (paid) {
    /*
     * Amount check, conditional write, history row — shared with the admin's
     * recheck so the two cannot drift. See `confirm-payment.ts`.
     */
    const result = await applyVivaPayment(order, transactionId, transaction, {
      actor: "viva-webhook",
      note: "Payment captured",
    });
    if (result.kind === "amount_mismatch") {
      return NextResponse.json({ ok: true, flagged: "amount_mismatch" });
    }
    if (result.kind === "already_paid") {
      return NextResponse.json({ ok: true, ignored: "already_paid" });
    }

    /*
     * Receipt, internal email, HDCtool payment sync, SoftOne document — awaited
     * but never allowed to fail the response: the money has moved, and telling
     * Viva the webhook failed makes it retry, which would turn a sent receipt
     * into a duplicate one. Ό,τι δεν περάσει το πιάνει η σάρωση.
     */
    await afterPaymentConfirmed(order.orderNumber, "[viva]");

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
  /*
   * Και το λέμε στον πελάτη.
   * ───────────────────────────────────────────────────────────────────────────
   * Η παραγγελία έμενε σε FAILED και κανείς δεν ειδοποιούνταν: όποιος έκλεινε
   * την καρτέλα της Viva νομίζοντας ότι η πληρωμή πέρασε, το μάθαινε όταν δεν
   * ερχόταν το δέμα.
   *
   * Ίδιος κανόνας με την απόδειξη: αναμένεται, καταγράφεται, ποτέ δεν ρίχνει
   * την απάντηση. Μια αποτυχία email που γίνεται αποτυχία webhook κάνει τη
   * Viva να ξαναστείλει το ίδιο γεγονός, και ο πελάτης παίρνει το μήνυμα δύο
   * φορές.
   */
  const failedMail = await sendPaymentFailedEmail(order.orderNumber, {
    statusId: transaction.statusId == null ? null : String(transaction.statusId),
  });
  if (!failedMail.ok) {
    console.error(`[viva] ${order.orderNumber} failure notice not sent: ${failedMail.error}`);
  }

  return NextResponse.json({ ok: true, paid: false });
}
