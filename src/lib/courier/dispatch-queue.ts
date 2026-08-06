import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The orders waiting to become parcels.
 *
 * The dispatch screen listed what ACS already knows about and nothing else, so
 * an order that was paid this morning was invisible until somebody had already
 * created its voucher somewhere — which nothing in the software could do. The
 * board showed the end of the process and hid the beginning.
 *
 * This is the beginning: paid, not cancelled, no voucher yet. Everything that
 * ought to be collected today and is not yet on a list.
 *
 * ── Not filtered by date ────────────────────────────────────────────────────
 *
 * The rest of the screen is a day at a time, correctly — a pickup list belongs
 * to a date. This queue is not, and that is deliberate: an order that missed
 * yesterday's collection has to appear today, or it sits unshipped and the only
 * way to notice is a customer asking. A backlog is exactly what a dispatch desk
 * needs to see.
 */

export type DispatchOrder = {
  orderNumber: string;
  customer: string;
  city: string;
  postcode: string;
  address: string;
  phone: string;
  items: number;
  totalGross: number;
  paidAt: Date | null;
  /** True once ACS has a voucher for it — kept so the row can say so. */
  voucherNo: string | null;
};

export async function listDispatchQueue(): Promise<DispatchOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: "PAID",
      acsVoucherNo: null,
      status: { notIn: ["CANCELLED", "FAILED"] },
      // Collection from the shop is not a courier parcel.
      shippingMethod: { not: "pickup" },
    },
    orderBy: { paidAt: "asc" },
    /*
     * `include` rather than `select`, only so `_count` comes with it. The row
     * is a few short strings; counting the lines in a second query per order is
     * the cost worth avoiding, not the columns.
     */
    include: { _count: { select: { lines: true } } },
  });

  return orders.map((order) => ({
    orderNumber: order.orderNumber,
    customer: `${order.firstName} ${order.lastName}`.trim(),
    city: order.shipCity,
    postcode: order.shipPostcode,
    address: [order.shipLine1, order.shipLine2].filter(Boolean).join(", "),
    phone: order.phone,
    items: order._count.lines,
    totalGross: Number(order.totalGross),
    paidAt: order.paidAt,
    voucherNo: order.acsVoucherNo,
  }));
}
