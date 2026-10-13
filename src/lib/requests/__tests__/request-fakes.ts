import { vi } from "vitest";

/**
 * An in-memory stand-in for the slice of Prisma the request flows use, and
 * recorders for every outside call (mail, HDCtool intake, Viva, ACS). Nothing
 * here touches a database or the network.
 */

export type FakeOrder = Record<string, unknown> & {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  requestStatus: string | null;
  requestToken: string | null;
  offerVersion: number | null;
  offerExpiresAt: Date | null;
  offerRemindedAt: Date | null;
  totalGross: number;
};

export type FakeLine = Record<string, unknown> & { id: string; orderId: string };

export const db: {
  orders: FakeOrder[];
  lines: FakeLine[];
  history: Array<{ orderId: string; status: string; actor: string; note: string | null }>;
  products: Array<{ id: string; mtrl: number; mtrmark: number | null; weight: number | null; images: Array<{ url: string }> }>;
  syncState: Map<string, { lastRunAt: Date | null; lastStatus: string | null }>;
  locked: boolean;
} = { orders: [], lines: [], history: [], products: [], syncState: new Map(), locked: false };

/** Prisma's `where` semantics, for the operators these flows use. */
function fieldMatches(value: unknown, cond: unknown): boolean {
  if (cond === null) return value == null;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond !== "object") return value === cond;
  const c = cond as Record<string, unknown>;
  if ("not" in c) {
    if (c.not === null) return value != null;
    return value !== c.not;
  }
  if ("in" in c) return (c.in as unknown[]).includes(value);
  if ("startsWith" in c) return typeof value === "string" && value.startsWith(String(c.startsWith));
  if ("lt" in c) return value != null && (value as number | Date) < (c.lt as number | Date);
  if ("lte" in c) return value != null && (value as number | Date) <= (c.lte as number | Date);
  if ("gt" in c) return value != null && (value as number | Date) > (c.gt as number | Date);
  if ("gte" in c) return value != null && (value as number | Date) >= (c.gte as number | Date);
  return true;
}

export function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(row, w))) return false;
    } else if (key === "AND") {
      if (!(cond as Record<string, unknown>[]).every((w) => matches(row, w))) return false;
    } else if (!fieldMatches(row[key], cond)) {
      return false;
    }
  }
  return true;
}

function pick<T extends Record<string, unknown>>(row: T, select?: Record<string, unknown>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) out[key] = row[key];
  return out;
}

const orderApi = {
  findUnique: vi.fn(async ({ where, select, include }: { where: Record<string, unknown>; select?: Record<string, unknown>; include?: { lines?: unknown } }) => {
    const row = db.orders.find((o) => matches(o, where));
    if (!row) return null;
    const out = pick(row, select);
    if (include?.lines) out.lines = db.lines.filter((l) => l.orderId === row.id);
    return out;
  }),
  findFirst: vi.fn(
    async ({ where, select, orderBy }: { where: Record<string, unknown>; select?: Record<string, unknown>; orderBy?: { orderNumber?: "asc" | "desc" } }) => {
      const rows = db.orders.filter((o) => matches(o, where));
      if (orderBy?.orderNumber === "desc") rows.sort((a, b) => b.orderNumber.localeCompare(a.orderNumber));
      const row = rows[0];
      return row ? pick(row, select) : null;
    },
  ),
  findMany: vi.fn(async ({ where, select, take }: { where: Record<string, unknown>; select?: Record<string, unknown>; take?: number }) =>
    db.orders.filter((o) => matches(o, where)).slice(0, take ?? 1000).map((o) => pick(o, select)),
  ),
  update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const row = db.orders.find((o) => matches(o, where));
    if (!row) throw new Error("not found");
    Object.assign(row, data);
    return { ...row };
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const rows = db.orders.filter((o) => matches(o, where));
    for (const row of rows) Object.assign(row, data);
    return { count: rows.length };
  }),
  create: vi.fn(async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
    const { lines, history, ...fields } = data as {
      lines?: { create: Record<string, unknown>[] };
      history?: { create: { status: string; actor: string; note?: string } };
    };
    const id = `o${db.orders.length + 1}`;
    const row = { id, offerVersion: null, offerExpiresAt: null, offerRemindedAt: null, requestStatus: null, requestToken: null, ...fields } as FakeOrder;
    db.orders.push(row);
    for (const line of lines?.create ?? []) db.lines.push({ id: String(line.id ?? `l${db.lines.length + 1}`), ...line, orderId: id });
    if (history?.create) db.history.push({ orderId: id, ...history.create, note: history.create.note ?? null });
    return pick(row, select);
  }),
};

export const prismaFake = {
  order: orderApi,
  orderLine: {
    deleteMany: vi.fn(async ({ where }: { where: { orderId: string } }) => {
      const before = db.lines.length;
      db.lines = db.lines.filter((l) => l.orderId !== where.orderId);
      return { count: before - db.lines.length };
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown> & { orderId: string }> }) => {
      for (const line of data) db.lines.push({ id: `l${db.lines.length + 1}`, ...line });
      return { count: data.length };
    }),
  },
  orderStatusHistory: {
    create: vi.fn(async ({ data }: { data: { orderId: string; status: string; actor: string; note?: string } }) => {
      db.history.push({ ...data, note: data.note ?? null });
      return data;
    }),
  },
  product: {
    findMany: vi.fn(async ({ where }: { where: { mtrl?: { in: number[] }; id?: { in: string[] } } }) =>
      db.products.filter((p) => (where.mtrl ? where.mtrl.in.includes(p.mtrl) : where.id ? where.id.in.includes(p.id) : true)),
    ),
  },
  brand: { findMany: vi.fn(async () => [{ mtrmark: 7, nameEl: "KNIPEX" }]) },
  syncState: {
    findUnique: vi.fn(async ({ where }: { where: { channel: string } }) => db.syncState.get(where.channel) ?? null),
    upsert: vi.fn(async ({ where, create, update }: { where: { channel: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const current = db.syncState.get(where.channel);
      const next = { ...(current ?? { lastRunAt: null, lastStatus: null }), ...(current ? update : create) } as { lastRunAt: Date | null; lastStatus: string | null };
      db.syncState.set(where.channel, next);
      return next;
    }),
    update: vi.fn(async ({ where, data }: { where: { channel: string }; data: Record<string, unknown> }) => {
      const current = db.syncState.get(where.channel) ?? { lastRunAt: null, lastStatus: null };
      const next = { ...current, ...data } as { lastRunAt: Date | null; lastStatus: string | null };
      db.syncState.set(where.channel, next);
      return next;
    }),
  },
  $queryRaw: vi.fn(async () => [{ locked: !db.locked }]),
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaFake)),
};

export const calls: string[] = [];

export const outside = {
  sendRequestEmail: vi.fn(async (kind: string, orderNumber: string) => {
    calls.push(`mail:${kind}:${orderNumber}`);
    return { ok: true as const, id: "m1" };
  }),
  sendInternalRequestEmail: vi.fn(async (orderNumber: string) => {
    calls.push(`mail:internal:${orderNumber}`);
    return { ok: true as const, id: "m2" };
  }),
  syncRequestToHdctool: vi.fn(async (orderNumber: string) => {
    const status = db.orders.find((o) => o.orderNumber === orderNumber)?.requestStatus;
    calls.push(`intake:${status}:${orderNumber}`);
    return { ok: true as const };
  }),
  createPaymentOrder: vi.fn(async (input: { amountGross: number; orderNumber: string }) => {
    calls.push(`viva:${input.orderNumber}:${input.amountGross.toFixed(2)}`);
    return { orderCode: "9000000000000001", checkoutUrl: "https://demo.vivapayments.com/web/checkout?ref=9000000000000001" };
  }),
  isVivaConfigured: vi.fn(() => true),
  quoteOfferShipping: vi.fn(async () => ({ ok: true as const, shippingNet: 5.5 })),
};

export const mockModules = {
  prisma: () => ({ prisma: prismaFake }),
  mail: () => ({ sendRequestEmail: outside.sendRequestEmail, sendInternalRequestEmail: outside.sendInternalRequestEmail }),
  erp: () => ({ syncRequestToHdctool: outside.syncRequestToHdctool }),
  viva: () => ({ createPaymentOrder: outside.createPaymentOrder, isVivaConfigured: outside.isVivaConfigured }),
  shipping: () => ({ quoteOfferShipping: outside.quoteOfferShipping }),
};

export function resetFakes() {
  db.orders = [];
  db.lines = [];
  db.history = [];
  db.products = [];
  db.syncState = new Map();
  db.locked = false;
  calls.length = 0;
  for (const fn of [
    ...Object.values(orderApi),
    ...Object.values(prismaFake.orderLine),
    prismaFake.orderStatusHistory.create,
    prismaFake.product.findMany,
    prismaFake.$queryRaw,
    prismaFake.$transaction,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockClear();
  }
  for (const fn of Object.values(outside)) (fn as ReturnType<typeof vi.fn>).mockClear();
  outside.isVivaConfigured.mockReturnValue(true);
  outside.quoteOfferShipping.mockImplementation(async () => ({ ok: true as const, shippingNet: 5.5 }));
}

export const TOKEN = "A".repeat(20) + "b_c-" + "9".repeat(19); // 43 chars, base64url

/** A request order as checkout writes it: two requested lines. */
export function seedRequest(over: Partial<FakeOrder> = {}): FakeOrder {
  const order: FakeOrder = {
    id: "r1",
    orderNumber: "KOL-20261013-0002",
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    paymentMethod: "card",
    shippingMethod: "courier",
    shipPostcode: "18545",
    email: "buyer@example.test",
    firstName: "Μαρία",
    lastName: "Παπαδοπούλου",
    phone: "6900000000",
    totalGross: 49.6,
    requestStatus: "REQUESTED",
    requestToken: TOKEN,
    requestedAt: new Date("2026-10-13T08:00:00Z"),
    parentOrderNumber: null,
    requestLines: {
      v: 1,
      locale: "el",
      lines: [
        { lineId: "L1", productId: "p1", mtrl: 101, sku: "KN-1", name: "Πένσα", brand: "KNIPEX", imageUrl: null, qty: 2, unitNet: 10, vatRate: 24, stockAtRequest: 0 },
        { lineId: "L2", productId: "p2", mtrl: 102, sku: "KN-2", name: "Κόφτης", brand: "KNIPEX", imageUrl: null, qty: 1, unitNet: 20, vatRate: 24, stockAtRequest: 1 },
      ],
    },
    offerVersion: null,
    offerJson: null,
    offerExpiresAt: null,
    offerRemindedAt: null,
    requestDecisionAt: null,
    vivaOrderCode: null,
    ...over,
  };
  db.orders.push(order);
  db.lines.push(
    { id: "L1", orderId: order.id, mtrl: 101, sku: "KN-1", quantity: 2 },
    { id: "L2", orderId: order.id, mtrl: 102, sku: "KN-2", quantity: 1 },
  );
  return order;
}
