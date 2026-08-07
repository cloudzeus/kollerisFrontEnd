import "server-only";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/account/session";
import { matchOrderLines } from "@/lib/cart/reorder-match";

/**
 * Buy this again.
 *
 * The most-pressed button in any trade shop, and the reason is arithmetic: a
 * workshop buying the same discs, blades and bits every month has already made
 * every decision. Making them search for eight products they bought six weeks
 * ago is asking them to re-do work they finished the first time — and a
 * competitor's site that remembers is one click, not eight searches.
 *
 * ── What this does NOT do ───────────────────────────────────────────────────
 *
 * It does not copy the old order. An order is a historical record — the prices
 * in it were the prices that day, and `OrderLine` exists precisely so a
 * delisted or repriced product can never rewrite what somebody was charged.
 * So this resolves each line back to a LIVE product and adds that, at today's
 * price, and then says plainly what changed.
 *
 * Three things routinely differ between an old order and today's catalogue,
 * and all three are reported rather than absorbed:
 *
 *   · the product is gone or delisted   → skipped, named
 *   · the product has no sellable price → skipped, named
 *   · the price moved                   → added, with then/now
 *
 * The last one matters most. A customer who reorders and only discovers at
 * checkout that a €12 consumable is now €19 has been ambushed by their own
 * shortcut, which teaches them not to use it.
 */

export type ReorderSkip = {
  name: string;
  reason: "delisted" | "no_price";
};

export type ReorderPriceChange = {
  name: string;
  /** Net unit price on the original order. */
  then: number;
  /** Net unit price today. */
  now: number;
};

export type ReorderPlan = {
  orderNumber: string;
  /** Resolved to live products at today's price, ready to write. */
  add: Array<{ productId: string; quantity: number; priceNet: number }>;
  /** Total units, across lines. */
  units: number;
  skipped: ReorderSkip[];
  priceChanges: ReorderPriceChange[];
};

export type ReorderError = "not_found" | "forbidden" | "nothing_available";

/**
 * Work out what reordering would put in the basket, before anything is written.
 *
 * Separate from the write so the rule lives in one testable place, and so the
 * report the customer reads is computed from the same pass that decides what
 * to add — not narrated afterwards from a count.
 */
export async function planReorder(
  orderNumber: string,
  token?: string,
): Promise<{ ok: true; plan: ReorderPlan } | { ok: false; error: ReorderError }> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      customerId: true,
      email: true,
      guestToken: true,
      lines: {
        select: { productId: true, mtrl: true, sku: true, name: true, quantity: true, unitNet: true },
      },
    },
  });

  if (!order) return { ok: false, error: "not_found" };
  if (!(await mayReorder(order, token))) return { ok: false, error: "forbidden" };

  /*
   * Three ways back to a product, in order of how much they can be trusted.
   *
   * `productId` is exact but the weakest over time — it is deliberately not a
   * foreign key, so it survives as a string pointing at nothing once a product
   * is deleted and re-imported. `mtrl` is the ERP's own identifier and the join
   * key across both systems, so it survives that. The code is last: it is what
   * is printed on the box, and it is the only thing that still matches when a
   * product was rebuilt from scratch.
   */
  const ids = [...new Set(order.lines.map((l) => l.productId).filter((v): v is string => !!v))];
  const mtrls = [...new Set(order.lines.map((l) => l.mtrl).filter((v): v is number => v != null))];
  const codes = [...new Set(order.lines.map((l) => l.sku).filter(Boolean))];

  const or = [
    ids.length ? { id: { in: ids } } : null,
    mtrls.length ? { mtrl: { in: mtrls } } : null,
    codes.length ? { code2: { in: codes } } : null,
    codes.length ? { code: { in: codes } } : null,
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const products = or.length
    ? await prisma.product.findMany({
        where: { isActive: true, OR: or },
        select: { id: true, mtrl: true, code: true, code2: true, priceNet: true },
      })
    : [];

  const matched = matchOrderLines(order.lines, products);
  if (matched.add.length === 0) return { ok: false, error: "nothing_available" };

  return { ok: true, plan: { orderNumber: order.orderNumber, ...matched } };
}

/**
 * Whose order is this.
 *
 * Two valid answers, because there are two ways a customer legitimately holds
 * an order. A signed-in customer owns it by `customerId` or by the email it was
 * placed with — the same pair the orders list matches on, since an account
 * routinely begins as a guest checkout. Anyone else must present the order's
 * own `guestToken`, which is what the confirmation link carries.
 *
 * The order number alone is never enough: it is sequential, and a reorder from
 * a guessed number would put a stranger's purchase history into a basket.
 */
async function mayReorder(
  order: { customerId: string | null; email: string; guestToken: string },
  token?: string,
): Promise<boolean> {
  if (token && token === order.guestToken) return true;

  const session = await getCustomerSession();
  if (session.state !== "signed-in") return false;
  return (
    order.customerId === session.user.id ||
    order.email.toLowerCase() === session.user.email.toLowerCase()
  );
}
