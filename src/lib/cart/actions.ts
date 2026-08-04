"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  getCartToken,
  newToken,
  setCartCookie,
} from "@/lib/cart/cart";
import { searchKey } from "@/lib/greek";

/**
 * Cart mutations.
 *
 * Every action validates its own input and resolves products from the database
 * — nothing trusts a price, a name or an availability flag sent by the client.
 * The only thing a caller may choose is *which* product and *how many*.
 */

export type CartActionResult =
  | { ok: true; added?: number; notFound?: string[] }
  | { ok: false; error: string };

/** Quantity ceiling per line. Bulk beyond this goes through a sales rep. */
const MAX_QUANTITY = 999;

/** Creates the cart only on a write — read paths never mint one. */
async function getOrCreateCartId(): Promise<string> {
  const existing = await getCartToken();
  if (existing) {
    const cart = await prisma.cart.findUnique({
      where: { token: existing },
      select: { id: true },
    });
    if (cart) {
      await prisma.cart.update({
        where: { id: cart.id },
        data: { lastSeenAt: new Date() },
      });
      return cart.id;
    }
  }

  const token = newToken();
  const cart = await prisma.cart.create({ data: { token }, select: { id: true } });
  await setCartCookie(token);
  return cart.id;
}

/**
 * Refresh everything under the locale layout.
 *
 * The mini-cart is server-rendered into the header on every page, so a
 * narrower revalidation would leave the badge stale on whichever page the
 * customer happened to be on when they added something. Next returns the fresh
 * RSC payload with the action response, so the header updates without a
 * navigation.
 */
function revalidateCart() {
  revalidatePath("/", "layout");
}

const addSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY).default(1),
});

export async function addToCart(input: unknown): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, isActive: true },
    select: { id: true, priceNet: true },
  });
  if (!product) return { ok: false, error: "product_unavailable" };

  const cartId = await getOrCreateCartId();

  // Adding an existing line increments it rather than creating a duplicate.
  await prisma.cartLine.upsert({
    where: { cartId_productId: { cartId, productId: product.id } },
    update: { quantity: { increment: parsed.data.quantity } },
    create: {
      cartId,
      productId: product.id,
      quantity: parsed.data.quantity,
      addedPriceNet: product.priceNet,
    },
  });

  revalidateCart();
  return { ok: true, added: parsed.data.quantity };
}

/**
 * Buy now — add and go straight to checkout.
 *
 * For the customer who wants one thing. Making them add to cart, find the
 * cart, and then find checkout is three clicks to buy a €9 drill bit, and it
 * is where single-item orders get abandoned.
 *
 * It genuinely adds the line rather than opening a parallel "instant" flow:
 * checkout, postage and the order snapshot all read the cart, so a second path
 * would be a second place for the total to be computed — and to disagree.
 */
export async function buyNow(input: unknown): Promise<CartActionResult> {
  // Validated against the real locales, not `z.string()`: this value is handed
  // straight to `redirect`, and "de" would route to a page that does not exist.
  const parsed = z.object({ locale: z.enum(routing.locales).optional() }).safeParse(input);
  const result = await addToCart(input);
  if (!result.ok) return result;

  // Outside any try/catch — `redirect` works by throwing. next-intl's wrapper
  // is not typed `never`, hence the unreachable throw below.
  redirect({
    href: "/checkout",
    locale: (parsed.success && parsed.data.locale) || routing.defaultLocale,
  });
  throw new Error("unreachable");
}

const updateSchema = z.object({
  lineId: z.string().min(1).max(64),
  quantity: z.coerce.number().int().min(0).max(MAX_QUANTITY),
});

export async function updateCartLine(input: unknown): Promise<CartActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const token = await getCartToken();
  if (!token) return { ok: false, error: "no_cart" };

  // Scoped by cart token: a line id alone must not be enough to edit someone
  // else's cart.
  const line = await prisma.cartLine.findFirst({
    where: { id: parsed.data.lineId, cart: { token } },
    select: { id: true },
  });
  if (!line) return { ok: false, error: "line_not_found" };

  if (parsed.data.quantity === 0) {
    await prisma.cartLine.delete({ where: { id: line.id } });
  } else {
    await prisma.cartLine.update({
      where: { id: line.id },
      data: { quantity: parsed.data.quantity },
    });
  }

  revalidateCart();
  return { ok: true };
}

export async function removeCartLine(lineId: string): Promise<CartActionResult> {
  return updateCartLine({ lineId, quantity: 0 });
}

export async function clearCart(): Promise<CartActionResult> {
  const token = await getCartToken();
  if (!token) return { ok: true };

  await prisma.cartLine.deleteMany({ where: { cart: { token } } });
  revalidateCart();
  return { ok: true };
}

const optionsSchema = z.object({
  shippingMethod: z.string().max(32).optional(),
  paymentMethod: z.string().max(32).optional(),
});

export async function setCartOptions(input: unknown): Promise<CartActionResult> {
  const parsed = optionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const token = await getCartToken();
  if (!token) return { ok: false, error: "no_cart" };

  // Reject anything not on the offered list rather than storing it and
  // discovering the problem at checkout.
  const shipping = SHIPPING_METHODS.find((m) => m.id === parsed.data.shippingMethod);
  const payment = PAYMENT_METHODS.find((m) => m.id === parsed.data.paymentMethod);

  await prisma.cart.update({
    where: { token },
    data: {
      ...(shipping ? { shippingMethod: shipping.id } : {}),
      ...(payment ? { paymentMethod: payment.id } : {}),
    },
  });

  revalidateCart();
  return { ok: true };
}

/**
 * Quick order: a pasted list of SKUs.
 *
 * Splits on commas, semicolons, tabs and newlines, matches each token against
 * CODE / CODE1 / CODE2 through `searchKey`, and reports back which ones it
 * could not find — silently dropping unknown codes from a 40-line paste is how
 * an order goes out short.
 */
const pasteSchema = z.object({ text: z.string().min(1).max(20_000) });

export async function addSkusToCart(input: unknown): Promise<CartActionResult> {
  const parsed = pasteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const tokens = [
    ...new Set(
      parsed.data.text
        .split(/[\n,;\t]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 200),
    ),
  ];
  if (tokens.length === 0) return { ok: false, error: "empty" };

  const keys = tokens.map((t) => searchKey(t));
  const candidates = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { code: { in: tokens } },
        { code1: { in: tokens } },
        { code2: { in: tokens } },
        { searchKey: { in: keys } },
      ],
    },
    select: { id: true, code: true, code1: true, code2: true, priceNet: true },
  });

  const byCode = new Map<string, (typeof candidates)[number]>();
  for (const product of candidates) {
    for (const code of [product.code, product.code1, product.code2]) {
      if (code) byCode.set(searchKey(code), product);
    }
  }

  const matched: typeof candidates = [];
  const notFound: string[] = [];
  for (const token of tokens) {
    const hit = byCode.get(searchKey(token));
    if (hit) matched.push(hit);
    else notFound.push(token);
  }

  if (matched.length === 0) return { ok: false, error: "no_matches" };

  const cartId = await getOrCreateCartId();
  for (const product of matched) {
    await prisma.cartLine.upsert({
      where: { cartId_productId: { cartId, productId: product.id } },
      update: { quantity: { increment: 1 } },
      create: { cartId, productId: product.id, quantity: 1, addedPriceNet: product.priceNet },
    });
  }

  revalidateCart();
  return { ok: true, added: matched.length, notFound };
}

/**
 * Coupons.
 *
 * The `Coupon` model is Phase 5. Until it exists this stores nothing and says
 * so — accepting a code and silently ignoring it would look like it worked.
 */
export async function applyCoupon(): Promise<CartActionResult> {
  return { ok: false, error: "coupons_not_available" };
}
