import "server-only";
import { prisma } from "@/lib/prisma";
import type { RecentOrder } from "@/lib/admin/dashboard";

/**
 * The orders list.
 *
 * Filtering and paging happen in the database, not in the browser: the
 * dashboard's eight rows were fine to sort client-side, a year of orders is
 * not. The filters are the ones an operator actually reaches for — what needs
 * doing, and what happened to one particular order.
 *
 * Lines come with the list so a row expands without a round-trip. Twenty-five
 * orders of a few lines each is one join; a request per expand is twenty-five
 * chances to feel slow.
 */

export type OrderFilter = "all" | "erp-pending" | "unpaid" | "to-ship" | "shipped";

export const FILTERS: ReadonlyArray<{ id: OrderFilter; label: string }> = [
  { id: "all", label: "Όλες" },
  { id: "erp-pending", label: "Εκτός ERP" },
  { id: "unpaid", label: "Απλήρωτες" },
  { id: "to-ship", label: "Προς αποστολή" },
  { id: "shipped", label: "Απεσταλμένες" },
] as const;

const PAGE_SIZE = 25;

function whereFor(filter: OrderFilter, query: string) {
  const base: Record<string, unknown> = {};

  switch (filter) {
    case "erp-pending":
      // Paid but never reached SoftOne — the only filter here that is costing
      // money while it sits.
      Object.assign(base, { paymentStatus: "PAID", erpPushedAt: null });
      break;
    case "unpaid":
      Object.assign(base, { paymentStatus: { in: ["PENDING", "FAILED"] } });
      break;
    case "to-ship":
      Object.assign(base, { status: "CONFIRMED", shippedAt: null });
      break;
    case "shipped":
      Object.assign(base, { status: { in: ["SHIPPED", "DELIVERED"] } });
      break;
  }

  const q = query.trim();
  if (q) {
    Object.assign(base, {
      OR: [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { vatNumber: { contains: q } },
        { lines: { some: { sku: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  return base;
}

export type OrdersPage = {
  orders: RecentOrder[];
  total: number;
  page: number;
  pages: number;
  /** Per-filter counts, so the tabs say how much work each one holds. */
  counts: Record<OrderFilter, number>;
};

export async function getOrders({
  filter = "all",
  query = "",
  page = 1,
}: {
  filter?: OrderFilter;
  query?: string;
  page?: number;
}): Promise<OrdersPage> {
  const where = whereFor(filter, query);
  const skip = (Math.max(1, page) - 1) * PAGE_SIZE;

  const [rows, total, erpPending, unpaid, toShip, shipped, all] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        orderNumber: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        totalGross: true,
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
        phone: true,
        shipCity: true,
        shippingMethod: true,
        paymentMethod: true,
        wantsInvoice: true,
        vatNumber: true,
        erpPushedAt: true,
        erpFindoc: true,
        erpError: true,
        lines: {
          select: { sku: true, name: true, quantity: true, lineGross: true },
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.order.count({ where }),
    // Counts ignore the search box: they describe the queue, not the search.
    prisma.order.count({ where: whereFor("erp-pending", "") }),
    prisma.order.count({ where: whereFor("unpaid", "") }),
    prisma.order.count({ where: whereFor("to-ship", "") }),
    prisma.order.count({ where: whereFor("shipped", "") }),
    prisma.order.count(),
  ]);

  return {
    orders: rows.map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalGross: Number(o.totalGross),
      customer: o.companyName ?? `${o.firstName} ${o.lastName}`.trim(),
      email: o.email,
      phone: o.phone,
      city: o.shipCity,
      shippingMethod: o.shippingMethod,
      paymentMethod: o.paymentMethod,
      wantsInvoice: o.wantsInvoice,
      vatNumber: o.vatNumber,
      erpPushed: o.erpPushedAt != null,
      erpFindoc: o.erpFindoc,
      erpError: o.erpError,
      lines: o.lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        lineGross: Number(l.lineGross),
      })),
    })),
    total,
    page: Math.max(1, page),
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: {
      all,
      "erp-pending": erpPending,
      unpaid,
      "to-ship": toShip,
      shipped,
    },
  };
}
