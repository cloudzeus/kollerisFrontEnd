import "server-only";
import { HdctoolError, hdctoolRequest } from "@/lib/hdctool/client";
import { quoteLivePostage, type LivePostageResult } from "@/lib/shipping/acs-live";
import { chargeableWeight, type ParcelItem } from "@/lib/shipping/acs-tariff";
import { HOME_COUNTRY, isDhlCountry, validateCountryPostcode } from "@/lib/shipping/countries";
import { vatRateForDestination } from "@/lib/shipping/vat";

/**
 * Postage for any destination, whoever carries it. docs/dhl-express.md §1, §4.
 *
 *   GR      → ACS, `quoteLivePostage` exactly as before (table on an outage)
 *   CY      → ACS through HDCtool with `country: "CY"`; no table abroad
 *   EU rest → DHL Express, priced by HDCtool (`POST /api/public/courier/quote`
 *             with `country`). The shop never talks to DHL.
 *
 * ── Three kinds of answer from DHL ─────────────────────────────────────────
 * A price. A refusal about the place — 422 `unserviceable_postcode`,
 * `unsupported_country`, `invalid_postcode` — which is shown on the Τ.Κ. field
 * and never priced from a table (the same rule as the ACS no-station fix,
 * 43abb07). A 400 (no city, a weight HDCtool rejects) is shown on the form
 * the same way. And no answer — a 5xx (502 DHL failure), a timeout (504),
 * HDCtool down — which blocks
 * checkout for that destination with «δοκιμάστε ξανά»: there is no table for
 * Italy, and a guessed price abroad is a loss or a lost sale.
 */

export type DhlRefusalCode =
  | "unserviceable_postcode"
  | "unsupported_country"
  | "invalid_postcode"
  /** HDCtool's 400 (missing city, invalid weight): something on the form to fix. */
  | "invalid_address";

const REFUSAL_CODES: readonly DhlRefusalCode[] = [
  "unserviceable_postcode",
  "unsupported_country",
  "invalid_postcode",
];

export type DhlQuote = {
  source: "dhl";
  carrier: "DHL";
  productCode: string;
  productName: string;
  /** Net EUR — named like the ACS quote's so the cart reads both the same way. */
  totalNet: number;
  /** The same figure under the contract's name (§1, §2). */
  netAmount: number;
  /** From `vatRateForDestination`, not from the answer. */
  vatRate: number;
  grossAmount: number;
  currency: "EUR";
  transitDays: number | null;
  estimatedDeliveryDate: string | null;
  /** «2–3» — the working days promised to the customer. */
  etaDays: string;
  etaMin: number;
  etaMax: number;
  chargeableKg: number;
  estimated: boolean;
  /** `dhl-live` or `dhl-mock`, as HDCtool said. */
  origin: string;
  quotedAt: string;
  country: string;
  postcode: string;
};

export type DhlRefusal = {
  source: "refused";
  error: DhlRefusalCode;
  /** HDCtool's own words, for the log; the customer gets the shop's copy. */
  message: string;
  country: string;
  postcode: string;
};

export type QuoteUnavailable = {
  source: "unavailable";
  reason: string;
  country: string;
  /** No postcode typed yet — nothing has failed, there is just nothing to price. */
  pending?: boolean;
};

export type DhlResult = DhlQuote | DhlRefusal | QuoteUnavailable;
export type DestinationQuote = LivePostageResult | DhlResult;

export const isDhlQuote = (q: DestinationQuote | null | undefined): q is DhlQuote =>
  q?.source === "dhl";
export const isRefused = (q: DestinationQuote | null | undefined): q is DhlRefusal =>
  q?.source === "refused";
export const isQuoteUnavailable = (q: DestinationQuote | null | undefined): q is QuoteUnavailable =>
  q?.source === "unavailable";

type DhlQuoteResponse = {
  success?: boolean;
  carrier?: string;
  productCode?: string;
  productName?: string;
  netAmount?: number | string;
  vatRate?: number;
  grossAmount?: number | string;
  currency?: string;
  estimatedDeliveryDate?: string | null;
  transitDays?: number | null;
  source?: string;
  error?: string;
  message?: string;
};

/*
 * A quote is asked for twice in one checkout — by the form while the customer
 * types, and by the action that places the order — and HDCtool caches for an
 * hour anyway. Ten minutes here saves the second round-trip without letting a
 * stale price outlive a visit. Successful answers only.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; quote: DhlQuote }>();

/** For the tests. */
export function clearDhlQuoteCache(): void {
  cache.clear();
}

/**
 * «2–3»: what DHL says plus one day for the parcel to leave Piraeus. With no
 * transit time and no date (a mock answer), the honest range for intra-EU
 * Express, 2–4.
 */
export function etaRange(
  transitDays: number | null | undefined,
  estimatedDeliveryDate: string | null | undefined,
  now: Date = new Date(),
): { min: number; max: number; label: string } {
  let days = Number.isFinite(transitDays) && (transitDays as number) > 0 ? Math.round(transitDays as number) : null;
  if (days == null && estimatedDeliveryDate) {
    const target = new Date(estimatedDeliveryDate);
    if (!Number.isNaN(target.getTime()) && target > now) days = workingDaysBetween(now, target);
  }
  const min = days && days > 0 ? days : 2;
  const max = days && days > 0 ? days + 1 : 4;
  return { min, max, label: `${min}–${max}` };
}

function workingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (day.getTime() < end) {
    day.setUTCDate(day.getUTCDate() + 1);
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(1, count);
}

/** HDCtool's JSON body, out of the HdctoolError message (truncated at 200). */
function errorBody(error: HdctoolError): { code: DhlRefusalCode | null; message: string } {
  const text = error.message;
  const brace = text.indexOf("{");
  if (brace >= 0) {
    try {
      const body = JSON.parse(text.slice(brace)) as { error?: unknown; message?: unknown };
      const code = REFUSAL_CODES.find((c) => c === body.error) ?? null;
      return { code, message: typeof body.message === "string" ? body.message : text };
    } catch {
      // Truncated — the code is near the front, so look for it plainly.
    }
  }
  const code = REFUSAL_CODES.find((c) => text.includes(`"${c}"`)) ?? null;
  return { code, message: text };
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * DHL Express to an EU country other than Greece and Cyprus, via HDCtool.
 * The postcode is checked against the country's format first; a wrong one is
 * refused without a round-trip, as `invalid_postcode`.
 */
export async function quoteDhl({
  country,
  postcode,
  city,
  items,
  declaredValue,
  now = new Date(),
}: {
  country: string;
  postcode: string | null | undefined;
  city?: string | null;
  items: ParcelItem[];
  /** Goods, gross EUR — optional in the contract. */
  declaredValue?: number | null;
  now?: Date;
}): Promise<DhlResult> {
  const c = country.toUpperCase();
  const raw = (postcode ?? "").trim();
  if (!isDhlCountry(c)) {
    return { source: "refused", error: "unsupported_country", message: `not a DHL country: ${c}`, country: c, postcode: raw };
  }
  if (!raw) return { source: "unavailable", reason: "no postcode yet", country: c, pending: true };
  const checked = validateCountryPostcode(c, raw);
  if (!checked.ok) {
    return { source: "refused", error: "invalid_postcode", message: `postcode ${checked.reason}`, country: c, postcode: raw };
  }

  const weight = chargeableWeight(items);
  const key = `${c}|${checked.postcode}|${(city ?? "").trim().toLowerCase()}|${weight.chargeableKg}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.quote;

  const body = {
    country: c,
    postcode: checked.postcode,
    city: (city ?? "").trim(),
    weightKg: weight.chargeableKg,
    ...(declaredValue != null && declaredValue > 0 ? { declaredValue: round(declaredValue) } : {}),
  };

  let response: DhlQuoteResponse;
  try {
    response = await hdctoolRequest<DhlQuoteResponse>("/api/public/courier/quote", body);
  } catch (error) {
    /* 400: the request itself (no city, a weight HDCtool rejects) — the form says so. */
    if (error instanceof HdctoolError && error.status === 400) {
      console.warn(`[dhl-quote] ${c} ${checked.postcode}: 400 — ${error.message}`);
      return { source: "refused", error: "invalid_address", message: error.message, country: c, postcode: checked.postcode };
    }
    if (error instanceof HdctoolError && error.status === 422) {
      const { code, message } = errorBody(error);
      if (code) {
        console.warn(`[dhl-quote] ${c} ${checked.postcode}: ${code} — ${message}`);
        return { source: "refused", error: code, message, country: c, postcode: checked.postcode };
      }
    }
    console.error(`[dhl-quote] ${c} ${checked.postcode}: no quote`, error);
    return {
      source: "unavailable",
      reason: error instanceof Error ? error.message : "unreachable",
      country: c,
    };
  }

  if (!response.success) {
    const code = REFUSAL_CODES.find((x) => x === response.error);
    if (code) {
      return { source: "refused", error: code, message: response.message ?? code, country: c, postcode: checked.postcode };
    }
    return { source: "unavailable", reason: response.error ?? "DHL declined", country: c };
  }

  const net = toNumber(response.netAmount);
  if (net == null || net <= 0 || !response.productCode) {
    return { source: "unavailable", reason: "DHL answer without a price", country: c };
  }

  const vatRate = vatRateForDestination(c);
  const eta = etaRange(response.transitDays, response.estimatedDeliveryDate, now);
  const quote: DhlQuote = {
    source: "dhl",
    carrier: "DHL",
    productCode: response.productCode,
    productName: response.productName ?? "DHL Express",
    totalNet: round(net),
    netAmount: round(net),
    vatRate,
    grossAmount: round(net * (1 + vatRate / 100)),
    currency: "EUR",
    transitDays: toNumber(response.transitDays),
    estimatedDeliveryDate: response.estimatedDeliveryDate ?? null,
    etaDays: eta.label,
    etaMin: eta.min,
    etaMax: eta.max,
    chargeableKg: weight.chargeableKg,
    estimated: weight.estimatedItems > 0,
    origin: response.source ?? "dhl-live",
    quotedAt: now.toISOString(),
    country: c,
    postcode: checked.postcode,
  };
  cache.set(key, { at: now.getTime(), quote });
  return quote;
}

/**
 * The one entry point for "what does it cost to send this there".
 * Greece is `quoteLivePostage` unchanged, table fallback and all.
 */
export async function quoteDestination({
  country,
  postcode,
  city,
  items,
  declaredValue,
}: {
  country?: string | null;
  postcode: string | null | undefined;
  city?: string | null;
  items: ParcelItem[];
  declaredValue?: number | null;
}): Promise<DestinationQuote> {
  const c = (country ?? HOME_COUNTRY).toUpperCase();
  if (c === "GR") return quoteLivePostage({ items, postcode });
  if (c === "CY") {
    if (!(postcode ?? "").trim()) {
      return { source: "unavailable", reason: "no postcode yet", country: c, pending: true };
    }
    const live = await quoteLivePostage({ items, postcode, country: "CY" });
    // The table is Greek zones; it has no price for Cyprus. No answer is no answer.
    if (live.source === "table") {
      return { source: "unavailable", reason: live.fallbackReason ?? "ACS unavailable", country: c };
    }
    return live;
  }
  return quoteDhl({ country: c, postcode, city, items, declaredValue });
}
