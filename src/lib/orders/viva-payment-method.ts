/**
 * Which SoftOne payment code a completed Viva payment deserves.
 *
 * The problem this solves is small to describe and easy to get wrong in a way
 * nobody notices for months: `Order.paymentMethod` is what the customer chose
 * at OUR checkout, and Viva's page then offers its own alternatives. A shopper
 * who selected "κάρτα" here and paid with IRIS there produced an order that
 * says card and a payment that was not. The ERP has a separate code for each —
 * 1025 κάρτα, 1024 IRIS, 1007 τραπεζική κατάθεση, 1027 PayPal — so the document
 * was going to be wrong about how the money arrived.
 *
 * ── What is known, and what is not ──────────────────────────────────────────
 *
 * Viva returns `paymentMethodId` on the transaction. The number for cards is
 * documented and stable. The number for IRIS is NOT something this codebase
 * has observed: the local environment is configured against Viva's demo, the
 * one real payment so far went through production, and reading it back needs
 * production credentials.
 *
 * So this does not guess. Known ids map; anything else falls back to what the
 * customer chose at checkout, which is the best available answer and the
 * behaviour that existed before. Every unmapped id is logged with the order it
 * came from, so the first payment through a new method names its own number
 * rather than a plausible constant sitting here being wrong.
 *
 * `VIVA_PAYMENT_METHOD_IRIS` and its siblings exist so that number can be set
 * the moment it is observed, without a deployment.
 */

/** Viva's own identifier for a card payment. */
const CARD_IDS = new Set(
  (process.env.VIVA_PAYMENT_METHOD_CARD ?? "0,4,19,23,24")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite),
);

/** Set once observed. Empty means "we have never seen an IRIS payment". */
const IRIS_IDS = new Set(
  (process.env.VIVA_PAYMENT_METHOD_IRIS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite),
);

/**
 * PayPal, and bank transfer chosen inside Viva's page.
 *
 * Both are offered there regardless of what the customer picked here, and both
 * have their own ERP code — PayPal 1027, τραπεζική 1007. Empty by default for
 * the same reason as IRIS: the ids are not documented in this codebase and a
 * plausible constant that is wrong is worse than a fallback that is honest.
 */
const PAYPAL_IDS = new Set(
  (process.env.VIVA_PAYMENT_METHOD_PAYPAL ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite),
);

const BANK_IDS = new Set(
  (process.env.VIVA_PAYMENT_METHOD_BANK ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite),
);

export type ResolvedPaymentMethod = {
  /** What to tell the ERP: "card" | "iris" | "bank" | "paypal". */
  method: string;
  /** True when Viva's own id decided it, rather than the checkout choice. */
  fromViva: boolean;
};

/**
 * @param chosen  `Order.paymentMethod` — what the customer selected here.
 * @param vivaId  `Order.vivaPaymentMethodId` — what Viva reported, if anything.
 */
export function resolvePaymentMethod(
  chosen: string,
  vivaId: number | null | undefined,
  orderNumber?: string,
): ResolvedPaymentMethod {
  if (vivaId == null) return { method: chosen, fromViva: false };

  if (IRIS_IDS.has(vivaId)) return { method: "iris", fromViva: true };
  if (PAYPAL_IDS.has(vivaId)) return { method: "paypal", fromViva: true };
  if (BANK_IDS.has(vivaId)) return { method: "bank", fromViva: true };
  if (CARD_IDS.has(vivaId)) return { method: "card", fromViva: true };

  /*
   * An id we do not recognise. The checkout choice stands — it is a real
   * answer rather than a made-up one — and the id is named in the log so it
   * can be added to the configuration instead of being rediscovered.
   */
  console.warn(
    `[viva-payment-method] unmapped paymentMethodId=${vivaId}` +
      (orderNumber ? ` on ${orderNumber}` : "") +
      ` — falling back to the checkout choice "${chosen}". ` +
      "Set VIVA_PAYMENT_METHOD_IRIS / _PAYPAL / _BANK / _CARD once it is identified.",
  );
  return { method: chosen, fromViva: false };
}
