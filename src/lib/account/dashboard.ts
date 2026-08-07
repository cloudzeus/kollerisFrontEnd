import "server-only";
import { prisma } from "@/lib/prisma";
import { trackVoucher } from "@/lib/courier/acs";

/**
 * What a customer's account page should have been showing all along.
 *
 * It showed facts about the account: name, email, phone, last login, ΑΦΜ. All
 * true, none of it a reason to visit. Nobody signs in to read their own
 * telephone number back.
 *
 * What somebody actually opens an account for is one of three things — where
 * is my order, what did I buy last time, and change something about my
 * details — so that is what this loads. Facts come last, where reference
 * material belongs.
 */

export type DashboardOrder = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalGross: number;
  createdAt: Date;
  items: number;
  /** First product name, for a line somebody recognises. */
  firstItem: string | null;
  image: string | null;
  voucherNo: string | null;
  guestToken: string;
};

export type TrackingStep = {
  at: string;
  status: string;
  place: string | null;
};

export type AccountDashboard = {
  orders: DashboardOrder[];
  counts: { total: number; open: number; delivered: number };
  spend: { lifetime: number; year: number };
  address: {
    id: string;
    label: string;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
  } | null;
  addressCount: number;
  /** The parcel worth watching: the newest order that has a voucher and is not delivered. */
  tracking: { orderNumber: string; voucherNo: string; steps: TrackingStep[] } | null;
};

/** Orders that are still going somewhere. */
const OPEN = ["PENDING_PAYMENT", "CONFIRMED", "SHIPPED"] as const;

export async function getAccountDashboard(
  customerId: string,
  email: string,
): Promise<AccountDashboard> {
  /*
   * Matched on customerId OR email.
   *
   * Somebody who bought as a guest and registered later has orders attached by
   * the invitation; somebody who bought as a guest with the same address and
   * has not been adopted yet does not. Both are the same person, and an account
   * that shows five of their seven orders is worse than one that shows none —
   * it looks like the shop lost two.
   */
  const where = {
    OR: [{ customerId }, { email: { equals: email, mode: "insensitive" as const } }],
  };

  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [rows, total, open, delivered, lifetimeAgg, yearAgg, address, addressCount] =
    await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalGross: true,
          createdAt: true,
          acsVoucherNo: true,
          guestToken: true,
          lines: { take: 1, select: { name: true, imageUrl: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, status: { in: [...OPEN] } } }),
      prisma.order.count({ where: { ...where, status: "DELIVERED" } }),
      // Paid only: an abandoned card attempt is not money the customer spent.
      prisma.order.aggregate({ where: { ...where, paymentStatus: "PAID" }, _sum: { totalGross: true } }),
      prisma.order.aggregate({
        where: { ...where, paymentStatus: "PAID", createdAt: { gte: yearStart } },
        _sum: { totalGross: true },
      }),
      prisma.customerAddress.findFirst({
        where: { customerId },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: { id: true, label: true, line1: true, line2: true, city: true, postcode: true },
      }),
      prisma.customerAddress.count({ where: { customerId } }),
    ]);

  const orders: DashboardOrder[] = rows.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    totalGross: Number(o.totalGross),
    createdAt: o.createdAt,
    items: o._count.lines,
    firstItem: o.lines[0]?.name ?? null,
    image: o.lines[0]?.imageUrl ?? null,
    voucherNo: o.acsVoucherNo,
    guestToken: o.guestToken,
  }));

  /*
   * One parcel is tracked, not all of them.
   *
   * Each lookup is a call to ACS through HDCtool, and a courier API is slow
   * often enough that five of them would make this page feel broken. The one
   * worth showing is the newest parcel still in transit — a delivered order
   * needs no tracking, and an older one is not what somebody came to check.
   *
   * A failure here is silence rather than an error: the order list is still
   * useful when ACS is not answering, and "we cannot reach the courier" is not
   * something the customer can act on.
   */
  const watching = orders.find((o) => o.voucherNo && o.status !== "DELIVERED");
  let tracking: AccountDashboard["tracking"] = null;
  if (watching?.voucherNo) {
    const result = await trackVoucher(watching.voucherNo);
    if (result.ok) {
      tracking = {
        orderNumber: watching.orderNumber,
        voucherNo: watching.voucherNo,
        // ACS's own field names — `action` is what happened, `location` where.
        steps: (result.data.checkpoints ?? []).map((c) => ({
          at: c.date ?? "",
          status: c.action ?? c.notes ?? "",
          place: c.location ?? null,
        })),
      };
    }
  }

  return {
    orders,
    counts: { total, open, delivered },
    spend: {
      lifetime: Number(lifetimeAgg._sum.totalGross ?? 0),
      year: Number(yearAgg._sum.totalGross ?? 0),
    },
    address,
    addressCount,
    tracking,
  };
}
