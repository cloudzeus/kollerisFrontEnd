/**
 * PIM shapes and the editable-field list.
 *
 * Split from `pim.ts` so the client editor can import them without pulling in
 * `server-only` and Prisma — same split as the inbox, customers and zone
 * registries.
 *
 * Client-safe: no Prisma, no network.
 */

export type PimImage = {
  id: string;
  url: string;
  isFeature: boolean;
  order: number;
  width: number | null;
  height: number | null;
};

export type PimSpec = {
  field: string;
  label: string;
  value: string;
};

export type PimProduct = {
  id: string;
  /** HDCtool keys MTRLFile rows off this, not off the local id. */
  mtrl: number;
  slug: string;
  code: string;
  name: string;
  images: PimImage[];
  specs: PimSpec[];
};

/**
 * Fields the eshop admin may touch, matching HDCtool's own whitelist.
 *
 * Labels are Greek because the people editing are Greek; the keys are HDCtool's
 * and must not be translated.
 */
export const EDITABLE_SPECS: ReadonlyArray<{ field: string; label: string }> = [
  { field: "brand", label: "Μάρκα" },
  { field: "model", label: "Μοντέλο" },
  { field: "category", label: "Κατηγορία" },
  { field: "subcategory", label: "Υποκατηγορία" },
  { field: "material", label: "Υλικό" },
  { field: "color", label: "Χρώμα" },
  { field: "finish", label: "Φινίρισμα" },
  { field: "powerSource", label: "Τροφοδοσία" },
  { field: "voltage", label: "Τάση" },
  { field: "amperage", label: "Ένταση" },
  { field: "wattage", label: "Ισχύς" },
  { field: "speedSettings", label: "Ταχύτητες" },
  { field: "torque", label: "Ροπή" },
  { field: "chuckSize", label: "Τσοκ" },
] as const;
