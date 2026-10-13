"use server";

import { z } from "zod";
import { isUnserviceable, quoteLivePostage } from "@/lib/shipping/acs-live";
import { validatePostcode } from "@/lib/shipping/destination";

/**
 * Does ACS deliver to this postcode? Asked by the checkout form as soon as a
 * complete Τ.Κ. is typed, so the customer hears «we do not deliver there»
 * before filling in the rest — not after pressing «Ολοκλήρωση».
 *
 * Only a definite "no" from ACS says no. When HDCtool or ACS cannot be
 * reached the answer is yes: the same rule as checkout, where an outage
 * prices from the table rather than stopping the sale. `placeOrder` asks
 * again and is the one that decides.
 */
export async function checkDeliveryPostcode(input: unknown): Promise<{ serviceable: boolean }> {
  const parsed = z.object({ postcode: z.string().max(16) }).safeParse(input);
  if (!parsed.success) return { serviceable: false };

  const checked = validatePostcode(parsed.data.postcode);
  if (!checked.ok) return { serviceable: false };

  // The station is what matters here, not the price: an empty parcel is
  // priced at ACS's 0,5 kg minimum.
  const quote = await quoteLivePostage({ items: [], postcode: checked.postcode });
  return { serviceable: !isUnserviceable(quote) };
}
