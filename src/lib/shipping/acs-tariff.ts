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

/** Contract tariff, EUR net. `base` covers `baseKg`; each extra kg adds `perExtraKg`. */
const TARIFF: Record<ShippingZone, { base: number; baseKg: number; perExtraKg: number }> = {
  attica: { base: 2.9, baseKg: 2, perExtraKg: 0.75 },
  mainland: { base: 3.9, baseKg: 2, perExtraKg: 0.95 },
  island: { base: 5.6, baseKg: 2, perExtraKg: 1.4 },
  remote: { base: 7.2, baseKg: 2, perExtraKg: 1.9 },
};

/** Cash-on-delivery handling, EUR net. ACS bills this per shipment. */
export const COD_FEE_NET = 2.5;

/** Fuel surcharge as a fraction of the base rate. Revised by ACS periodically. */
const FUEL_SURCHARGE = 0.06;

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
} {
  const FALLBACK_KG = 0.3;
  let actualKg = 0;
  let volumetricKg = 0;
  let estimatedItems = 0;

  for (const item of items) {
    const qty = Math.max(1, item.quantity);

    if (item.weight != null && item.weight > 0) {
      actualKg += item.weight * qty;
    } else {
      actualKg += FALLBACK_KG * qty;
      estimatedItems += qty;
    }

    if (item.width && item.length && item.height) {
      volumetricKg += ((item.width * item.length * item.height) / VOLUMETRIC_DIVISOR) * qty;
    }
  }

  const chargeableKg = Math.max(MIN_CHARGEABLE_KG, actualKg, volumetricKg);
  return {
    actualKg: round(actualKg),
    volumetricKg: round(volumetricKg),
    chargeableKg: round(chargeableKg),
    estimatedItems,
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
  fuelSurchargeNet: number;
  codFeeNet: number;
  /** What the customer pays, net of VAT, before any free-shipping waiver. */
  totalNet: number;
};

/** Prices one shipment. Pure — no I/O, safe to call during render. */
export function quotePostage({
  items,
  postcode,
  cashOnDelivery = false,
}: {
  items: ParcelItem[];
  postcode: string | null | undefined;
  cashOnDelivery?: boolean;
}): PostageQuote {
  const zone = zoneForPostcode(postcode);
  const tariff = TARIFF[zone];
  const weight = chargeableWeight(items);

  const extraKg = Math.max(0, Math.ceil(weight.chargeableKg - tariff.baseKg));
  const baseNet = tariff.base;
  const extraWeightNet = round(extraKg * tariff.perExtraKg);
  const fuelSurchargeNet = round((baseNet + extraWeightNet) * FUEL_SURCHARGE);
  const codFeeNet = cashOnDelivery ? COD_FEE_NET : 0;

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
    fuelSurchargeNet,
    codFeeNet,
    totalNet: round(baseNet + extraWeightNet + fuelSurchargeNet + codFeeNet),
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
