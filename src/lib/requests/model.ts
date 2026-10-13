import { z } from "zod";
import { grossAmount, netAmount } from "@/lib/format";
import { vatRateForDestination } from "@/lib/shipping/vat";

/**
 * Back-order requests («Κατόπιν παραγγελίας») — the pure half.
 *
 * Contract: docs/backorder-requests.md, shared with HDCtool and the Milwaukee
 * shop. Nothing in here touches the database, the network or the clock, so the
 * same rules run in the cart (client), the checkout action (server), the
 * webhook and the tests — and cannot drift apart between them.
 */

export const REQUEST_STATUSES = [
  "REQUESTED",
  "OFFERED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "REJECTED",
] as const;
export type RequestStatusName = (typeof REQUEST_STATUSES)[number];

/** How long staff have to answer — what the customer is told everywhere. */
export const REQUEST_ANSWER_HOURS = 24;
/** An offer with no `expiresAt` lives this long (contract §4). */
export const DEFAULT_OFFER_DAYS = 3;
/** An unanswered offer gets its one reminder after this long. */
export const OFFER_REMINDER_HOURS = 24;

// ── Classification ──────────────────────────────────────────────────────────

/** The stock facts a cart line already carries (`CartLineView`). */
export type StockFacts = {
  inStock: boolean;
  availableQty: number;
  quantity: number;
};

/**
 * A line the warehouse cannot fill as asked: nothing in stock, or more than
 * there is. The whole line goes to the request — a split quantity would be two
 * deliveries and two documents for one product, which nobody asked for.
 */
export function isOnRequest(line: StockFacts): boolean {
  if (!line.inStock) return true;
  if (!(line.availableQty > 0)) return true;
  return line.quantity > line.availableQty;
}

export type CartSplitKind = "none" | "all" | "mixed";

export type CartSplit<T> = {
  /** Lines that can be paid and shipped now. */
  ready: T[];
  /** Lines that become the request. */
  onRequest: T[];
  /** none: an ordinary order · all: the whole cart is a request · mixed: the customer chooses. */
  kind: CartSplitKind;
};

export function splitCart<T extends StockFacts>(lines: readonly T[]): CartSplit<T> {
  const ready: T[] = [];
  const onRequest: T[] = [];
  for (const line of lines) (isOnRequest(line) ? onRequest : ready).push(line);
  const kind: CartSplitKind =
    onRequest.length === 0 ? "none" : ready.length === 0 ? "all" : "mixed";
  return { ready, onRequest, kind };
}

/**
 * What a mixed cart becomes.
 *   split     the in-stock lines are paid and shipped now, the rest is a request
 *   together  the whole cart is one request
 */
export type RequestMode = "split" | "together";

export function parseRequestMode(raw: unknown): RequestMode | null {
  return raw === "split" || raw === "together" ? raw : null;
}

/**
 * Which lines are paid now and which are requested — decided on the SERVER,
 * from stock it has just read. The client's choice of mode is taken; its idea
 * of which line is in stock never is.
 */
export function planCheckout<T extends StockFacts>(
  lines: readonly T[],
  mode: RequestMode | null,
):
  | { ok: true; pay: T[]; request: T[] }
  | { ok: false; reason: "mode_required" } {
  const split = splitCart(lines);
  if (split.kind === "none") return { ok: true, pay: [...lines], request: [] };
  if (split.kind === "all") return { ok: true, pay: [], request: [...lines] };
  if (mode === "together") return { ok: true, pay: [], request: [...lines] };
  if (mode === "split") return { ok: true, pay: split.ready, request: split.onRequest };
  return { ok: false, reason: "mode_required" };
}

/**
 * A request that has not been accepted cannot be paid, and an unpaid order is
 * never a document. ACCEPTED is the one request state a payment may follow.
 */
export function requestBlocksPayment(status: string | null | undefined): boolean {
  return status != null && status !== "ACCEPTED";
}

/** The contract's own words: REQUESTED/OFFERED/REJECTED/DECLINED/EXPIRED never reach SoftOne. */
export function requestBlocksErp(order: {
  requestStatus?: string | null;
  paymentStatus: string;
}): boolean {
  if (order.requestStatus == null) return false;
  return order.requestStatus !== "ACCEPTED" || order.paymentStatus !== "PAID";
}

// ── The request snapshot ────────────────────────────────────────────────────

/** One requested line, frozen at submission. `lineId` is what the offer refers to. */
export type RequestLine = {
  lineId: string;
  productId: string | null;
  mtrl: number | null;
  sku: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  qty: number;
  /** Net unit price the customer was shown, after any campaign discount. */
  unitNet: number;
  vatRate: number;
  /** Our stock when the request was made; null when unknown. */
  stockAtRequest: number | null;
};

export type RequestSnapshot = {
  v: 1;
  /** The language the customer used — the link in every email opens in it. */
  locale: string;
  lines: RequestLine[];
};

export function readSnapshot(value: unknown): RequestSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<RequestSnapshot>;
  if (!Array.isArray(v.lines)) return null;
  return { v: 1, locale: typeof v.locale === "string" ? v.locale : "el", lines: v.lines };
}

// ── The offer (HDCtool → eshop, contract §4) ───────────────────────────────

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const offerLineSchema = z.object({
  kind: z.enum(["original", "modified", "alternative"]),
  replacesLineId: text(64),
  mtrl: z.number().int(),
  sku: z.string().trim().max(64),
  name: z.string().trim().min(1).max(500),
  qty: z.number().int().positive().max(100_000),
  unitNet: z.number().nonnegative().max(10_000_000),
  vatRate: z.number().min(0).max(100),
  leadTimeText: text(200),
});

const orderNumber = z.string().trim().min(3).max(32);
const offerVersion = z.number().int().positive().max(1_000_000);

export const offerWebhookSchema = z.discriminatedUnion("decision", [
  z.object({
    orderNumber,
    offerVersion,
    decision: z.literal("offer"),
    lines: z.array(offerLineSchema).min(1).max(500),
    removedLineIds: z.array(z.string().max(64)).max(500).nullish().transform((v) => v ?? []),
    leadTimeText: text(200),
    shippingNet: z.number().nonnegative().max(100_000).nullish().transform((v) => v ?? null),
    note: text(4000),
    expiresAt: z.iso.datetime({ offset: true }).nullish().transform((v) => v ?? null),
  }),
  z.object({
    orderNumber,
    offerVersion,
    decision: z.literal("reject"),
    reason: text(4000),
  }),
]);

export type OfferWebhookBody = z.infer<typeof offerWebhookSchema>;
export type OfferMessage = Extract<OfferWebhookBody, { decision: "offer" }>;
export type OfferLine = OfferMessage["lines"][number];

/** What is kept in `orders.offerJson` — the latest message, as received and validated. */
export type StoredOffer =
  | {
      decision: "offer";
      version: number;
      receivedAt: string;
      lines: OfferLine[];
      removedLineIds: string[];
      leadTimeText: string | null;
      note: string | null;
      /** Staff's shipping, when they set one. */
      shippingNet: number | null;
      /** The shop's own ACS quote, when staff did not — computed once, on receipt. */
      quotedShippingNet: number | null;
      expiresAt: string;
    }
  | {
      decision: "reject";
      version: number;
      receivedAt: string;
      reason: string | null;
    };

export function readStoredOffer(value: unknown): StoredOffer | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { decision?: unknown };
  if (v.decision === "offer" || v.decision === "reject") return value as StoredOffer;
  return null;
}

/** Every line reference in the offer must name a requested line. */
export function unknownLineRefs(offer: OfferMessage, requested: readonly RequestLine[]): string[] {
  const ids = new Set(requested.map((l) => l.lineId));
  const refs = [
    ...offer.lines.map((l) => l.replacesLineId).filter((id): id is string => id != null),
    ...offer.removedLineIds,
  ];
  return [...new Set(refs.filter((id) => !ids.has(id)))];
}

export function offerExpiry(expiresAt: string | null, now: Date): Date {
  if (expiresAt) {
    const at = new Date(expiresAt);
    if (!Number.isNaN(at.getTime())) return at;
  }
  return new Date(now.getTime() + DEFAULT_OFFER_DAYS * 86_400_000);
}

// ── Money ───────────────────────────────────────────────────────────────────

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type PricedLine = { qty: number; unitNet: number; vatRate: number };

export type OfferTotals = {
  lines: Array<{ lineNet: number; lineGross: number; unitGross: number }>;
  subtotalNet: number;
  subtotalGross: number;
  shippingNet: number;
  shippingGross: number;
  vatAmount: number;
  totalGross: number;
};

/**
 * The same arithmetic as the cart (`computeTotals`): VAT per line, shipping at
 * the standard rate, VAT as the difference. Used for the offer page, the email
 * and — what matters — the amount the Viva order is created for.
 */
export function priceLines(
  lines: readonly PricedLine[],
  shippingNet: number,
  /** The delivery country, for the postage VAT (`vatRateForDestination`). */
  country?: string | null,
): OfferTotals {
  const priced = lines.map((l) => {
    const lineNet = netAmount(l.unitNet * l.qty);
    const lineGross = grossAmount(l.unitNet * l.qty, { vatRate: l.vatRate });
    return { lineNet, lineGross, unitGross: l.qty > 0 ? lineGross / l.qty : 0 };
  });
  const subtotalNet = round(priced.reduce((s, l) => s + l.lineNet, 0));
  const subtotalGross = round(priced.reduce((s, l) => s + l.lineGross, 0));
  const ship = round(Math.max(0, shippingNet));
  const shippingGross = grossAmount(ship, { vatRate: vatRateForDestination(country) });
  const totalGross = round(subtotalGross + shippingGross);
  const totalNet = round(subtotalNet + ship);
  return {
    lines: priced,
    subtotalNet,
    subtotalGross,
    shippingNet: ship,
    shippingGross,
    vatAmount: round(totalGross - totalNet),
    totalGross,
  };
}

/** The shipping an offer is charged: staff's figure, else the quote taken on receipt. */
export function offerShippingNet(offer: Extract<StoredOffer, { decision: "offer" }>): number | null {
  if (offer.shippingNet != null) return offer.shippingNet;
  if (offer.quotedShippingNet != null) return offer.quotedShippingNet;
  return null;
}

// ── Requested vs offered ───────────────────────────────────────────────────

export type ComparisonRow =
  | {
      kind: "same" | "modified";
      requested: RequestLine;
      offered: OfferLine;
      qtyChanged: boolean;
      priceChanged: boolean;
    }
  | { kind: "alternative"; requested: RequestLine | null; offered: OfferLine }
  | { kind: "added"; offered: OfferLine }
  | { kind: "removed"; requested: RequestLine };

const priceDiffers = (a: number, b: number) => Math.abs(a - b) >= 0.005;

/**
 * Lines side by side, in the order the customer asked for them.
 *
 * An offered line belongs to a requested one through `replacesLineId`; an
 * `original` (HDCtool sends those without one) is matched by MTRL. `modified`
 * is HDCtool's word for a changed quantity or price — the comparison below
 * also checks both itself, so a lead time alone never reads as a change. A requested line the offer does not
 * mention is shown removed whether or not HDCtool listed it in `removedLineIds`
 * — it is not in the offer, so it will not be in the order.
 */
export function compareOffer(
  requested: readonly RequestLine[],
  offered: readonly OfferLine[],
): ComparisonRow[] {
  const byRequest = new Map<string, OfferLine[]>();
  const loose: OfferLine[] = [];
  const claimed = new Set<string>();

  for (const line of offered) {
    if (line.replacesLineId && requested.some((r) => r.lineId === line.replacesLineId)) {
      const list = byRequest.get(line.replacesLineId) ?? [];
      list.push(line);
      byRequest.set(line.replacesLineId, list);
      claimed.add(line.replacesLineId);
    } else {
      loose.push(line);
    }
  }

  // `original` lines without a reference: match by MTRL to an unclaimed request line.
  const unmatched: OfferLine[] = [];
  for (const line of loose) {
    const match =
      line.kind !== "alternative"
        ? requested.find((r) => !claimed.has(r.lineId) && r.mtrl != null && r.mtrl === line.mtrl)
        : undefined;
    if (match) {
      byRequest.set(match.lineId, [line]);
      claimed.add(match.lineId);
    } else {
      unmatched.push(line);
    }
  }

  const rows: ComparisonRow[] = [];
  for (const req of requested) {
    const lines = byRequest.get(req.lineId);
    if (!lines || lines.length === 0) {
      rows.push({ kind: "removed", requested: req });
      continue;
    }
    for (const off of lines) {
      if (off.kind === "alternative" || (off.mtrl !== req.mtrl && req.mtrl != null)) {
        rows.push({ kind: "alternative", requested: req, offered: off });
        continue;
      }
      const qtyChanged = off.qty !== req.qty;
      const priceChanged = priceDiffers(off.unitNet, req.unitNet);
      rows.push({
        kind: qtyChanged || priceChanged ? "modified" : "same",
        requested: req,
        offered: off,
        qtyChanged,
        priceChanged,
      });
    }
  }
  /*
   * Lines that replace nothing. HDCtool sends a product staff ADDED
   * («Προσθήκη προϊόντος») as `alternative` without `replacesLineId` — an extra
   * line, not a substitute, so it is shown «Προσθήκη», never «αντί για …».
   */
  for (const off of unmatched) rows.push({ kind: "added", offered: off });
  return rows;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

/** base64url of 32 random bytes is 43 characters; anything else is not ours. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

/** `/aitima/{token}` with the locale prefix the shop uses (Greek unprefixed). */
export function requestPath(locale: string, token: string): string {
  const prefix = locale && locale !== "el" ? `/${locale}` : "";
  return `${prefix}/aitima/${encodeURIComponent(token)}`;
}

// ── Admin wording (Greek; the back office is Greek-only) ───────────────────

export const REQUEST_STATUS_LABEL_EL: Record<RequestStatusName, string> = {
  REQUESTED: "Αναμένει πρόταση",
  OFFERED: "Πρόταση στον πελάτη",
  ACCEPTED: "Αποδεκτή",
  DECLINED: "Απορρίφθηκε από τον πελάτη",
  EXPIRED: "Η πρόταση έληξε",
  REJECTED: "Απορρίφθηκε από το κατάστημα",
};

export const REQUEST_STATUS_TONE: Record<RequestStatusName, "amber" | "blue" | "green" | "red" | "grey"> = {
  REQUESTED: "amber",
  OFFERED: "blue",
  ACCEPTED: "green",
  DECLINED: "grey",
  EXPIRED: "grey",
  REJECTED: "red",
};

/** An OFFERED request whose offer has run out — before the sweep has said so. */
export function offerHasExpired(
  order: { requestStatus: string | null; offerExpiresAt: Date | null },
  now: number = Date.now(),
): boolean {
  return order.requestStatus === "OFFERED" && (!order.offerExpiresAt || order.offerExpiresAt.getTime() <= now);
}
