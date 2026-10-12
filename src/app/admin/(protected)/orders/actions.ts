"use server";

import { revalidatePath } from "next/cache";
import { sendOrderToErp, type SendToErpResult } from "@/lib/orders/send-to-erp";
import { createVoucherForOrder, type VoucherResult } from "@/lib/courier/create-for-order";
import { sendOrderEmail } from "@/lib/mail/order-email";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import {
  applyPostageCorrection,
  previewPostageCorrection,
  type ApplyResult,
  type PreviewResult,
} from "@/lib/orders/postage-correction";
import { recheckVivaPayment } from "@/lib/payment/confirm-payment";
import { recordManualPayment, type ManualPaymentInput } from "@/lib/payment/manual-payment";
import {
  describeFollowUps,
  describeRecheck,
  describeSweep,
  type PaymentActionResult,
  type SweepSummary,
} from "@/lib/payment/payment-messages";
import { sweepPendingPayments } from "@/lib/payment/payment-sweep";

/**
 * The action behind "Αποστολή στο SoftOne", which until now had none.
 *
 * Thin on purpose: the decision about what may be sent, and the record of what
 * happened, both belong to `sendOrderToErp`. This exists to give the admin
 * table something it can call and to refresh the rows afterwards, so the ERP
 * column stops saying "δεν έχει σταλεί" the moment it stops being true.
 */
export async function pushOrderToErp(orderNumber: string): Promise<SendToErpResult> {
  await requireOrders();
  const result = await sendOrderToErp(orderNumber);

  // Refreshed on failure too: `erpError` is now on the order and the row shows
  // it, which is the difference between a lost click and a legible problem.
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  return result;
}

/**
 * Issue the ACS voucher for one order.
 *
 * Lives beside the ERP push because they are the two things an order needs
 * after it is paid, and both were missing their wire. The dispatch board at
 * `/admin/courier` reads what this produces.
 */
export async function createOrderVoucher(orderNumber: string): Promise<VoucherResult> {
  await requireOrders();
  const result = await createVoucherForOrder(orderNumber);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/courier");
  revalidatePath("/admin");
  return result;
}

/**
 * Send the order email again, from the server.
 *
 * The row already had an envelope icon and it was a `mailto:` — it opened the
 * operator's own mail client with an empty message, which is not resending
 * anything. This sends the same email the customer got at checkout, from the
 * same template, with the bank details and the reference on it if they are
 * still owed.
 *
 * Useful precisely when it matters: an address typo corrected in the ERP, a
 * customer who deleted it, a bank transfer whose details never arrived because
 * Mailgun was not configured yet.
 */
export async function resendOrderEmail(
  orderNumber: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOrders();
  const result = await sendOrderEmail(orderNumber);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Re-price the postage of an unpaid order, and optionally apologise.
 *
 * Every action in this file checks the role: a server action is a public
 * POST endpoint, and hiding the button is not authorisation.
 */
async function requireOrders() {
  const session = await auth();
  assertCan(session?.user.role, "orders");
  return { id: session!.user.id, email: session!.user.email ?? "unknown" };
}

export async function previewOrderPostage(orderNumber: string): Promise<PreviewResult> {
  await requireOrders();
  return previewPostageCorrection(orderNumber);
}

export async function applyOrderPostage(
  orderNumber: string,
  options: { notify: boolean; message?: string },
): Promise<ApplyResult> {
  const actor = await requireOrders();
  const result = await applyPostageCorrection(orderNumber, actor, options);
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return result;
}

/** Who the history row names. The column is 64 characters. */
function adminActor(actor: { email: string }): string {
  return `admin:${actor.email}`.slice(0, 64);
}

function refreshOrder(orderNumber: string) {
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

/**
 * «Καταχώριση πληρωμής» — record a deposit Viva cannot know about.
 *
 * The rules (exact amount, date window, explicit confirmation, idempotence)
 * live in `recordManualPayment`; this checks the role, names the admin, and
 * turns the follow-ups into something the dialog can show.
 */
export async function recordOrderPayment(
  orderNumber: string,
  input: ManualPaymentInput,
): Promise<PaymentActionResult> {
  const actor = await requireOrders();
  const result = await recordManualPayment(orderNumber, input, adminActor(actor));
  if (!result.ok) return { ok: false, error: result.error };
  if (result.alreadyPaid) {
    refreshOrder(orderNumber);
    return { ok: true, message: "Η παραγγελία είναι ήδη πληρωμένη — δεν έγινε καμία αλλαγή.", warnings: [] };
  }
  refreshOrder(orderNumber);
  return describeFollowUps("Η πληρωμή καταχωρίστηκε", result.followUps);
}

/**
 * «Επανέλεγχος πληρωμής» — ask Viva about the order's payment code and, if a
 * finished payment exists, run the same path the webhook would have.
 */
export async function recheckOrderPayment(orderNumber: string): Promise<PaymentActionResult> {
  const actor = await requireOrders();
  const outcome = await recheckVivaPayment(orderNumber, adminActor(actor));
  if (outcome.kind === "paid" || outcome.kind === "amount_mismatch" || outcome.kind === "already_paid") {
    refreshOrder(orderNumber);
  }
  return describeRecheck(outcome);
}

/**
 * «Έλεγχος εκκρεμών πληρωμών» — the payment sweep, now, from the list.
 *
 * The same run the in-process schedule makes every ~15 minutes, so it shares
 * its lock: pressed while a replica is sweeping, it says so instead of asking
 * Viva everything twice. Budget under the server-action timeout.
 */
export async function sweepOrderPayments(): Promise<SweepSummary> {
  const actor = await requireOrders();
  const result = await sweepPendingPayments({ actor: adminActor(actor), budgetMs: 40_000 });
  if (result.ok && (result.paid.length > 0 || result.mismatches.length > 0)) {
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
  }
  return describeSweep(result);
}
