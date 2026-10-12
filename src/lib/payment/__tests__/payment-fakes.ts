import { vi } from "vitest";

/**
 * A one-order in-memory stand-in for Prisma, and recorders for every outside
 * call the paid path makes. Nothing here touches a database, Viva, Mailgun or
 * HDCtool — the modules that would are mocked onto these.
 */

export type FakeOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalGross: number;
  createdAt: Date;
  vivaOrderCode: string | null;
  vivaTransactionId: string | null;
  vivaPaymentMethodId: number | null;
  paidAt: Date | null;
};

export type FakeHistory = { status: string; actor: string; note: string | null };

export const state: { order: FakeOrder | null; history: FakeHistory[] } = { order: null, history: [] };

export function seedOrder(over: Partial<FakeOrder> = {}): FakeOrder {
  state.order = {
    id: "o1",
    orderNumber: "KOL-20261004-0001",
    status: "CONFIRMED",
    paymentStatus: "PENDING",
    paymentMethod: "bank",
    totalGross: 123.45,
    createdAt: new Date("2026-10-04T09:00:00Z"),
    vivaOrderCode: "4727456577872605",
    vivaTransactionId: null,
    vivaPaymentMethodId: null,
    paidAt: null,
    ...over,
  };
  state.history = [];
  return state.order;
}

function matches(where: Record<string, unknown>): boolean {
  const o = state.order;
  if (!o) return false;
  if (where.id != null && where.id !== o.id) return false;
  if (where.orderNumber != null && where.orderNumber !== o.orderNumber) return false;
  if (where.vivaOrderCode != null && where.vivaOrderCode !== o.vivaOrderCode) return false;
  const ps = where.paymentStatus as { not?: string } | undefined;
  if (ps?.not != null && o.paymentStatus === ps.not) return false;
  return true;
}

function applyData(data: Record<string, unknown>) {
  const o = state.order!;
  const { history, ...fields } = data as { history?: { create: FakeHistory } };
  Object.assign(o, fields);
  if (history?.create) {
    const h = history.create;
    state.history.push({ status: h.status, actor: h.actor, note: h.note ?? null });
  }
}

export const prismaFake = {
  order: {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      matches(where) ? { ...state.order! } : null,
    ),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(where)) throw new Error("not found");
      applyData(data);
      return { ...state.order! };
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        applyData(data);
        return { count: 1 };
      },
    ),
  },
  orderStatusHistory: {
    create: vi.fn(async ({ data }: { data: FakeHistory & { orderId: string } }) => {
      state.history.push({ status: data.status, actor: data.actor, note: data.note ?? null });
      return data;
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaFake)),
};

/** Every follow-up, in the order it was called. */
export const calls: string[] = [];

export const followUpMocks = {
  sendOrderEmail: vi.fn(async (n: string) => {
    calls.push(`receipt:${n}`);
    return { ok: true } as { ok: true } | { ok: false; error: string };
  }),
  sendInternalOrderEmail: vi.fn(async (n: string) => {
    calls.push(`internal:${n}`);
    return { ok: true } as { ok: true } | { ok: false; error: string };
  }),
  syncPaymentToErp: vi.fn(async (n: string) => {
    calls.push(`sync:${n}`);
    return { ok: true } as { ok: true } | { ok: false; error: string };
  }),
  sendOrderToErp: vi.fn(async (n: string) => {
    calls.push(`erp:${n}`);
    return { ok: true, findoc: 1, fincode: "ΠΑΡΚ000001", alreadySent: false } as
      | { ok: true; findoc: number | null; fincode: string | null; alreadySent: boolean }
      | { ok: false; stage: "intake" | "push" | "order"; error: string };
  }),
  sendPaymentFailedEmail: vi.fn(async (n: string) => {
    calls.push(`failed-mail:${n}`);
    return { ok: true } as { ok: true } | { ok: false; error: string };
  }),
};

export const vivaMocks = {
  getTransaction: vi.fn(),
  getPaymentOrder: vi.fn(),
  listOrderTransactions: vi.fn(),
  isVivaBasicConfigured: vi.fn(() => true),
};

export function resetFakes() {
  state.order = null;
  state.history = [];
  calls.length = 0;
  for (const group of [prismaFake.order, prismaFake.orderStatusHistory]) {
    for (const fn of Object.values(group)) fn.mockClear();
  }
  prismaFake.$transaction.mockClear();
  for (const fn of Object.values(followUpMocks)) fn.mockClear();
  followUpMocks.sendOrderEmail.mockImplementation(async (n: string) => {
    calls.push(`receipt:${n}`);
    return { ok: true };
  });
  followUpMocks.sendOrderToErp.mockImplementation(async (n: string) => {
    calls.push(`erp:${n}`);
    return { ok: true, findoc: 1, fincode: "ΠΑΡΚ000001", alreadySent: false };
  });
  for (const fn of Object.values(vivaMocks)) fn.mockReset();
  vivaMocks.isVivaBasicConfigured.mockReturnValue(true);
}

/** `vi.mock` factories for the modules the paid path reaches. */
export const mockModules = {
  prisma: () => ({ prisma: prismaFake }),
  orderEmail: () => ({ sendOrderEmail: followUpMocks.sendOrderEmail }),
  internalEmail: () => ({ sendInternalOrderEmail: followUpMocks.sendInternalOrderEmail }),
  failedEmail: () => ({ sendPaymentFailedEmail: followUpMocks.sendPaymentFailedEmail }),
  sendToErp: () => ({
    sendOrderToErp: followUpMocks.sendOrderToErp,
    syncPaymentToErp: followUpMocks.syncPaymentToErp,
  }),
  viva: () => ({
    VIVA_STATUS_PAID: "F",
    VIVA_ORDER_STATE: { pending: 0, expired: 1, cancelled: 2, paid: 3 },
    ...vivaMocks,
  }),
};
