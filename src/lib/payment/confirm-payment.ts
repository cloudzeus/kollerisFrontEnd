import "server-only";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/generated/prisma/enums";
import {
  VIVA_ORDER_STATE,
  VIVA_STATUS_PAID,
  getPaymentOrder,
  getTransaction,
  isVivaBasicConfigured,
  listOrderTransactions,
  type VivaOrderTransaction,
  type VivaTransaction,
} from "@/lib/payment/viva";
import { sendOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";
import { sendOrderToErp, syncPaymentToErp, type SendToErpResult } from "@/lib/orders/send-to-erp";

/**
 * The one way an order becomes PAID.
 *
 * There are three doors into it — the Viva webhook, the admin's «Επανέλεγχος
 * πληρωμής» (which asks Viva directly), and the admin's manual «Καταχώριση
 * πληρωμής» for a deposit made straight to the IBAN — and they must not drift
 * apart. Before this file the paid path lived inside the webhook handler, so a
 * payment Viva never told us about had no way to reach HDCtool at all:
 * `sendOrderToErp` refuses a non-PAID order, correctly, and nothing else could
 * make the order PAID.
 *
 * Two rules carried over from the webhook unchanged:
 *   - the amount must match the order to the cent, or nothing is marked paid;
 *   - after the write, receipt → internal email → HDCtool payment sync →
 *     SoftOne document, each awaited, logged, and never allowed to undo the
 *     payment. The money has moved; a slow mail server does not change that.
 */

export type FollowUpResult = { ok: true } | { ok: false; error: string };

export type FollowUps = {
  receipt: FollowUpResult;
  internal: FollowUpResult;
  erpSync: FollowUpResult;
  erpDocument: SendToErpResult;
};

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/**
 * Everything that happens after an order becomes PAID, in the order the webhook
 * has always done it. Never throws: each step's failure is logged and returned.
 */
export async function afterPaymentConfirmed(
  orderNumber: string,
  logPrefix = "[viva]",
): Promise<FollowUps> {
  /*
   * The receipt goes out from HERE, not from the return URL: this runs after
   * the payment has been established, and a browser coming back proves only
   * that a browser came back.
   */
  const receipt: FollowUpResult = await sendOrderEmail(orderNumber)
    .then((r): FollowUpResult => (r.ok ? { ok: true } : { ok: false, error: r.error }))
    .catch(failure);
  if (!receipt.ok) console.error(`${logPrefix} ${orderNumber} receipt not sent: ${receipt.error}`);

  /* Και στο κατάστημα. Ίδιος κανόνας με την απόδειξη. */
  const internal: FollowUpResult = await sendInternalOrderEmail(orderNumber)
    .then((r): FollowUpResult => (r.ok ? { ok: true } : { ok: false, error: r.error }))
    .catch(failure);
  if (!internal.ok) {
    console.error(`${logPrefix} ${orderNumber} internal email not sent: ${internal.error}`);
  }

  /*
   * Tell HDCtool, if the order ever got there: its copy was written while the
   * order was unpaid and nothing else would update it.
   */
  const erpSync: FollowUpResult = await syncPaymentToErp(orderNumber).catch(failure);
  if (!erpSync.ok) {
    console.error(`${logPrefix} ${orderNumber} payment not synced to HDCtool: ${erpSync.error}`);
  }

  /*
   * Και το παραστατικό, εδώ: αυτή είναι η στιγμή που τα χρήματα κινήθηκαν.
   * Ό,τι δεν περάσει το πιάνει η σάρωση ή το «Αποστολή στο SoftOne».
   */
  const erpDocument: SendToErpResult = await sendOrderToErp(orderNumber).catch(
    (error): SendToErpResult => ({ stage: "push", ...failure(error) }),
  );
  if (erpDocument.ok) {
    console.log(
      `${logPrefix} ${orderNumber} → SoftOne ${erpDocument.fincode ?? erpDocument.findoc ?? "—"}${
        erpDocument.alreadySent ? " (υπήρχε ήδη)" : ""
      }`,
    );
  } else {
    console.error(
      `${logPrefix} ${orderNumber} document not issued (${erpDocument.stage}): ${erpDocument.error}`,
    );
  }

  return { receipt, internal, erpSync, erpDocument };
}

/** Statuses an incoming payment may not move backwards from. */
const KEEP_STATUS: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["SHIPPED", "DELIVERED"]);

type PayableOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  totalGross: unknown;
};

export type MarkPaidInput = {
  order: PayableOrder;
  /** What arrived, in euros. Compared with `totalGross` to the cent. */
  amount: number;
  paidAt: Date;
  actor: string;
  note: string;
  vivaTransactionId?: string | null;
  vivaPaymentMethodId?: number | null;
};

export type MarkPaidResult =
  | { kind: "paid" }
  | { kind: "already_paid" }
  | { kind: "amount_mismatch"; capturedCents: number; expectedCents: number };

export function toCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/**
 * Amount check, then a conditional write.
 *
 * `updateMany … where paymentStatus != PAID` rather than read-then-update: two
 * doors opened at once — a webhook retry and an admin click — must produce one
 * confirmation, one history row and one set of follow-ups, not two.
 */
export async function markOrderPaid(input: MarkPaidInput): Promise<MarkPaidResult> {
  const { order } = input;
  if (order.paymentStatus === "PAID") return { kind: "already_paid" };

  const expectedCents = toCents(Number(order.totalGross));
  const capturedCents = toCents(input.amount);
  if (capturedCents !== expectedCents) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        history: {
          create: {
            status: "PENDING_PAYMENT",
            actor: input.actor.slice(0, 64),
            note: `Amount mismatch: captured ${capturedCents}, expected ${expectedCents}`,
          },
        },
      },
    });
    return { kind: "amount_mismatch", capturedCents, expectedCents };
  }

  const nextStatus: OrderStatus = KEEP_STATUS.has(order.status) ? order.status : "CONFIRMED";

  const written = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: { not: "PAID" } },
      data: {
        status: nextStatus,
        paymentStatus: "PAID",
        paidAt: input.paidAt,
        ...(input.vivaTransactionId ? { vivaTransactionId: input.vivaTransactionId } : {}),
        /*
         * What Viva says was used, not what was chosen here — the ERP needs a
         * different payment code per method. See `viva-payment-method.ts`.
         */
        ...(input.vivaPaymentMethodId !== undefined
          ? { vivaPaymentMethodId: input.vivaPaymentMethodId }
          : {}),
      },
    });
    if (count === 0) return false;
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: nextStatus,
        actor: input.actor.slice(0, 64),
        note: input.note,
      },
    });
    return true;
  });

  return written ? { kind: "paid" } : { kind: "already_paid" };
}

/**
 * Apply a Viva transaction that has been read back from Viva's API.
 *
 * Used by the webhook (1796) and by the recheck. The caller has already
 * decided the transaction is a successful payment (`statusId === "F"`).
 */
export async function applyVivaPayment(
  order: PayableOrder,
  transactionId: string,
  transaction: Pick<VivaTransaction, "amount" | "paymentMethodId" | "transactionTypeId">,
  opts: { actor: string; note: string; paidAt?: Date },
): Promise<MarkPaidResult> {
  const result = await markOrderPaid({
    order,
    amount: transaction.amount,
    paidAt: opts.paidAt ?? new Date(),
    actor: opts.actor,
    note: opts.note,
    vivaTransactionId: transactionId,
    vivaPaymentMethodId: transaction.paymentMethodId,
  });
  if (result.kind === "paid") {
    console.log(
      `[viva] ${order.orderNumber} paid · Viva paymentMethodId=${transaction.paymentMethodId ?? "—"}` +
        ` transactionTypeId=${transaction.transactionTypeId ?? "—"}`,
    );
  }
  return result;
}

/* ── Recheck: ask Viva about one payment order ───────────────────────────── */

export type RecheckOutcome =
  | { kind: "paid"; transactionId: string; followUps: FollowUps }
  | { kind: "already_paid" }
  | { kind: "amount_mismatch"; transactionId: string; capturedCents: number; expectedCents: number }
  | { kind: "not_paid"; stateId: number | null; attempts: number }
  | { kind: "no_order_code" }
  | { kind: "not_configured" }
  | { kind: "not_found" }
  | { kind: "error"; error: string };

/**
 * Viva's InsDate is Athens local time WITH an offset. Parsed only when it has
 * one, so a naive timestamp is never read as UTC by accident.
 */
function parseInsDate(value: string | null): Date | null {
  if (!value || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reads the order's payment order code back from Viva and, when Viva holds a
 * successful payment for it, runs the same paid path the webhook runs.
 *
 * Decided by the TRANSACTIONS, not by the order's StateId: Viva documents that
 * an e-banking (ΔΙΑΣ) payment may land after the payment order has expired, so
 * an expired order with a finished payment is still a paid order.
 */
export async function recheckVivaPayment(
  orderNumber: string,
  actor: string,
): Promise<RecheckOutcome> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalGross: true,
      vivaOrderCode: true,
    },
  });
  if (!order) return { kind: "not_found" };
  if (order.paymentStatus === "PAID") return { kind: "already_paid" };
  if (!order.vivaOrderCode) return { kind: "no_order_code" };
  if (!isVivaBasicConfigured()) return { kind: "not_configured" };

  const code = order.vivaOrderCode;
  let stateId: number | null = null;
  // The transactions decide; the order's state only words the answer, so a
  // failed state lookup is logged and tolerated, a failed transaction lookup is not.
  const [info, list] = await Promise.allSettled([getPaymentOrder(code), listOrderTransactions(code)]);
  if (info.status === "fulfilled") stateId = info.value.stateId;
  else console.warn(`[viva-recheck] ${orderNumber}: order state lookup failed`, info.reason);
  if (list.status === "rejected") {
    const error = list.reason;
    return { kind: "error", error: error instanceof Error ? error.message : String(error) };
  }
  const transactions: VivaOrderTransaction[] = list.value;

  // A payment for THIS order: finished, positive (Viva documents reversals as
  // always negative), and — when Viva says which — carrying this order code.
  const paid = transactions.find(
    (t) =>
      t.statusId === VIVA_STATUS_PAID &&
      t.amount > 0 &&
      (t.orderCode == null || t.orderCode === code),
  );

  if (!paid) {
    return { kind: "not_paid", stateId, attempts: transactions.length };
  }

  /*
   * Read the chosen transaction through the same endpoint the webhook uses, so
   * the amount and the payment method come from the same place in both paths.
   * Fall back to the listed figures only if that call fails.
   */
  let verified: Pick<VivaTransaction, "statusId" | "amount" | "paymentMethodId" | "transactionTypeId">;
  try {
    verified = await getTransaction(paid.transactionId);
  } catch (error) {
    console.warn(`[viva-recheck] ${orderNumber}: getTransaction failed, using listed data`, error);
    verified = {
      statusId: paid.statusId,
      amount: paid.amount,
      paymentMethodId: null,
      transactionTypeId: paid.transactionTypeId,
    };
  }
  if (verified.statusId !== VIVA_STATUS_PAID) {
    return { kind: "not_paid", stateId, attempts: transactions.length };
  }

  const result = await applyVivaPayment(order, paid.transactionId, verified, {
    actor,
    note: `Επανέλεγχος Viva: η πληρωμή επιβεβαιώθηκε (συναλλαγή ${paid.transactionId}` +
      `${stateId === VIVA_ORDER_STATE.expired ? ", μετά τη λήξη του κωδικού" : ""})`,
    paidAt: parseInsDate(paid.insDate) ?? new Date(),
  });

  if (result.kind === "already_paid") return { kind: "already_paid" };
  if (result.kind === "amount_mismatch") {
    return {
      kind: "amount_mismatch",
      transactionId: paid.transactionId,
      capturedCents: result.capturedCents,
      expectedCents: result.expectedCents,
    };
  }

  const followUps = await afterPaymentConfirmed(order.orderNumber, "[viva-recheck]");
  return { kind: "paid", transactionId: paid.transactionId, followUps };
}
