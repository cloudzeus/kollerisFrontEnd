import "server-only";
import { hdctoolRequest } from "@/lib/hdctool/client";
import {
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
}): Promise<LivePostageQuote> {
  const table = quotePostage({ items, postcode });
  const clean = (postcode ?? "").replace(/\s/g, "");

  // Not worth a round-trip: ACS needs five digits and would only 400.
  if (!/^\d{5}$/.test(clean)) {
    return { ...table, source: "table", fallbackReason: "no postcode yet" };
  }

  const weight = chargeableWeight(items);

  try {
    const response = await hdctoolRequest<H6Response>("/api/public/courier/quote", {
      postcode: clean,
      weightKg: weight.chargeableKg,
    });

    if (!response.success || !response.quote) {
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
      source: "acs",
      station: q.stationId,
      remote: q.remote,
    };
  } catch (error) {
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
