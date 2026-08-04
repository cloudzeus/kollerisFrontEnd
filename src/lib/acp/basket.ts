import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * A basket built by an agent, handed back to a person.
 *
 * The storefront cart lives in a cookie, and an agent has no cookie — that is
 * the whole difficulty, and it is smaller than it looks: the cookie was only
 * ever carrying a token, and the token is a row. So the basket is created here
 * and its token handed back inside a URL. Whoever opens that URL adopts it.
 *
 * Nothing is priced, reserved or promised. Availability and postage are worked
 * out at checkout against the postcode and the real parcel, which is where they
 * have always been worked out. The agent's job ends at "here is a basket".
 *
 * The link is single-purpose and long: the token is 32 random bytes, so it is
 * not guessable, and adopting a basket exposes nothing but the basket.
 */

export type BasketItem = { sku: string; quantity: number };

export type BasketResult = {
  checkout_url: string;
  cart_token: string;
  added: Array<{ sku: string; name: string; quantity: number }>;
  /** SKUs we could not match, so the agent can say so rather than stay silent. */
  not_found: string[];
  /** Matched but out of stock. Still added: checkout is where that is settled. */
  out_of_stock: string[];
};

/** Room for a genuine trade order without letting one call build a warehouse. */
const MAX_LINES = 50;
const MAX_QUANTITY = 999;

export async function buildBasket(
  items: BasketItem[],
  origin: string,
): Promise<BasketResult | { error: string }> {
  const wanted = items
    .map((item) => ({
      sku: String(item.sku ?? "").trim(),
      quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number(item.quantity) || 1))),
    }))
    .filter((item) => item.sku.length > 0)
    .slice(0, MAX_LINES);

  if (wanted.length === 0) return { error: "no_items" };

  /*
   * Matched on every code the ERP knows a product by, because an agent will
   * quote back whichever one it saw: our `id` (mtrl_1234), the manufacturer
   * code we publish as `sku`, or the Kolleris code. Anything else is reported
   * as not found rather than guessed at.
   */
  const mtrls = wanted
    .map((item) => /^mtrl_(\d+)$/.exec(item.sku)?.[1])
    .filter((id): id is string => Boolean(id))
    .map(Number);
  const codes = wanted.map((item) => item.sku);

  const found = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { mtrl: { in: mtrls } },
        { code: { in: codes } },
        { code1: { in: codes } },
        { code2: { in: codes } },
      ],
    },
    select: {
      id: true, mtrl: true, code: true, code1: true, code2: true,
      name: true, priceNet: true, inStock: true,
    },
  });

  // One product answers to several codes; index by all of them.
  const bySku = new Map<string, (typeof found)[number]>();
  for (const product of found) {
    for (const key of [`mtrl_${product.mtrl}`, product.code, product.code1, product.code2]) {
      if (key) bySku.set(key, product);
    }
  }

  const added: BasketResult["added"] = [];
  const notFound: string[] = [];
  const outOfStock: string[] = [];
  const lines = new Map<string, { productId: string; quantity: number; priceNet: unknown }>();

  for (const item of wanted) {
    const product = bySku.get(item.sku);
    if (!product) {
      notFound.push(item.sku);
      continue;
    }
    if (!product.inStock) outOfStock.push(item.sku);

    // Two SKUs can be the same product; merge rather than write twice.
    const existing = lines.get(product.id);
    if (existing) existing.quantity += item.quantity;
    else lines.set(product.id, { productId: product.id, quantity: item.quantity, priceNet: product.priceNet });

    added.push({ sku: item.sku, name: product.name, quantity: item.quantity });
  }

  if (lines.size === 0) return { error: "nothing_matched" };

  const token = randomBytes(32).toString("base64url");
  await prisma.cart.create({
    data: {
      token,
      lines: {
        create: [...lines.values()].map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          addedPriceNet: line.priceNet as never,
        })),
      },
    },
  });

  return {
    checkout_url: `${origin}/api/acp/basket/${token}`,
    cart_token: token,
    added,
    not_found: notFound,
    out_of_stock: outOfStock,
  };
}
