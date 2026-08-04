/**
 * ACS postage pricing.
 *
 * ACS's web services expose vouchers, tracking, address validation and pickup
 * lists — but NO tariff endpoint. Verified against the full action list in
 * HDCtool's `acs-courier.ts`: there is nothing that prices a shipment. Postage
 * therefore has to be computed here from the contract tariff, and the numbers
 * below must be reconciled with the signed ACS agreement before go-live.
 *
 * What IS real and not guessed:
 *  - the chargeable weight, from each product's `weight` (SoftOne GWEIGHT) and
 *    dimensions (DIM1/2/3), using ACS's volumetric divisor
 *  - the destination zone, from the delivery postcode
 *
 * Client-safe: pure arithmetic, no Prisma, no secrets — the checkout summary
 * imports it directly.
 */

export type ShippingZone = "attica" | "mainland" | "island" | "remote";

export type ZoneInfo = {
  id: ShippingZone;
  label: string;
  /** Working days quoted to the customer. */
  etaDays: string;
};

export const ZONES: Record<ShippingZone, ZoneInfo> = {
  attica: { id: "attica", label: "Αττική", etaDays: "1" },
  mainland: { id: "mainland", label: "Ηπειρωτική Ελλάδα", etaDays: "1-2" },
  island: { id: "island", label: "Νησιά", etaDays: "2-4" },
  remote: { id: "remote", label: "Δυσπρόσιτες περιοχές", etaDays: "3-5" },
};

/**
 * Volumetric divisor used by ACS for domestic parcels: cm³ / 5000 → kg.
 * A light but bulky box is charged on its size, not its mass.
 */
const VOLUMETRIC_DIVISOR = 5000;

/**
 * The largest dimension a courier parcel can plausibly have, in centimetres.
 *
 * ACS refuses anything over 150 cm on the longest side for a standard parcel,
 * so 200 leaves room for a genuinely long item while still being far below the
 * 1.000 that a millimetre value lands on.
 */
const MAX_PLAUSIBLE_CM = 200;

/** Contract tariff, EUR net. `base` covers `baseKg`; each extra kg adds `perExtraKg`. */
/**
 * MEASURED from the live ACS pricelist on 2026-07-31, not estimated. Each row
 * was read back from `ACS_Price_Calculation` at 0.5, 2, 5 and 12 kg against a
 * real postcode in that zone, and the per-kg figure is the slope between them:
 *
 *   Αττική      11525 / 18545   2.57 → 10.80 over 10 kg
 *   Ηπειρωτική  54621 / 41222   3.09 → 13.38
 *   Νησιά       73100 / 85100   4.12 → 14.41
 *   Δυσπρόσιτες 19007 / 84600   5.15 → 20.58   (ACS product REM)
 *
 * The previous values were guesses and overcharged by 44% on islands, 48% on
 * remote areas and about 20% on light Attica parcels. Amounts are NET and
 * already include everything ACS bills — there is no separate fuel surcharge to
 * add, which the old table also got wrong.
 *
 * This is only the fallback. `quoteLivePostage` asks ACS for the real figure and
 * uses this when it cannot.
 */
const TARIFF: Record<ShippingZone, { base: number; baseKg: number; perExtraKg: number }> = {
  attica: { base: 2.57, baseKg: 2, perExtraKg: 0.823 },
  mainland: { base: 3.09, baseKg: 2, perExtraKg: 1.029 },
  island: { base: 4.12, baseKg: 2, perExtraKg: 1.029 },
  remote: { base: 5.15, baseKg: 2, perExtraKg: 1.543 },
};


/** Fuel surcharge as a fraction of the base rate. Revised by ACS periodically. */

/** ACS bills a minimum of 0.5 kg however light the parcel is. */
const MIN_CHARGEABLE_KG = 0.5;

/**
 * Greek postcode → zone.
 *
 * Prefix ranges, because ACS zones follow prefectures and prefectures follow
 * the first two or three postcode digits. Unknown or malformed codes fall back
 * to `mainland` — the middle tariff, so a bad postcode never silently
 * undercharges an island delivery.
 */
export function zoneForPostcode(postcode: string | null | undefined): ShippingZone {
  const digits = (postcode ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "mainland";
  const prefix = Number.parseInt(digits.slice(0, 3), 10);

  // Attica: 10xxx–19xxx.
  if (prefix >= 100 && prefix <= 199) return "attica";

  // Island prefectures.
  const islandRanges: Array<[number, number]> = [
    [700, 745], // Crete
    [800, 859], // Cyclades, Dodecanese, East Aegean
    [280, 299], // Ionian
    [370, 372], // Sporades
    [640, 641], // Thasos
  ];
  if (islandRanges.some(([from, to]) => prefix >= from && prefix <= to)) return "island";

  // Remote / mountainous where ACS applies its surcharge zone.
  const remoteRanges: Array<[number, number]> = [
    [630, 639], // Mount Athos and surrounds
    [440, 449], // remote Epirus
  ];
  if (remoteRanges.some(([from, to]) => prefix >= from && prefix <= to)) return "remote";

  return "mainland";
}

export type ParcelItem = {
  quantity: number;
  /** kg, from SoftOne GWEIGHT. */
  weight: number | null;
  /** cm, from SoftOne DIM1/DIM2/DIM3. */
  width: number | null;
  length: number | null;
  height: number | null;
};

/**
 * Chargeable weight: the greater of actual and volumetric, per ACS practice.
 *
 * Items with no recorded weight fall back to 0.3 kg each rather than zero —
 * treating unknown as weightless is how a pallet ships for the price of an
 * envelope. Roughly 1 in 5 catalogue rows has no GWEIGHT.
 */
export function chargeableWeight(items: ParcelItem[]): {
  actualKg: number;
  volumetricKg: number;
  chargeableKg: number;
  estimatedItems: number;
  /** Lines whose dimensions were refused as impossible. Worth surfacing. */
  implausibleItems: number;
} {
  const FALLBACK_KG = 0.3;
  let actualKg = 0;
  let volumetricKg = 0;
  let estimatedItems = 0;
  let implausibleItems = 0;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);

    if (item.weight != null && item.weight > 0) {
      actualKg += item.weight * qty;
    } else {
      actualKg += FALLBACK_KG * qty;
      estimatedItems += qty;
    }

    if (item.width && item.length && item.height) {
      /*
       * A dimension a courier could not carry is a data error, not a big parcel.
       *
       * Five catalogue rows hold millimetres in the centimetre field, and they
       * say so in their own names: "ΕΞΩΛΚΕΑΣ 1000mm" is stored as 1000×150×50,
       * which is 1.500 volumetric kilos and quotes about 1.900 EUR of postage
       * on a 98 EUR tool. The catalogue is otherwise in centimetres - the 99th
       * percentile of width is 100 cm - so this is five bad rows, not a unit
       * mismatch, and the repair belongs in SoftOne.
       *
       * Meanwhile the storefront must not quote a number like that. Beyond the
       * limit the dimensions are discarded and the item is charged on its real
       * weight, which is the honest fallback: too low is a cost we absorb, too
       * high is a sale we lose and a customer who never comes back.
       */
      const oversize =
        item.width > MAX_PLAUSIBLE_CM ||
        item.length > MAX_PLAUSIBLE_CM ||
        item.height > MAX_PLAUSIBLE_CM;

      if (oversize) {
        implausibleItems += qty;
      } else {
        volumetricKg += ((item.width * item.length * item.height) / VOLUMETRIC_DIVISOR) * qty;
      }
    }
  }

  const chargeableKg = Math.max(MIN_CHARGEABLE_KG, actualKg, volumetricKg);
  return {
    actualKg: round(actualKg),
    volumetricKg: round(volumetricKg),
    chargeableKg: round(chargeableKg),
    estimatedItems,
    implausibleItems,
  };
}

export type PostageQuote = {
  zone: ShippingZone;
  zoneLabel: string;
  etaDays: string;
  chargeableKg: number;
  actualKg: number;
  volumetricKg: number;
  /** True when some items had no recorded weight and were estimated. */
  estimated: boolean;
  baseNet: number;
  extraWeightNet: number;
  /** What the customer pays, net of VAT, before any free-shipping waiver. */
  totalNet: number;
};

/** Prices one shipment. Pure — no I/O, safe to call during render. */
export function quotePostage({
  items,
  postcode,
}: {
  items: ParcelItem[];
  postcode: string | null | undefined;
}): PostageQuote {
  const zone = zoneForPostcode(postcode);
  const tariff = TARIFF[zone];
  const weight = chargeableWeight(items);

  const extraKg = Math.max(0, Math.ceil(weight.chargeableKg - tariff.baseKg));
  const baseNet = tariff.base;
  const extraWeightNet = round(extraKg * tariff.perExtraKg);

  return {
    zone,
    zoneLabel: ZONES[zone].label,
    etaDays: ZONES[zone].etaDays,
    chargeableKg: weight.chargeableKg,
    actualKg: weight.actualKg,
    volumetricKg: weight.volumetricKg,
    estimated: weight.estimatedItems > 0,
    baseNet,
    extraWeightNet,
    totalNet: round(baseNet + extraWeightNet),
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
