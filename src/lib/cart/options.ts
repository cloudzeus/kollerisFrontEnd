/**
 * Cart options and view types.
 *
 * Separate from `cart.ts` (which is `server-only`, because it touches Prisma
 * and cookies) so the summary panel and line rows — both client components —
 * can import the same constants without dragging `node:crypto` and
 * `next/headers` into the browser bundle.
 */

/** Free-shipping threshold on the NET subtotal. Moves to `SiteSetting` in Phase 3. */
export const FREE_SHIPPING_THRESHOLD_NET = 150;

/**
 * Shipping and payment options.
 *
 * Hardcoded until the `ShippingMethod` / `PaymentMethod` models and their admin
 * screens land (Phase 5). Costs are NET; VAT is applied with everything else.
 */
/**
 * Shipping methods.
 *
 * `courier` and `express` are priced by the ACS tariff engine from the parcel's
 * chargeable weight and the destination zone — see `src/lib/shipping/acs-tariff.ts`.
 * `expressMultiplier` is applied on top of the standard quote.
 */
export const SHIPPING_METHODS = [
  {
    id: "courier",
    label: "ACS Courier",
    meta: "Πανελλαδικά",
    carrier: "ACS",
    expressMultiplier: 1,
    freeOverThreshold: true,
  },
  {
    id: "express",
    label: "ACS Express",
    meta: "Παράδοση έως 12:00 την επόμενη",
    carrier: "ACS",
    expressMultiplier: 1.9,
    freeOverThreshold: false,
  },
  {
    id: "pickup",
    label: "Παραλαβή από Πειραιά",
    meta: "Έτοιμη σε 2 ώρες",
    carrier: null,
    expressMultiplier: 0,
    freeOverThreshold: true,
  },
] as const;

export const PAYMENT_METHODS = [
  { id: "card", label: "Κάρτα", feeNet: 0, partnerOnly: false },
  { id: "iris", label: "IRIS", feeNet: 0, partnerOnly: false },
  { id: "bank", label: "Τραπεζική κατάθεση", feeNet: 0, partnerOnly: false },
  // Cash on delivery is NOT offered. Kolleris does not accept it (client,
  // 2026-07-31), and it was listed here — with a 2.50 € net ACS fee — until
  // that came to light. Do not reinstate without the fee, the FAQ answer and
  // the SoftOne expense code all going back together.
  { id: "credit", label: "Επί πιστώσει", feeNet: 0, partnerOnly: true },
] as const;

export type ShippingMethodId = (typeof SHIPPING_METHODS)[number]["id"];
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

export type CartLineView = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  sku: string;
  brandName: string | null;
  image: string | null;
  quantity: number;
  /** Live unit price, net. */
  unitNet: number;
  unitListNet: number | null;
  vatRate: number;
  lineNet: number;
  lineGross: number;
  inStock: boolean;
  availableQty: number;
  /** True when the line asks for more than the warehouse currently holds. */
  overStock: boolean;
  /** Shipping inputs, from SoftOne GWEIGHT / DIM1-3. */
  weight: number | null;
  width: number | null;
  length: number | null;
  height: number | null;
};

export type CartTotals = {
  /** How the postage was priced, for the "why this cost" line. */
  postage: {
    zoneLabel: string;
    etaDays: string;
    chargeableKg: number;
    estimated: boolean;
    carrier: string | null;
  } | null;
  itemCount: number;
  unitCount: number;
  subtotalNet: number;
  subtotalGross: number;
  savingsGross: number;
  shippingNet: number;
  shippingGross: number;
  paymentFeeNet: number;
  paymentFeeGross: number;
  vatAmount: number;
  totalGross: number;
  freeShippingRemaining: number;
  freeShippingReached: boolean;
};

export type CartView = {
  id: string;
  lines: CartLineView[];
  totals: CartTotals;
  shippingMethod: ShippingMethodId;
  paymentMethod: PaymentMethodId;
  couponCode: string | null;
};

export type CrossSellItem = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  brandName: string | null;
  image: string | null;
  priceNet: number;
  vatRate: number;
};

export type MiniCartSummary = {
  lines: Array<{
    id: string;
    slug: string;
    name: string;
    brandName: string | null;
    image: string | null;
    quantity: number;
    lineGross: number;
  }>;
  overflow: number;
  unitCount: number;
  itemCount: number;
  subtotalNet: number;
  /** Goods only — excludes shipping, which is not chosen yet at this point. */
  subtotalGross: number;
  freeShippingRemaining: number;
  freeShippingReached: boolean;
};
