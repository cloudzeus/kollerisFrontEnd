import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { grossAmount, netAmount } from "@/lib/format";
import { discountedNet, offerBadgeFor } from "@/lib/offers/badges";
import { type ParcelItem } from "@/lib/shipping/acs-tariff";
import { quoteLivePostage } from "@/lib/shipping/acs-live";
import {
  FREE_SHIPPING_THRESHOLD_NET,
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  type CartLineView,
  type CartTotals,
  type CartView,
  type PaymentMethodId,
  type MiniCartSummary,
  type ShippingMethodId,
} from "@/lib/cart/options";

export * from "@/lib/cart/options";

/**
 * Cart reads.
 *
 * Every amount here is computed from the CURRENT product row, never from
 * anything the client sent or anything stored on the line. A cart left open
 * overnight re-prices itself on the next render — which is the only way the
 * total on screen can be trusted to match what checkout will charge.
 */

export const CART_COOKIE = "KOLLERIS_CART";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function newToken() {
  return randomBytes(24).toString("base64url");
}

function num(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reads the cart cookie WITHOUT creating anything.
 *
 * Read paths must never mint a cart: doing so would set a cookie on every
 * crawler hit and fill the table with empty rows. Creation happens only in the
 * write path (`getOrCreateCartId` in actions).
 */
export const getCartToken = cache(async (): Promise<string | null> => {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
});

export async function setCartCookie(token: string) {
  const store = await cookies();
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

export { newToken };

/** Line count for the header badge — one small query, no totals. */
export const getCartCount = cache(async (): Promise<number> => {
  const token = await getCartToken();
  if (!token) return 0;
  const result = await prisma.cartLine.aggregate({
    where: { cart: { token } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
});

/**
 * @param postcode Delivery postcode when known (checkout). Before it is known
 *   the cart quotes the mainland zone and labels the figure as indicative —
 *   quoting the cheapest zone would mean the total goes UP at checkout, which
 *   is the one direction a total must never move by surprise.
 */
export const getCart = cache(async (
  locale: Locale,
  postcode?: string | null,
): Promise<CartView | null> => {
  const token = await getCartToken();
  if (!token) return null;

  const cart = await prisma.cart.findUnique({
    where: { token },
    include: {
      lines: {
        orderBy: { createdAt: "asc" },
        include: {
          product: {
            include: {
              images: { where: { isFeature: true }, take: 1, select: { url: true } },
              translations: { select: { locale: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!cart) return null;

  const mtrmarks = cart.lines
    .map((l) => l.product.mtrmark)
    .filter((m): m is number => m != null);
  const brandRows = mtrmarks.length
    ? await prisma.brand.findMany({
        where: { mtrmark: { in: mtrmarks } },
        select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
      })
    : [];
  // Το slug χρειάζεται χωριστά από το όνομα: η κάλυψη καμπάνιας ανά μάρκα
  // ταιριάζει σε slug, ενώ η γραμμή δείχνει το όνομα.
  const brandSlugs = new Map(brandRows.map((b) => [b.mtrmark!, b.slug]));
  const brands = new Map(
    brandRows.map((b) => [
      b.mtrmark!,
      locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl,
    ]),
  );

  const lines: CartLineView[] = await Promise.all(
    cart.lines.map(async (line) => {
    const p = line.product;
    const unitNet = num(p.priceNet);
    const listNet = num(p.priceList);
    const vatRate = num(p.vatRate) || 24;
    const availableQty = Math.floor(num(p.qty));
    const translated = p.translations.find((t) => t.locale === locale)?.name;

    /*
     * Η έκπτωση λύνεται ΕΔΩ, όχι στην οθόνη.
     * ───────────────────────────────────────────────────────────────────────
     * Το καλάθι είναι το ένα σημείο που ξέρει τι πληρώνεται. Αν η έκπτωση
     * υπολογιζόταν στην κάρτα και στη σελίδα ξεχωριστά, η τιμή που διαφημίζεται
     * και η τιμή που χρεώνεται θα ήταν δύο διαφορετικοί υπολογισμοί που απλώς
     * συμφωνούν σήμερα.
     */
    const offer = await offerBadgeFor(
      {
        slug: p.slug,
        brandSlug: p.mtrmark != null ? (brandSlugs.get(p.mtrmark) ?? null) : null,
        unitNet,
      },
      locale,
    );
    const discountPercent = offer?.discountPercent ?? 0;
    const unitNetFinal = discountedNet(unitNet, discountPercent);

    return {
      id: line.id,
      productId: p.id,
      slug: p.slug,
      /* ΟΛΟΚΛΗΡΟ το όνομα, με το νούμερο μέσα. Στη λίστα η κάρτα εκπροσωπεί
         την ομάδα και το νούμερο αφαιρείται· εδώ η γραμμή είναι ένα
         συγκεκριμένο ζευγάρι, και το νούμερο είναι ό,τι πιο σημαντικό έχει. */
      name: translated?.trim() || p.name,
      /*
       * Ο κωδικός του ERP, όχι του κατασκευαστή.
       * ─────────────────────────────────────────────────────────────────────
       * Η σελίδα του προϊόντος δείχνει «ΚΩΔΙΚΟΣ 21191001258» και το καλάθι
       * έδειχνε «4932493714» για το ίδιο πράγμα: ο πελάτης έβλεπε δύο κωδικούς
       * και δεν ήξερε ποιον να πει στο τηλέφωνο. Ο κωδικός του ERP είναι αυτός
       * που μαζεύει η αποθήκη και αυτός που πάει στο παραστατικό — και σε
       * προϊόν με νούμερα είναι το ένα πράγμα που ξεχωρίζει το 42 από το 43.
       *
       * Ταξιδεύει και στη γραμμή της παραγγελίας: το `OrderLine.sku` παίρνει
       * αυτή την τιμή, οπότε το email και η λίστα συλλογής λένε τον ίδιο
       * κωδικό με τη σελίδα.
       */
      sku: p.code || p.code2,
      brandName: p.mtrmark != null ? (brands.get(p.mtrmark) ?? null) : null,
      image: p.images[0]?.url ?? null,
      quantity: line.quantity,
      unitNet,
      discountPercent,
      unitNetFinal,
      offerTitle: discountPercent > 0 ? (offer?.title ?? null) : null,
      offerHref: discountPercent > 0 ? (offer?.href ?? null) : null,
      unitListNet: listNet > unitNet ? listNet : null,
      vatRate,
      lineNet: netAmount(unitNetFinal * line.quantity),
      lineGross: grossAmount(unitNetFinal * line.quantity, { vatRate }),
      inStock: p.inStock,
      availableQty,
      overStock: p.inStock && availableQty > 0 && line.quantity > availableQty,
      weight: num(p.weight) || null,
      width: num(p.width) || null,
      length: num(p.length) || null,
      height: num(p.height) || null,
    };
    }),
  );

  const shippingMethod = (SHIPPING_METHODS.find((m) => m.id === cart.shippingMethod)?.id ??
    "courier") as ShippingMethodId;
  const paymentMethod = (PAYMENT_METHODS.find((m) => m.id === cart.paymentMethod)?.id ??
    "card") as PaymentMethodId;

  return {
    id: cart.id,
    lines,
    totals: await computeTotals(lines, shippingMethod, paymentMethod, postcode),
    shippingMethod,
    paymentMethod,
    couponCode: cart.couponCode,
  };
});

/**
 * Totals.
 *
 * VAT is summed per line, not applied once to the subtotal — lines can carry
 * different rates (24 / 13 / 6), and a single blended multiplier would be
 * quietly wrong for any mixed basket.
 */
export async function computeTotals(
  lines: CartLineView[],
  shippingMethodId: ShippingMethodId,
  paymentMethodId: PaymentMethodId,
  postcode?: string | null,
): Promise<CartTotals> {
  const subtotalNet = lines.reduce((sum, l) => sum + l.lineNet, 0);
  const subtotalGross = lines.reduce((sum, l) => sum + l.lineGross, 0);

  const savingsGross = lines.reduce((sum, l) => {
    if (l.unitListNet == null) return sum;
    const was = grossAmount(l.unitListNet * l.quantity, { vatRate: l.vatRate });
    return sum + Math.max(0, was - l.lineGross);
  }, 0);

  const shipping = SHIPPING_METHODS.find((m) => m.id === shippingMethodId)!;
  const freeShippingReached = subtotalNet >= FREE_SHIPPING_THRESHOLD_NET;
  const payment = PAYMENT_METHODS.find((m) => m.id === paymentMethodId)!;

  /*
   * Postage from the ACS tariff, priced on the real parcel: each line's weight
   * (SoftOne GWEIGHT) and dimensions, with volumetric weight taken when the box
   * is bulkier than it is heavy.
   */
  const parcel: ParcelItem[] = lines.map((line) => ({
    quantity: line.quantity,
    weight: line.weight,
    width: line.width,
    length: line.length,
    height: line.height,
  }));

  // Live from ACS, falling back to the local table when the courier cannot be
  // reached. Awaited inside `getCart`, which is already cached per request, so
  // one basket render costs at most one ACS round-trip.
  const quote =
    shipping.expressMultiplier > 0 ? await quoteLivePostage({ items: parcel, postcode }) : null;

  const quotedNet = quote ? round(quote.totalNet * shipping.expressMultiplier) : 0;
  const shippingNet =
    shipping.freeOverThreshold && freeShippingReached ? 0 : quotedNet;

  // No payment method carries a fee today — cash on delivery, the only one that
  // ever did, is not accepted. Kept as a field because the column exists and a
  // future surcharge would flow through here.
  const paymentFeeNet = payment.feeNet;

  // Shipping and fees are charged at the standard rate regardless of basket mix.
  const shippingGross = grossAmount(shippingNet, { vatRate: 24 });
  const paymentFeeGross = grossAmount(paymentFeeNet, { vatRate: 24 });

  const totalGross = round(subtotalGross + shippingGross + paymentFeeGross);
  const totalNet = round(subtotalNet + shippingNet + paymentFeeNet);

  return {
    postage: quote
      ? {
          zoneLabel: quote.zoneLabel,
          etaDays: quote.etaDays,
          chargeableKg: quote.chargeableKg,
          estimated: quote.estimated,
          carrier: shipping.carrier,
        }
      : null,
    itemCount: lines.length,
    unitCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotalNet: round(subtotalNet),
    subtotalGross: round(subtotalGross),
    savingsGross: round(savingsGross),
    shippingNet: round(shippingNet),
    shippingGross: round(shippingGross),
    paymentFeeNet: round(paymentFeeNet),
    paymentFeeGross: round(paymentFeeGross),
    vatAmount: round(totalGross - totalNet),
    totalGross,
    freeShippingRemaining: Math.max(0, round(FREE_SHIPPING_THRESHOLD_NET - subtotalNet)),
    freeShippingReached,
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Cross-sell that excludes what is already in the basket — done in SQL, not JS. */
export const getCartCrossSell = cache(
  async (locale: Locale, excludeProductIds: string[], limit = 4) => {
    const inCart = await prisma.product.findMany({
      where: { id: { in: excludeProductIds } },
      select: { mtrgroup: true, mtrcategory: true },
    });

    const groups = [...new Set(inCart.map((p) => p.mtrgroup).filter((g): g is number => g != null))];
    const categories = [
      ...new Set(inCart.map((p) => p.mtrcategory).filter((c): c is number => c != null)),
    ];

    const rows = await prisma.product.findMany({
      where: {
        isActive: true,
        inStock: true,
        priceNet: { gt: 0 },
        id: { notIn: excludeProductIds.length ? excludeProductIds : ["__none__"] },
        ...(groups.length
          ? { OR: [{ mtrgroup: { in: groups } }, { mtrcategory: { in: categories } }] }
          : {}),
      },
      orderBy: [{ onSale: "desc" }, { mtrl: "desc" }],
      take: limit,
      select: {
        id: true,
        slug: true,
        name: true,
        code: true,
        code2: true,
        mtrmark: true,
        priceNet: true,
        vatRate: true,
        images: { where: { isFeature: true }, take: 1, select: { url: true } },
        translations: { select: { locale: true, name: true } },
      },
    });

    const brandRows = await prisma.brand.findMany({
      where: { mtrmark: { in: rows.map((r) => r.mtrmark).filter((m): m is number => m != null) } },
      select: { mtrmark: true, nameEl: true, nameEn: true, nameIt: true },
    });
    const brands = new Map(
      brandRows.map((b) => [
        b.mtrmark!,
        locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl,
      ]),
    );

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.translations.find((t) => t.locale === locale)?.name?.trim() || row.name,
      // Ίδιο με τη γραμμή του καλαθιού: ένας κωδικός παντού.
      sku: row.code || row.code2,
      brandName: row.mtrmark != null ? (brands.get(row.mtrmark) ?? null) : null,
      image: row.images[0]?.url ?? null,
      priceNet: num(row.priceNet),
      vatRate: num(row.vatRate) || 24,
    }));
  },
);


/**
 * Header mini-cart, rendered on the server from the session cookie.
 *
 * Reading the cookie here makes every page carrying the header dynamic. That is
 * the deliberate trade: the basket is correct in the first HTML byte, with no
 * badge popping in after hydration and no client fetch on every page load.
 */
export const getMiniCart = cache(
  async (locale: Locale): Promise<MiniCartSummary | null> => {
    const cart = await getCart(locale);
    if (!cart || cart.lines.length === 0) return null;

    return {
      lines: cart.lines.slice(0, 8).map((line) => ({
        id: line.id,
        slug: line.slug,
        name: line.name,
        brandName: line.brandName,
        image: line.image,
        quantity: line.quantity,
        lineGross: line.lineGross,
      })),
      overflow: Math.max(0, cart.lines.length - 8),
      unitCount: cart.totals.unitCount,
      itemCount: cart.totals.itemCount,
      subtotalNet: cart.totals.subtotalNet,
      subtotalGross: cart.totals.subtotalGross,
      freeShippingRemaining: cart.totals.freeShippingRemaining,
      freeShippingReached: cart.totals.freeShippingReached,
    };
  },
);
