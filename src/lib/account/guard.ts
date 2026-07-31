import "server-only";
import { redirect } from "@/i18n/navigation";
import { getCustomerSession } from "@/lib/account/session";
import type { AccountUser } from "@/lib/account/contract";
import type { Locale } from "@/i18n/routing";

/**
 * The three states every account page has to handle.
 *
 * Guests are redirected — an account page has nothing to show them. Everything
 * else is a signed-in customer, since accounts now live in this database and
 * there is no third "backend not ready" state to handle.
 */
export type AccountGuard = { state: "signed-in"; user: AccountUser };

export async function requireCustomer(
  locale: Locale,
  redirectTo: string,
): Promise<AccountGuard> {
  const session = await getCustomerSession();

  if (session.state === "signed-in") {
    return { state: "signed-in", user: session.user };
  }

  // `redirect` throws, but next-intl's wrapper is not typed `never` — the
  // unreachable throw is what tells TypeScript this branch does not fall out.
  redirect({ href: `/eisodos?redirect=${encodeURIComponent(redirectTo)}`, locale });
  throw new Error("unreachable");
}
