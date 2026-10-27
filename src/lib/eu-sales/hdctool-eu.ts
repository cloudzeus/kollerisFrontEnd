import "server-only";
import { HdctoolError, hdctoolRequest } from "@/lib/hdctool/client";

/**
 * The shop's two calls into HDCtool for EU sales (docs: intra-EU sales design).
 *
 *   checkEuVat  POST /api/public/vat/check      VIES, via HDCtool
 *   quoteDhl    POST /api/public/courier/quote  DHL Express, via HDCtool
 *
 * Both go through the shared HDCtool client (same bearer as every other call).
 * Neither throws: an outage is an answer — `unavailable` — and the caller's
 * rule is the same for both: when in doubt, VAT is charged and checkout says
 * so. Server-only; the browser asks a server action, never HDCtool.
 */

/** Greek copy shown whenever VIES could not be asked or did not answer. */
export const VAT_UNAVAILABLE_MESSAGE =
  "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ";

// ── VIES ────────────────────────────────────────────────────────────────────

export type EuVatStatus = "valid" | "invalid" | "unavailable" | "invalid_format";

export type EuVatCheck = {
  status: EuVatStatus;
  name: string | null;
  consultationNumber: string | null;
  /** ISO time VIES answered, as HDCtool reports it. */
  checkedAt: string | null;
  message: string;
};

type VatCheckBody = {
  status?: unknown;
  name?: unknown;
  consultationNumber?: unknown;
  checkedAt?: unknown;
  message?: unknown;
};

const STATUSES: readonly EuVatStatus[] = ["valid", "invalid", "unavailable", "invalid_format"];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function unavailable(message: string = VAT_UNAVAILABLE_MESSAGE): EuVatCheck {
  return { status: "unavailable", name: null, consultationNumber: null, checkedAt: null, message };
}

/** The JSON body HDCtool put in an HdctoolError message (cut at 200 chars). */
function errorBody(error: HdctoolError): Record<string, unknown> | null {
  const brace = error.message.indexOf("{");
  if (brace < 0) return null;
  try {
    const body: unknown = JSON.parse(error.message.slice(brace));
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Ask VIES (through HDCtool) whether `vat` is an active VAT number in `country`.
 *
 * `vat` should already be normalised (`DE123456789`); HDCtool validates the
 * format and answers `invalid_format` without calling VIES. Network errors,
 * timeouts, 429 and 5xx all come back as `unavailable`.
 */
export async function checkEuVat(vat: string, country: string): Promise<EuVatCheck> {
  let body: VatCheckBody;
  try {
    body = await hdctoolRequest<VatCheckBody>("/api/public/vat/check", { vat, country });
  } catch (error) {
    if (error instanceof HdctoolError && error.status === 429) {
      // Rate limited: HDCtool says so in its own words.
      return unavailable(text(errorBody(error)?.message) ?? VAT_UNAVAILABLE_MESSAGE);
    }
    console.error("[eu-sales] VAT check failed", error);
    return unavailable();
  }

  const status = STATUSES.find((s) => s === body?.status);
  if (!status) {
    console.error("[eu-sales] VAT check: unrecognised answer", body);
    return unavailable();
  }

  return {
    status,
    name: text(body.name),
    consultationNumber: text(body.consultationNumber),
    checkedAt: text(body.checkedAt),
    message: text(body.message) ?? (status === "unavailable" ? VAT_UNAVAILABLE_MESSAGE : ""),
  };
}

// ── DHL quote ───────────────────────────────────────────────────────────────

export type DhlQuoteInput = { country: string; postcode: string; city: string; weightKg: number };

export type DhlRefusal = "unsupported_country" | "invalid_postcode" | "unserviceable_postcode";

export type DhlQuote =
  | {
      ok: true;
      productCode: string;
      productName: string;
      netAmount: number;
      vatRate: number;
      grossAmount: number;
      /** ISO time of the call: what the order is priced against. */
      quotedAt: string;
      estimatedDeliveryDate?: string;
    }
  | { ok: false; reason: DhlRefusal | "unavailable" };

const REFUSALS: readonly DhlRefusal[] = ["unsupported_country", "invalid_postcode", "unserviceable_postcode"];

type QuoteBody = {
  success?: unknown;
  error?: unknown;
  productCode?: unknown;
  productName?: unknown;
  netAmount?: unknown;
  vatRate?: unknown;
  grossAmount?: unknown;
  estimatedDeliveryDate?: unknown;
};

const refusal = (code: unknown): DhlRefusal | null => REFUSALS.find((r) => r === code) ?? null;
const money = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/**
 * A DHL Express price for one parcel to an EU destination, from HDCtool.
 *
 * A 422 about the place (`unsupported_country`, `invalid_postcode`,
 * `unserviceable_postcode`) is returned as that reason. Anything else that is
 * not a price — 502/504, any other status, a network error, an answer with no
 * usable amount — is `unavailable`: no price is ever guessed.
 */
export async function quoteDhl(input: DhlQuoteInput): Promise<DhlQuote> {
  const quotedAt = new Date().toISOString();

  let body: QuoteBody;
  try {
    body = await hdctoolRequest<QuoteBody>("/api/public/courier/quote", {
      country: input.country,
      postcode: input.postcode,
      city: input.city,
      weightKg: input.weightKg,
    });
  } catch (error) {
    if (error instanceof HdctoolError && error.status === 422) {
      const reason = refusal(errorBody(error)?.error);
      if (reason) return { ok: false, reason };
    }
    console.error("[eu-sales] DHL quote failed", error);
    return { ok: false, reason: "unavailable" };
  }

  if (body?.success !== true) {
    const reason = refusal(body?.error);
    return { ok: false, reason: reason ?? "unavailable" };
  }

  const netAmount = money(body.netAmount);
  const vatRate = money(body.vatRate);
  const grossAmount = money(body.grossAmount);
  const productCode = text(body.productCode);
  const productName = text(body.productName);
  if (netAmount === null || vatRate === null || grossAmount === null || !productCode || !productName) {
    console.error("[eu-sales] DHL quote: unusable answer", body);
    return { ok: false, reason: "unavailable" };
  }

  const estimatedDeliveryDate = text(body.estimatedDeliveryDate);
  return {
    ok: true,
    productCode,
    productName,
    netAmount,
    vatRate,
    grossAmount,
    quotedAt,
    ...(estimatedDeliveryDate ? { estimatedDeliveryDate } : {}),
  };
}
