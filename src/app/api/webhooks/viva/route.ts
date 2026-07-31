import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIVA_STATUS_PAID, getTransaction } from "@/lib/payment/viva";

/**
 * Viva Wallet webhook.
 *
 * Viva verifies ownership of this endpoint with a GET that must echo back the
 * verification key, then POSTs transaction events to it.
 *
 * The POST body is treated as a NOTIFICATION, never as evidence: anything
 * arriving over HTTP can be forged, so the transaction is read back from Viva's
 * API before an order is marked paid. The body tells us *which* transaction to
 * check, nothing more.
 */

export async function GET() {
  const key = process.env.VIVA_WEBHOOK_VERIFICATION_KEY;
  if (!key) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.json({ Key: key });
}

export async function POST(request: NextRequest) {
  let payload: {
    EventTypeId?: number;
    EventData?: { TransactionId?: string; MerchantTrns?: string; StatusId?: string };
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const transactionId = payload.EventData?.TransactionId;
  if (!transactionId) {
    // Ack anything we cannot act on: retrying it forever helps nobody.
    return NextResponse.json({ ok: true, ignored: "no_transaction_id" });
  }

  let transaction;
  try {
    transaction = await getTransaction(transactionId);
  } catch (error) {
    // 500 so Viva retries — a transient outage must not lose a payment.
    console.error("[viva-webhook] verification failed", error);
    return NextResponse.json({ error: "verification_failed" }, { status: 500 });
  }

  const orderNumber = transaction.merchantTrns ?? payload.EventData?.MerchantTrns;
  if (!orderNumber) {
    return NextResponse.json({ ok: true, ignored: "no_order_reference" });
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, paymentStatus: true, totalGross: true },
  });
  if (!order) {
    return NextResponse.json({ ok: true, ignored: "unknown_order" });
  }

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
        history: {
          create: { status: "CONFIRMED", actor: "viva-webhook", note: "Payment captured" },
        },
      },
    });
  } else {
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
  }

  return NextResponse.json({ ok: true });
}
