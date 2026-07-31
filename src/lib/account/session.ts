import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { accountStore } from "@/lib/account/account-store";
import type { AccountUser, CompanyRole } from "@/lib/account/contract";
import { companyCan, type CompanyCapability } from "@/lib/account/contract";

/**
 * The customer session.
 *
 * A SECOND realm, entirely separate from the Auth.js session that guards
 * `/admin`. Staff and customers must never share an identity: one cookie that
 * could hold either is one bug away from a customer landing in the CMS.
 *
 * The cookie holds only HDCtool's token. Identity is resolved by asking
 * HDCtool, cached per request — so a suspended account stops working on its
 * next page load rather than whenever a JWT happens to expire.
 */

export const CUSTOMER_COOKIE = "KOLLERIS_SESSION";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function setCustomerSession(token: string) {
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearCustomerSession() {
  (await cookies()).delete(CUSTOMER_COOKIE);
}

export const getCustomerToken = cache(async (): Promise<string | null> => {
  return (await cookies()).get(CUSTOMER_COOKIE)?.value ?? null;
});

export type CustomerSession =
  | { state: "guest" }
  | { state: "signed-in"; token: string; user: AccountUser };

/**
 * Who is browsing.
 *
 * `cache` keeps it to one HDCtool round-trip per request even though the
 * header, the page and the price formatter all ask independently.
 */
export const getCustomerSession = cache(async (): Promise<CustomerSession> => {
  const token = await getCustomerToken();
  if (!token) return { state: "guest" };

  try {
    const result = await accountStore.me(token);
    if (!result.user) return { state: "guest" };
    return { state: "signed-in", token, user: result.user };
  } catch (error) {
    // A database hiccup must not log everyone out — but it must not pretend
    // they are signed in either. Guest is the safe answer.
    console.error("[customer-session]", error);
    return { state: "guest" };
  }
});

/** The signed-in user, or null. */
export async function getCurrentUser(): Promise<AccountUser | null> {
  const session = await getCustomerSession();
  return session.state === "signed-in" ? session.user : null;
}

/**
 * The multiplier applied to net prices for this visitor.
 *
 * 1 for guests and individuals. For an approved company it is whatever HDCtool
 * says — never a number this app decides, because the discount is an ERP fact
 * and the two must not be able to disagree at checkout.
 *
 * A `pending` company gets 1: registering is not the same as being approved.
 */
export async function getPartnerFactor(): Promise<number> {
  const user = await getCurrentUser();
  const company = user?.company;
  if (!company || company.status !== "active") return 1;
  const factor = company.partnerFactor;
  return typeof factor === "number" && factor > 0 && factor <= 1 ? factor : 1;
}

export type Viewer = {
  user: AccountUser | null;
  isPartner: boolean;
  partnerFactor: number;
  role: CompanyRole | null;
  can: (capability: CompanyCapability) => boolean;
};

/** One object with everything a page needs to decide what to show. */
export async function getViewer(): Promise<Viewer> {
  const user = await getCurrentUser();
  const company = user?.company ?? null;
  const isPartner = company?.status === "active";
  const role = user?.role ?? null;

  return {
    user,
    isPartner,
    partnerFactor: await getPartnerFactor(),
    role,
    // An individual holds no company capability at all — that is the whole
    // difference between the two account types, expressed in one place.
    can: (capability) => (role != null && isPartner ? companyCan(role, capability) : false),
  };
}
