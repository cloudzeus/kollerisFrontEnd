import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/prisma", async () => (await import("./payment-fakes")).mockModules.prisma());
vi.mock("@/lib/payment/viva", async () => (await import("./payment-fakes")).mockModules.viva());
vi.mock("@/lib/mail/order-email", async () => (await import("./payment-fakes")).mockModules.orderEmail());
vi.mock("@/lib/mail/order-internal-email", async () =>
  (await import("./payment-fakes")).mockModules.internalEmail(),
);
vi.mock("@/lib/mail/payment-failed-email", async () =>
  (await import("./payment-fakes")).mockModules.failedEmail(),
);
vi.mock("@/lib/orders/send-to-erp", async () => (await import("./payment-fakes")).mockModules.sendToErp());

import { calls, followUpMocks, resetFakes, seedOrder, state, vivaMocks } from "./payment-fakes";
import { handleVivaEvent } from "@/lib/payment/viva-webhook";

function post(body: unknown): NextRequest {
  return new Request("https://kolleris.test/api/webhooks/viva", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

const paidTx = (over: Record<string, unknown> = {}) => ({
  statusId: "F",
  amount: 123.45,
  merchantTrns: "KOL-20261004-0001",
  orderCode: 4727456577872605,
  paymentMethodId: 0,
  transactionTypeId: 5,
  ...over,
});

beforeEach(() => {
  resetFakes();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Viva 1796 — payment created (behaviour kept from before the refactor)", () => {
  it("marks a matching order paid, records the transaction, and runs every follow-up in order", async () => {
    seedOrder({ status: "PENDING_PAYMENT", paymentMethod: "card" });
    vivaMocks.getTransaction.mockResolvedValue(paidTx());

    const res = await handleVivaEvent(post({ EventTypeId: 1796, EventData: { TransactionId: "tx-1" } }), "paymentCreated");

    expect(await res.json()).toEqual({ ok: true, paid: true });
    expect(vivaMocks.getTransaction).toHaveBeenCalledWith("tx-1");
    expect(state.order).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      vivaTransactionId: "tx-1",
      vivaPaymentMethodId: 0,
    });
    expect(state.order!.paidAt).toBeInstanceOf(Date);
    expect(state.history).toEqual([{ status: "CONFIRMED", actor: "viva-webhook", note: "Payment captured" }]);
    expect(calls).toEqual([
      "receipt:KOL-20261004-0001",
      "internal:KOL-20261004-0001",
      "sync:KOL-20261004-0001",
      "erp:KOL-20261004-0001",
    ]);
  });

  it("is idempotent: a second delivery for a paid order changes nothing", async () => {
    seedOrder({ paymentStatus: "PAID" });
    vivaMocks.getTransaction.mockResolvedValue(paidTx());
    const res = await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    expect(await res.json()).toEqual({ ok: true, ignored: "already_paid" });
    expect(state.history).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("flags an amount mismatch without marking the order paid", async () => {
    seedOrder();
    vivaMocks.getTransaction.mockResolvedValue(paidTx({ amount: 120 }));
    const res = await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    expect(await res.json()).toEqual({ ok: true, flagged: "amount_mismatch" });
    expect(state.order!.paymentStatus).toBe("PENDING");
    expect(state.history).toEqual([
      { status: "PENDING_PAYMENT", actor: "viva-webhook", note: "Amount mismatch: captured 12000, expected 12345" },
    ]);
    expect(calls).toEqual([]);
  });

  it("writes the same mismatch only once, however often it is reported", async () => {
    seedOrder();
    vivaMocks.getTransaction.mockResolvedValue(paidTx({ amount: 120 }));
    await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    expect(state.history).toHaveLength(1);
  });

  it("answers 500 when the transaction cannot be read back, so Viva retries", async () => {
    seedOrder();
    vivaMocks.getTransaction.mockRejectedValue(new Error("down"));
    const res = await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    expect(res.status).toBe(500);
    expect(state.order!.paymentStatus).toBe("PENDING");
  });

  it("acknowledges a body with no transaction id", async () => {
    const res = await handleVivaEvent(post({ EventData: {} }), "paymentCreated");
    expect(await res.json()).toEqual({ ok: true, ignored: "no_transaction_id" });
  });

  it("acknowledges a transaction with no order reference at all", async () => {
    seedOrder();
    vivaMocks.getTransaction.mockResolvedValue(paidTx({ merchantTrns: null, orderCode: null }));
    const res = await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    expect(await res.json()).toEqual({ ok: true, ignored: "no_order_reference" });
    expect(state.order!.paymentStatus).toBe("PENDING");
  });

  it("a non-F transaction marks the order FAILED and tells the customer", async () => {
    seedOrder({ status: "PENDING_PAYMENT", paymentMethod: "card" });
    vivaMocks.getTransaction.mockResolvedValue(paidTx({ statusId: "E" }));
    const res = await handleVivaEvent(post({ EventData: { TransactionId: "tx-2" } }), "transactionFailed");
    expect(await res.json()).toEqual({ ok: true, paid: false });
    expect(state.order).toMatchObject({ status: "FAILED", paymentStatus: "FAILED", vivaTransactionId: "tx-2" });
    expect(followUpMocks.sendPaymentFailedEmail).toHaveBeenCalledWith("KOL-20261004-0001", { statusId: "E" });
  });

  it("a failed follow-up never fails the webhook or undoes the payment", async () => {
    seedOrder();
    vivaMocks.getTransaction.mockResolvedValue(paidTx());
    followUpMocks.sendOrderToErp.mockRejectedValueOnce(new Error("HDCtool down"));
    followUpMocks.sendOrderEmail.mockResolvedValueOnce({ ok: false, error: "mailgun" });
    const res = await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    expect(res.status).toBe(200);
    expect(state.order!.paymentStatus).toBe("PAID");
  });

  it("does not move a shipped order back to CONFIRMED", async () => {
    seedOrder({ status: "SHIPPED" });
    vivaMocks.getTransaction.mockResolvedValue(paidTx());
    await handleVivaEvent(post({ EventData: { TransactionId: "tx-1" } }), "paymentCreated");
    expect(state.order).toMatchObject({ status: "SHIPPED", paymentStatus: "PAID" });
  });
});

describe("Viva 1796 — a payment that does not echo our order number (e-banking deposit)", () => {
  it("finds the order by Viva's order code read back from the API", async () => {
    seedOrder();
    vivaMocks.getTransaction.mockResolvedValue(
      paidTx({ merchantTrns: null, orderCode: 4727456577872605, transactionTypeId: 15 }),
    );
    const res = await handleVivaEvent(post({ EventData: { TransactionId: "tx-dias" } }), "paymentCreated");
    expect(await res.json()).toEqual({ ok: true, paid: true });
    expect(state.order).toMatchObject({ paymentStatus: "PAID", vivaTransactionId: "tx-dias" });
  });

  it("ignores the body's order code — only the read-back one counts", async () => {
    seedOrder();
    vivaMocks.getTransaction.mockResolvedValue(paidTx({ merchantTrns: null, orderCode: 999 }));
    const res = await handleVivaEvent(
      post({ EventData: { TransactionId: "tx-x", OrderCode: 4727456577872605 } }),
      "paymentCreated",
    );
    expect(await res.json()).toEqual({ ok: true, ignored: "unknown_order" });
    expect(state.order!.paymentStatus).toBe("PENDING");
  });
});

describe("Viva 4865 — order updated", () => {
  const body = { EventTypeId: 4865, EventData: { OrderCode: 4727456577872605, IsCancelled: false } };

  it("records the event and, when Viva holds a finished payment for the code, completes the order", async () => {
    seedOrder();
    vivaMocks.getPaymentOrder.mockResolvedValue({ orderCode: "4727456577872605", stateId: 3 });
    vivaMocks.listOrderTransactions.mockResolvedValue([
      { transactionId: "tx-dias", statusId: "F", amount: 123.45, merchantTrns: null, orderCode: "4727456577872605", transactionTypeId: 15, insDate: "2026-10-06T10:15:00+03:00" },
    ]);
    vivaMocks.getTransaction.mockResolvedValue(paidTx({ merchantTrns: null, transactionTypeId: 15 }));

    const res = await handleVivaEvent(post(body), "orderUpdated");

    expect(await res.json()).toEqual({ ok: true, noted: "order_updated", paid: true });
    expect(state.order).toMatchObject({ paymentStatus: "PAID", vivaTransactionId: "tx-dias" });
    expect(state.order!.paidAt!.toISOString()).toBe("2026-10-06T07:15:00.000Z");
    expect(state.history[0]).toEqual({
      status: "PENDING_PAYMENT",
      actor: "viva-webhook",
      note: "Viva order 4727456577872605 updated",
    });
    expect(state.history[1].actor).toBe("viva-webhook");
    expect(calls).toHaveLength(4);
  });

  it("only records the event when Viva has no finished payment (e.g. a cancellation)", async () => {
    seedOrder();
    vivaMocks.getPaymentOrder.mockResolvedValue({ orderCode: "4727456577872605", stateId: 2 });
    vivaMocks.listOrderTransactions.mockResolvedValue([]);
    const res = await handleVivaEvent(post(body), "orderUpdated");
    expect(await res.json()).toEqual({ ok: true, noted: "order_updated" });
    expect(state.order!.paymentStatus).toBe("PENDING");
    expect(state.history).toHaveLength(1);
  });

  it("does not call Viva when the Merchant ID / API key are not configured", async () => {
    seedOrder();
    vivaMocks.isVivaBasicConfigured.mockReturnValue(false);
    const res = await handleVivaEvent(post(body), "orderUpdated");
    expect(await res.json()).toEqual({ ok: true, noted: "order_updated" });
    expect(vivaMocks.getPaymentOrder).not.toHaveBeenCalled();
  });

  it("acknowledges (200) when the read-back fails", async () => {
    seedOrder();
    vivaMocks.getPaymentOrder.mockRejectedValue(new Error("viva down"));
    vivaMocks.listOrderTransactions.mockRejectedValue(new Error("viva down"));
    const res = await handleVivaEvent(post(body), "orderUpdated");
    expect(res.status).toBe(200);
    expect(state.order!.paymentStatus).toBe("PENDING");
  });

  it("ignores an unknown order code", async () => {
    seedOrder();
    const res = await handleVivaEvent(post({ EventData: { OrderCode: 1 } }), "orderUpdated");
    expect(await res.json()).toEqual({ ok: true, ignored: "unknown_order" });
  });
});
