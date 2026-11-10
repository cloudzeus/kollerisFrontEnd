/**
 * The Milwaukee supplier XML, on top of our own stock — the same rule as the
 * Milwaukee shop (hdc-front `lib/catalog/availability.ts`):
 *
 *   ours                       «Άμεσα διαθέσιμο», as before
 *   none of ours, XML has it   «Διαθέσιμο · 3–5 εργάσιμες», bought and paid like stock
 *   neither                    «Κατόπιν παραγγελίας», a request, as before
 *
 * HDCtool sends `supplierAvailable` on every product; it is false everywhere
 * but Milwaukee.
 */
export const SUPPLIER_HANDLING_DAYS = { min: 3, max: 5 } as const;

/** Not ours to ship today, but the supplier has it: buyable, 3–5 working days. */
export function isFromSupplier(p: { inStock: boolean; supplierAvailable?: boolean | null }): boolean {
  return !p.inStock && p.supplierAvailable === true;
}
