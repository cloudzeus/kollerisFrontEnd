"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientIp } from "@/lib/security/client-ip";
import { z } from "zod";
import { getCartToken } from "@/lib/cart/cart";
import { readEuBuyer, writeEuBuyer } from "@/lib/eu-sales/buyer-cookie";
import { euSalesCopy } from "@/lib/eu-sales/copy";
import { isDhlDestination, isEuSalesEnabled } from "@/lib/eu-sales/countries";
import { checkEuVat, type EuVatStatus } from "@/lib/eu-sales/hdctool-eu";
import { normaliseEuVat } from "@/lib/eu-sales/vat-format";
import { VAT_CHECKS_PER_IP, VAT_CHECKS_PER_WINDOW, takeVatCheck } from "@/lib/eu-sales/vat-check-limit";

/**
 * The checkout's VAT check (intra-EU sales design §3.2), asked on blur or by
 * the «Έλεγχος» button. The browser asks this action, never HDCtool.
 *
 * The format is checked first (no VIES call for a wrong one). The answer is
 * remembered in `buyer-cookie` so the summary beside the form re-renders net
 * after a valid check — and only for display: `placeOrder` asks VIES again.
 * 10 checks per 10 minutes per basket, and 30 per client address, so a
 * rotated cart cookie buys nothing (`vat-check-limit`, R11-I3).
 */

export type VatCheckAnswer = {
  status: EuVatStatus;
  /** As VIES is asked about it: `DE123456789`. Null for a wrong format. */
  vat: string | null;
  /** From VIES, for the status line. The form's own company name is not replaced. */
  name: string | null;
  message: string;
};

const inputSchema = z.object({
  country: z.string().trim().max(2),
  vat: z.string().trim().max(32),
  locale: z.string().max(5).optional(),
});

export async function checkVatAction(input: unknown): Promise<VatCheckAnswer> {
  const parsed = inputSchema.safeParse(input);
  const copy = euSalesCopy(parsed.success ? parsed.data.locale : null);
  const unavailable = (message = copy.unavailable): VatCheckAnswer => ({
    status: "unavailable",
    vat: null,
    name: null,
    message,
  });

  if (!isEuSalesEnabled()) return unavailable();
  if (!parsed.success) return { status: "invalid_format", vat: null, name: null, message: copy.invalidFormat };

  const country = parsed.data.country.toUpperCase();
  // Greece (and Cyprus, out of scope) never go to VIES: a Greek ΑΦΜ is AADE's.
  const normalised = isDhlDestination(country) ? normaliseEuVat(parsed.data.vat, country) : null;
  if (!normalised?.ok) return { status: "invalid_format", vat: null, name: null, message: copy.invalidFormat };

  const cartToken = await getCartToken();
  if (!cartToken) return unavailable();
  // The address as Cloudflare/Traefik saw it, never what the client claims (client-ip.ts).
  const ip = clientIp(await headers());
  const budgets: Array<[string, number]> = [[`cart:${cartToken}`, VAT_CHECKS_PER_WINDOW]];
  if (ip) budgets.push([`ip:${ip}`, VAT_CHECKS_PER_IP]);
  if (!takeVatCheck(budgets)) return unavailable(copy.tooMany);

  const result = await checkEuVat(normalised.vat, country);
  if (result.status === "invalid_format") {
    return { status: "invalid_format", vat: null, name: null, message: copy.invalidFormat };
  }

  await writeEuBuyer({
    customerType: "company",
    vies: { country, vat: normalised.vat, status: result.status, checkedAt: result.checkedAt },
  });
  revalidatePath("/", "layout");

  return {
    status: result.status,
    vat: normalised.vat,
    name: result.name,
    message:
      result.status === "valid"
        ? copy.valid(result.name)
        : result.status === "invalid"
          ? copy.invalid
          : copy.unavailable,
  };
}

/**
 * «Ιδιώτης» / «Εταιρεία». Switching to a consumer forgets the VIES answer at
 * once, so the summary charges VAT again (Review Focus 2). Switching to a
 * company keeps nothing either: the number has to be checked.
 */
export async function setCustomerTypeAction(input: unknown): Promise<void> {
  if (!isEuSalesEnabled()) return;
  const parsed = z.object({ customerType: z.enum(["individual", "company"]) }).safeParse(input);
  if (!parsed.success) return;
  const current = await readEuBuyer();
  if (current?.customerType === parsed.data.customerType && parsed.data.customerType === "individual") return;
  await writeEuBuyer({ customerType: parsed.data.customerType, vies: null });
  revalidatePath("/", "layout");
}
