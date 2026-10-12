import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("./payment-fakes")).mockModules.prisma());
vi.mock("@/lib/payment/viva", async () => (await import("./payment-fakes")).mockModules.viva());
vi.mock("@/lib/mail/order-email", async () => (await import("./payment-fakes")).mockModules.orderEmail());
vi.mock("@/lib/mail/order-internal-email", async () =>
  (await import("./payment-fakes")).mockModules.internalEmail(),
);
vi.mock("@/lib/orders/send-to-erp", async () => (await import("./payment-fakes")).mockModules.sendToErp());

// The server actions: a session, a cache, and nothing else from Next.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string; role: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/courier/create-for-order", () => ({ createVoucherForOrder: vi.fn() }));
const sweepMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payment/payment-sweep", () => ({ sweepPendingPayments: sweepMock }));
vi.mock("@/lib/orders/postage-correction", () => ({
  applyPostageCorrection: vi.fn(),
  previewPostageCorrection: vi.fn(),
}));

import { calls, followUpMocks, prismaFake, resetFakes, seedOrder, state, vivaMocks } from "./payment-fakes";
import { recheckVivaPayment } from "@/lib/payment/confirm-payment";
import {
  parseAmountToCents,
  recordManualPayment,
  validateManualPayment,
  type ManualPaymentInput,
} from "@/lib/payment/manual-payment";
import { recheckOrderPayment, recordOrderPayment, sweepOrderPayments } from "@/app/admin/(protected)/orders/actions";

const NOW = new Date("2026-10-12T10:00:00Z"); // 13:00 in Athens

const input = (over: Partial<ManualPaymentInput> = {}): ManualPaymentInput => ({
  paidOn: "2026-10-10",
  amount: "123,45",
  reference: "ΝΒG 99812",
  confirmed: true,
  ...over,
});

beforeEach(() => {
  resetFakes();
  session.current = null;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("manual payment — validation", () => {
  const order = { createdAt: new Date("2026-10-04T09:00:00Z"), totalGross: 123.45 };

  it("parses Greek and plain amounts to cents", () => {
    expect(parseAmountToCents("123,45")).toBe(12345);
    expect(parseAmountToCents("1.234,50")).toBe(123450);
    expect(parseAmountToCents("123.45")).toBe(12345);
    expect(parseAmountToCents("123 €")).toBe(12300);
    expect(parseAmountToCents("12,345")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("blocks an amount that differs from the order total, even by a cent", () => {
    const r = validateManualPayment(input({ amount: "123,44" }), order, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/διαφέρει από το σύνολο/);
  });

  it("refuses a future date", () => {
    const r = validateManualPayment(input({ paidOn: "2026-10-13" }), order, NOW);
    expect(!r.ok && r.error).toMatch(/μελλοντική/);
  });

  it("refuses a date before the order was created", () => {
    const r = validateManualPayment(input({ paidOn: "2026-10-03" }), order, NOW);
    expect(!r.ok && r.error).toMatch(/πριν από τη δημιουργία/);
  });

  it("refuses a malformed date", () => {
    expect(validateManualPayment(input({ paidOn: "10/10/2026" }), order, NOW).ok).toBe(false);
  });

  it("judges 'today' in Athens, not UTC", () => {
    // 22:30 UTC on the 12th is already the 13th in Athens.
    const lateEvening = new Date("2026-10-12T22:30:00Z");
    expect(validateManualPayment(input({ paidOn: "2026-10-13" }), order, lateEvening).ok).toBe(true);
  });

  it("requires the confirmation checkbox", () => {
    const r = validateManualPayment(input({ confirmed: false }), order, NOW);
    expect(!r.ok && r.error).toMatch(/Επιβεβαιώστε/);
  });

  it("uses now for today, and never a time before the order existed", () => {
    const today = validateManualPayment(input({ paidOn: "2026-10-12" }), order, NOW);
    expect(today.ok && today.value.paidAt).toEqual(NOW);
    const lateOrder = { ...order, createdAt: new Date("2026-10-04T18:00:00Z") };
    const sameDay = validateManualPayment(input({ paidOn: "2026-10-04" }), lateOrder, NOW);
    expect(sameDay.ok && sameDay.value.paidAt).toEqual(lateOrder.createdAt);
  });
});

describe("manual payment — recording", () => {
  it("marks the order paid with the chosen date, the admin, the reference, and runs the follow-ups", async () => {
    seedOrder();
    const r = await recordManualPayment("KOL-20261004-0001", input(), "admin:ops@kolleris.com", NOW);
    expect(r).toMatchObject({ ok: true, alreadyPaid: false });
    expect(state.order).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", vivaTransactionId: null });
    expect(state.order!.paidAt!.toISOString()).toBe("2026-10-10T09:00:00.000Z");
    expect(state.history).toHaveLength(1);
    expect(state.history[0].actor).toBe("admin:ops@kolleris.com");
    expect(state.history[0].note).toMatch(
      /^Χειροκίνητη καταχώριση πληρωμής \(τραπεζική κατάθεση\) · 123,45\s€ · πίστωση 2026-10-10 · ref ΝΒG 99812$/,
    );
    expect(calls).toEqual([
      "receipt:KOL-20261004-0001",
      "internal:KOL-20261004-0001",
      "sync:KOL-20261004-0001",
      "erp:KOL-20261004-0001",
    ]);
  });

  it("blocks an amount mismatch without writing anything", async () => {
    seedOrder();
    const r = await recordManualPayment("KOL-20261004-0001", input({ amount: "120,00" }), "admin:x", NOW);
    expect(r.ok).toBe(false);
    expect(state.order!.paymentStatus).toBe("PENDING");
    expect(state.history).toEqual([]);
    expect(prismaFake.order.updateMany).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("is a friendly no-op on an order that is already paid", async () => {
    seedOrder({ paymentStatus: "PAID" });
    const r = await recordManualPayment("KOL-20261004-0001", input(), "admin:x", NOW);
    expect(r).toEqual({ ok: true, alreadyPaid: true });
    expect(state.history).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("loses the race gracefully: if the order became PAID between read and write, nothing is duplicated", async () => {
    seedOrder();
    prismaFake.order.findUnique.mockImplementationOnce(async () => ({ ...state.order!, paymentStatus: "PENDING" }));
    state.order!.paymentStatus = "PAID"; // a webhook got there first
    const r = await recordManualPayment("KOL-20261004-0001", input(), "admin:x", NOW);
    expect(r).toEqual({ ok: true, alreadyPaid: true });
    expect(state.history).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("refuses a cancelled order", async () => {
    seedOrder({ status: "CANCELLED" });
    const r = await recordManualPayment("KOL-20261004-0001", input(), "admin:x", NOW);
    expect(r.ok).toBe(false);
    expect(state.order!.paymentStatus).toBe("PENDING");
  });

  it("keeps the payment when the ERP push fails, and reports it", async () => {
    seedOrder();
    followUpMocks.sendOrderToErp.mockResolvedValueOnce({ ok: false, stage: "push", error: "SoftOne timeout" });
    const r = await recordManualPayment("KOL-20261004-0001", input(), "admin:x", NOW);
    expect(r.ok && !r.alreadyPaid && r.followUps.erpDocument).toEqual({
      ok: false,
      stage: "push",
      error: "SoftOne timeout",
    });
    expect(state.order!.paymentStatus).toBe("PAID");
  });
});

describe("Viva recheck", () => {
  const listed = (over: Record<string, unknown> = {}) => ({
    transactionId: "tx-dias",
    statusId: "F",
    amount: 123.45,
    merchantTrns: null,
    orderCode: "4727456577872605",
    transactionTypeId: 15,
    insDate: "2026-10-06T10:15:00+03:00",
    ...over,
  });

  beforeEach(() => {
    vivaMocks.getTransaction.mockResolvedValue({
      statusId: "F",
      amount: 123.45,
      merchantTrns: null,
      orderCode: 4727456577872605,
      paymentMethodId: null,
      transactionTypeId: 15,
    });
  });

  it("completes a bank order whose Viva code was paid by e-banking, even after the code expired", async () => {
    seedOrder();
    vivaMocks.getPaymentOrder.mockResolvedValue({ orderCode: "4727456577872605", stateId: 1 });
    vivaMocks.listOrderTransactions.mockResolvedValue([listed({ statusId: "E", transactionId: "tx-bad" }), listed()]);

    const r = await recheckVivaPayment("KOL-20261004-0001", "admin:ops@kolleris.com");

    expect(r.kind).toBe("paid");
    expect(vivaMocks.getTransaction).toHaveBeenCalledWith("tx-dias");
    expect(state.order).toMatchObject({ paymentStatus: "PAID", vivaTransactionId: "tx-dias" });
    expect(state.order!.paidAt!.toISOString()).toBe("2026-10-06T07:15:00.000Z");
    expect(state.history[0].note).toMatch(/Επανέλεγχος Viva.*tx-dias.*μετά τη λήξη/);
    expect(calls).toHaveLength(4);
  });

  it("reports not paid when Viva has no finished payment", async () => {
    seedOrder();
    vivaMocks.getPaymentOrder.mockResolvedValue({ orderCode: "4727456577872605", stateId: 0 });
    vivaMocks.listOrderTransactions.mockResolvedValue([]);
    expect(await recheckVivaPayment("KOL-20261004-0001", "admin:x")).toEqual({
      kind: "not_paid",
      stateId: 0,
      attempts: 0,
    });
    expect(state.order!.paymentStatus).toBe("PENDING");
  });

  it("does not treat a reversal (negative amount) as a payment", async () => {
    seedOrder();
    vivaMocks.getPaymentOrder.mockResolvedValue({ orderCode: "4727456577872605", stateId: 3 });
    vivaMocks.listOrderTransactions.mockResolvedValue([listed({ amount: -123.45 })]);
    expect((await recheckVivaPayment("KOL-20261004-0001", "admin:x")).kind).toBe("not_paid");
  });

  it("applies the webhook's amount check", async () => {
    seedOrder();
    vivaMocks.getPaymentOrder.mockResolvedValue({ orderCode: "4727456577872605", stateId: 3 });
    vivaMocks.listOrderTransactions.mockResolvedValue([listed({ amount: 100 })]);
    vivaMocks.getTransaction.mockResolvedValue({ statusId: "F", amount: 100, paymentMethodId: null });
    const r = await recheckVivaPayment("KOL-20261004-0001", "admin:x");
    expect(r).toMatchObject({ kind: "amount_mismatch", capturedCents: 10000, expectedCents: 12345 });
    expect(state.order!.paymentStatus).toBe("PENDING");
    expect(calls).toEqual([]);
  });

  it("is a no-op on a paid order and never calls Viva", async () => {
    seedOrder({ paymentStatus: "PAID" });
    expect((await recheckVivaPayment("KOL-20261004-0001", "admin:x")).kind).toBe("already_paid");
    expect(vivaMocks.getPaymentOrder).not.toHaveBeenCalled();
  });

  it("says so when the order has no Viva code, or the credentials are missing", async () => {
    seedOrder({ vivaOrderCode: null });
    expect((await recheckVivaPayment("KOL-20261004-0001", "admin:x")).kind).toBe("no_order_code");
    seedOrder();
    vivaMocks.isVivaBasicConfigured.mockReturnValue(false);
    expect((await recheckVivaPayment("KOL-20261004-0001", "admin:x")).kind).toBe("not_configured");
  });
});

describe("server actions", () => {
  it("refuse a session without the 'orders' capability", async () => {
    seedOrder();
    session.current = { user: { id: "u1", email: "editor@kolleris.com", role: "EDITOR" } };
    await expect(recordOrderPayment("KOL-20261004-0001", input())).rejects.toThrow(/Forbidden/);
    await expect(recheckOrderPayment("KOL-20261004-0001")).rejects.toThrow(/Forbidden/);
    session.current = null;
    await expect(recordOrderPayment("KOL-20261004-0001", input())).rejects.toThrow(/Forbidden/);
    expect(state.order!.paymentStatus).toBe("PENDING");
  });

  it("record the admin's email and surface a failed HDCtool push as a warning, not an error", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      seedOrder();
      session.current = { user: { id: "u1", email: "ops@kolleris.com", role: "OPS" } };
      followUpMocks.sendOrderToErp.mockResolvedValueOnce({ ok: false, stage: "intake", error: "HDCtool 502" });
      const r = await recordOrderPayment("KOL-20261004-0001", input());
      expect(r.ok).toBe(true);
      expect(r.ok && r.message).toMatch(/^Η πληρωμή καταχωρίστηκε/);
      expect(r.ok && r.warnings.join(" ")).toMatch(/HDCtool\/SoftOne απέτυχε: HDCtool 502/);
      expect(state.history[0].actor).toBe("admin:ops@kolleris.com");
    } finally {
      vi.useRealTimers();
    }
  });

  it("explain an amount mismatch in Greek", async () => {
    seedOrder();
    session.current = { user: { id: "u1", email: "ops@kolleris.com", role: "ADMIN" } };
    const r = await recordOrderPayment("KOL-20261004-0001", input({ amount: "1,00" }));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/1,00\s€.*123,45\s€/);
  });
});

describe("«Έλεγχος εκκρεμών πληρωμών»", () => {
  it("refuses a session without the 'orders' capability", async () => {
    session.current = { user: { id: "u1", email: "editor@kolleris.com", role: "EDITOR" } };
    await expect(sweepOrderPayments()).rejects.toThrow(/Forbidden/);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("sums the run up in Greek, naming completed orders and what needs a look", async () => {
    session.current = { user: { id: "u1", email: "ops@kolleris.com", role: "OPS" } };
    sweepMock.mockResolvedValue({
      ok: true,
      checked: 4,
      paid: [{ orderNumber: "KOL-20261004-0001", transactionId: "t", warnings: [] }],
      stillPending: 1,
      mismatches: [{ orderNumber: "KOL-20261005-0002", capturedCents: 10000, expectedCents: 12345 }],
      errors: [{ orderNumber: "KOL-20261006-0003", message: "Η Viva δεν απάντησε: 503" }],
      truncated: false,
      durationMs: 5,
    });
    const r = await sweepOrderPayments();
    expect(sweepMock).toHaveBeenCalledWith({ actor: "admin:ops@kolleris.com", budgetMs: 40_000 });
    expect(r.message).toBe(
      "Ελέγχθηκαν 4 · Ολοκληρώθηκαν 1 (KOL-20261004-0001) · Σε αναμονή 1 · Σφάλματα 1",
    );
    expect(r.details).toHaveLength(2);
    expect(r.details[0]).toMatch(/^KOL-20261005-0002: η Viva έχει 100,00\s€ αντί για 123,45\s€/);
    expect(r.details[1]).toBe("KOL-20261006-0003: Η Viva δεν απάντησε: 503");
  });

  it("passes a skipped run's reason through", async () => {
    session.current = { user: { id: "u1", email: "ops@kolleris.com", role: "OPS" } };
    sweepMock.mockResolvedValue({ ok: false, skipped: "already_running", message: "Ο έλεγχος πληρωμών τρέχει ήδη" });
    expect(await sweepOrderPayments()).toEqual({ ok: false, message: "Ο έλεγχος πληρωμών τρέχει ήδη", details: [] });
  });
});
