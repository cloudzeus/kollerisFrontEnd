/**
 * PIM write contract with HDCtool.
 *
 * Decision (client, explicit): edits made from this admin apply EVERYWHERE, not
 * just on the storefront. There are therefore no presentation overlays for
 * specs or images — HDCtool stays the single source of truth, this app is the
 * editing surface, and the nightly sync brings each change back into the
 * projection.
 *
 * The handlers already exist on the HDCtool side and are careful:
 *
 *   /api/specifications/save         writes el/en/it AND pushes to SoftOne via
 *                                    `updateMTRLProductERP`
 *   /api/specifications/clear-field  nulls one field across all three language
 *                                    rows, guarded by a `CLEARABLE_FIELDS`
 *                                    whitelist so no arbitrary column is writable
 *
 * What is missing is only the entry point: every one of them authenticates with
 * a better-auth COOKIE session, and this app holds a bearer from
 * `/api/public/auth`. So H18–H20 are auth wrappers over existing logic, not new
 * features — which is why they are cheap.
 *
 * Client-safe: no Prisma, no network.
 */

export type SpecLanguage = "el" | "en" | "it";

/** H18 — reorder a product's images and set which one is the main shot. */
export type ImageOrderRequest = {
  mtrl: number;
  /** Image ids in the order they should appear; index becomes `order`. */
  imageIds: string[];
  /** Which id gets `mainImage: true`. Must be one of `imageIds`. */
  mainImageId: string;
};

/** H19 — write one spec field, in every language it has a value for. */
export type SpecSaveRequest = {
  mtrl: number;
  fieldKey: string;
  /** Locale → value. Omit a locale to leave it untouched. */
  values: Partial<Record<SpecLanguage, string>>;
  unit?: string | null;
};

/**
 * H19b — remove a spec field.
 *
 * Removes it EVERYWHERE, which is what was asked for: a wrong value is wrong on
 * Magento and Skroutz too. Worth considering on the HDCtool side, though: a
 * `hidden` boolean on the row rather than a hard null would give the same
 * result on every channel while keeping the value recoverable. A cleared field
 * cannot be undone from this UI.
 */
export type SpecClearRequest = {
  mtrl: number;
  /** Must be in HDCtool's `CLEARABLE_FIELDS` whitelist. */
  fieldKey: string;
};

/**
 * H20 — promotional price.
 *
 * The one thing with NO existing field anywhere. `onSale` and `priceList` in
 * the projection were derived from the standing gap between two SoftOne price
 * lists, which made 68% of the catalogue permanently "on sale"; they were
 * cleared. A real offer needs a real price with a window, and it needs to reach
 * the ERP so the invoice matches what the customer was shown.
 */
export type PromoRequest = {
  mtrl: number;
  /** Net promotional price, or null to end the promotion. */
  promoPriceNet: number | null;
  /** ISO dates. Null `to` means open-ended. */
  promoFrom: string | null;
  promoTo: string | null;
};

export type PimWriteResponse =
  | { ok: true; mtrl: number }
  | {
      ok: false;
      error: "not_found" | "field_not_clearable" | "invalid_input" | "erp_rejected";
      detail?: string;
    };
