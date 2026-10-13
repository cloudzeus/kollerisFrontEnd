"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { acceptRequest, declineRequest } from "@/lib/requests/service";

/**
 * The two buttons on `/aitima/{token}`.
 *
 * Server actions are reachable by a bare POST, so they authorise themselves:
 * the token IS the authorisation (the page is opened by it and nothing else),
 * and `acceptRequest` / `declineRequest` check it, the state, the expiry and
 * the offer version before anything moves. The amount is never read from the
 * form.
 */

/** `error` is a code; the page words it in the customer's language (`aitima.errors`). */
export type RequestActionState = { error?: string; done?: "declined" };

export async function acceptOfferAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const token = formData.get("token");
  const result = await acceptRequest(token, formData.get("offerVersion"));
  if (!result.ok) {
    if (typeof token === "string") revalidatePath(`/aitima/${token}`);
    return { error: result.error };
  }
  // Outside any try: `redirect` throws by design.
  redirect(result.redirectUrl);
}

export async function declineOfferAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const token = formData.get("token");
  const result = await declineRequest(token, formData.get("offerVersion"));
  if (typeof token === "string") revalidatePath(`/aitima/${token}`);
  if (!result.ok) return { error: result.error };
  return { done: "declined" };
}
