import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A customer's own orders.
 *
 * Matched on `customerId` OR the account's email, and that is not belt-and-
 * braces. The checkout only started stamping `customerId` today, so every order
 * placed before now is orphaned; and people order as a guest first and register
 * afterwards, which is the normal way an account begins. Matching on email as
 * well is what makes those orders appear instead of vanishing.
 *
 * The email comparison is case-insensitive because an address typed at checkout
 * and one typed at registration are the same address whatever the shift key was
 * doing.
 */

export type AccountOrder = {
  id: string;
  orderNumber: string;
  guestToken: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingMethod: string;
  totalGross: number;
  createdAt: Date;
  itemCount: number;
  /** First few product names, for a line the customer can recognise. */
  preview: string[];
};

export async function listCustomerOrders(
  customerId: string,
  email: string,
): Promise<AccountOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ customerId }, { email: { equals: email, mode: "insensitive" } }],
    },
    orderBy: { createdAt: "desc" },
    // Bounded. An account with hundreds of orders needs paging, not a longer
    // page, and nobody has hundreds yet.
    take: 50,
    select: {
      id: true,
      orderNumber: true,
      guestToken: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      shippingMethod: true,
      totalGross: true,
      createdAt: true,
      lines: { select: { name: true, quantity: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    guestToken: order.guestToken,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    shippingMethod: order.shippingMethod,
    totalGross: Number(order.totalGross),
    createdAt: order.createdAt,
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    preview: order.lines.slice(0, 3).map((line) => line.name),
  }));
}

/**
 * Adopt the guest orders placed with this address.
 *
 * Called after sign-in. Without it an order stays orphaned forever and the
 * email match above is doing all the work on every page load; stamping it once
 * means the index on `customerId` can answer instead.
 *
 * Only ever claims rows that have no customer, so it cannot move an order
 * between accounts.
 */
export async function claimGuestOrders(customerId: string, email: string): Promise<number> {
  const result = await prisma.order.updateMany({
    where: { customerId: null, email: { equals: email, mode: "insensitive" } },
    data: { customerId },
  });
  return result.count;
}
