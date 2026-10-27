import "server-only";
import { cookies } from "next/headers";
import type { CustomerType } from "@/lib/eu-sales/vat-mode";

/**
 * Who is buying abroad, remembered between the checkout form and the page
 * around it (EU sales only): consumer or company, and the last VIES answer
 * with the country and number it was for.
 *
 * DISPLAY ONLY. The page uses it to show the summary net after a valid check;
 * `placeOrder` never reads it — it asks VIES again and decides itself. A
 * cookie rather than a query string, httpOnly: a VAT number does not belong in
 * URLs and logs.
 */
export const EU_BUYER_COOKIE = "KOLLERIS_EU_BUYER";

export type StoredVies = { country: string; vat: string; status: string; checkedAt: string | null };
export type StoredEuBuyer = { customerType: CustomerType; vies: StoredVies | null };

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Pure, for the tests: the cookie's value back into a buyer, or null. */
export function parseEuBuyer(value: string | null | undefined): StoredEuBuyer | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as { customerType?: unknown; vies?: Record<string, unknown> | null };
    const customerType = raw.customerType === "company" || raw.customerType === "individual" ? raw.customerType : null;
    if (!customerType) return null;
    const v = raw.vies;
    const country = text(v?.country, 2);
    const vat = text(v?.vat, 32);
    const status = text(v?.status, 16);
    const vies = v && country && vat && status ? { country, vat, status, checkedAt: text(v.checkedAt, 40) } : null;
    return { customerType, vies: customerType === "company" ? vies : null };
  } catch {
    return null;
  }
}

export async function readEuBuyer(): Promise<StoredEuBuyer | null> {
  const store = await cookies();
  return parseEuBuyer(store.get(EU_BUYER_COOKIE)?.value);
}

export async function writeEuBuyer(buyer: StoredEuBuyer): Promise<void> {
  const store = await cookies();
  store.set(EU_BUYER_COOKIE, JSON.stringify(buyer), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // A day at most: a VIES answer only ever counts on the day it was given.
    maxAge: 60 * 60 * 24,
  });
}
