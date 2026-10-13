import "server-only";
import { HdctoolError, hdctoolRequest } from "@/lib/hdctool/client";
import { validatePostcode } from "@/lib/shipping/destination";
import {
  ZONES,
  chargeableWeight,
  quotePostage,
  zoneForPostcode,
  type ParcelItem,
  type PostageQuote,
} from "@/lib/shipping/acs-tariff";

/**
 * Postage, from ACS when it can be had and from our own table when it cannot.
 *
 * HDCtool H6 asks `ACS_Price_Calculation`, which prices from the Kolleris
 * pricelist — the real figure, including whether the destination is a remote
 * area, which ACS knows and a postcode range does not.
 *
 * The local table stays as the fallback. Its numbers were re-measured against
 * the same API on 2026-07-31, so a fallback quote is now close rather than the
 * 44% overcharge it used to be, but it is still an approximation: it cannot see
 * remoteness, and it will drift when ACS renegotiates.
 *
 * `source` says which one answered. It is carried into the order's
 * `shippingQuote` so a disputed charge can be explained rather than guessed at
 * months later.
 *
 * ── Two kinds of "no" ──────────────────────────────────────────────────────
 * The table is for when ACS CANNOT answer — HDCtool down, a 5xx, a timeout.
 * It is not for when ACS answers "there is no such place": that is a parcel we
 * cannot deliver, and pricing it from the table is how an order to Verona
 * (37015) was accepted at the Greek-island rate. HDCtool reports that case as
 * 422 «No ACS station for postcode …»; it comes back here as
 * `unserviceable_postcode`, with no price at all, and checkout refuses it.
 */

export type LivePostageQuote = PostageQuote & {
  source: "acs" | "table";
  /** Present only for an ACS quote — the station that will deliver. */
  station?: string;
  /** ACS's own answer, not inferred from the postcode. */
  remote?: boolean;
  /** Why the fallback was used, when it was. */
  fallbackReason?: string;
};

/** ACS has no station for this postcode: we do not deliver there. No price. */
export type UnserviceablePostcode = {
  source: "unserviceable";
  error: "unserviceable_postcode";
  postcode: string;
  /** What ACS (or our own postcode check) said, for the log. */
  reason: string;
};

export type LivePostageResult = LivePostageQuote | UnserviceablePostcode;

export function isUnserviceable(
  result: LivePostageResult | null | undefined,
): result is UnserviceablePostcode {
  return result?.source === "unserviceable";
}

/*
 * HDCtool's answers that are about the PLACE, not about ACS being unwell:
 * 422 «No ACS station for postcode …», 404 «Unknown postcode» (the area-only
 * lookup), 400 «postcode must be five digits». Other 422s — «ACS returned no
 * price row», or an ACS message about weight — still fall back: the courier
 * failed to price a parcel, which is not the same as the address being wrong.
 */
const PLACE_STATUSES = new Set([400, 404, 422]);
const PLACE_WORDS = /station|postcode|post code|zip|area|destination|περιοχ|ταχυδρομικ|τ\.\s?κ\.?|προορισμ/i;

function isAboutThePlace(message: string | undefined): boolean {
  return PLACE_WORDS.test(message ?? "");
}

/** The JSON body HDCtool put in the error message, when it did. */
function hdctoolErrorText(error: HdctoolError): string {
  const brace = error.message.indexOf("{");
  if (brace >= 0) {
    try {
      const body = JSON.parse(error.message.slice(brace)) as { error?: unknown };
      if (typeof body.error === "string") return body.error;
    } catch {
      // Truncated at 200 characters, or not JSON — the raw text will do.
    }
  }
  return error.message;
}

type H6Response = {
  success: boolean;
  quote?: {
    stationId: string;
    area: string;
    remote: boolean;
    basicNet: number;
    extrasNet: number;
    totalNet: number;
    vatAmount: number;
    totalGross: number;
    weightKg: number;
  };
  error?: string;
};

export async function quoteLivePostage({
  items,
  postcode,
}: {
  items: ParcelItem[];
  postcode: string | null | undefined;
}): Promise<LivePostageResult> {
  const table = quotePostage({ items, postcode });
  const raw = (postcode ?? "").trim();

  // No postcode yet — the cart before anyone has typed one. An estimate is
  // what the customer asked for there.
  if (!raw) {
    return { ...table, source: "table", fallbackReason: "no postcode yet" };
  }

  // A postcode that cannot be Greek is not worth a round-trip, and must not be
  // priced from the table either: 0xxxx, 9xxxx, four digits, letters.
  const checked = validatePostcode(raw);
  if (!checked.ok) {
    return {
      source: "unserviceable",
      error: "unserviceable_postcode",
      postcode: raw,
      reason: `postcode ${checked.reason}`,
    };
  }
  const clean = checked.postcode;

  const weight = chargeableWeight(items);

  try {
    const response = await hdctoolRequest<H6Response>("/api/public/courier/quote", {
      postcode: clean,
      weightKg: weight.chargeableKg,
    });

    if (!response.success || !response.quote) {
      if (isAboutThePlace(response.error)) {
        return {
          source: "unserviceable",
          error: "unserviceable_postcode",
          postcode: clean,
          reason: response.error ?? "ACS declined the postcode",
        };
      }
      return { ...table, source: "table", fallbackReason: response.error ?? "ACS declined" };
    }

    const q = response.quote;
    return {
      ...table,
      // ACS charges one figure; there is no base/extra split to report, so the
      // whole amount is the base and the derived fields are zeroed rather than
      // invented.
      baseNet: q.basicNet,
      extraWeightNet: Number((q.totalNet - q.basicNet - q.extrasNet).toFixed(2)),
      totalNet: q.totalNet,
      // Remoteness from ACS overrides whatever the postcode ranges concluded.
      zone: q.remote ? "remote" : table.zone,
      // The label and delivery time follow the zone, or an order priced as
      // remote says "Ηπειρωτική Ελλάδα, 1-2 ημέρες" to the customer.
      ...(q.remote ? { zoneLabel: ZONES.remote.label, etaDays: ZONES.remote.etaDays } : {}),
      source: "acs",
      station: q.stationId,
      remote: q.remote,
    };
  } catch (error) {
    // ACS answered, and the answer is "no such place": no price, no fallback.
    if (error instanceof HdctoolError && PLACE_STATUSES.has(error.status)) {
      const reason = hdctoolErrorText(error);
      if (isAboutThePlace(reason)) {
        console.warn(`[acs-live] unserviceable postcode ${clean}: ${reason}`);
        return { source: "unserviceable", error: "unserviceable_postcode", postcode: clean, reason };
      }
    }

    // A courier outage must not stop anyone checking out. The table answers,
    // and says so.
    console.error("[acs-live] falling back to the tariff table", error);
    return {
      ...table,
      source: "table",
      fallbackReason: error instanceof Error ? error.message : "unreachable",
    };
  }
}

export { zoneForPostcode };
