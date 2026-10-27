import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { LOCKOUT_MINUTES, MAX_ATTEMPTS, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSsoConfig, ssoReady } from "@/lib/admin/sso/config";
import { SSO_STATE_COOKIE, clearStateCookie, completeSso, type SsoFailure } from "@/lib/admin/sso/flow";
import { linkAdminUser } from "@/lib/admin/sso/link-user";
import { consumeJti, issueTicket, purgeExpired } from "@/lib/admin/sso/once";
import { verifySsoToken } from "@/lib/admin/sso/verify";
import { clientIp } from "@/lib/security/client-ip";

const FAILURE_PATH = "/admin/login?error=sso";

/**
 * HDCtool auto-POSTs the signed token here (spec §3.4). Whatever happens the
 * state cookie is cleared; the token is never logged or put in a URL.
 *
 * Redirects are 303 responses we build ourselves: `redirect()` in a Route
 * Handler answers 307, which would make the browser re-POST to /admin.
 * Locations are relative, so they stay on the host the browser used.
 */
export async function POST(request: Request) {
  if (!ssoReady(adminSsoConfig())) return new Response(null, { status: 404 });

  let token: string | null = null;
  try {
    const value = (await request.formData()).get("token");
    token = typeof value === "string" ? value : null;
  } catch {
    token = null;
  }

  const jar = await cookies();
  const cookie = jar.get(SSO_STATE_COOKIE)?.value ?? null;
  const cleared = clearStateCookie();
  // Lands on whichever response goes out: Next merges the cookie jar into it.
  jar.set(cleared.name, cleared.value, cleared.options);

  try {
    return await finish(request, token, cookie);
  } catch (error) {
    // Spec §3.4: the cookie is cleared «always» — an error thrown out of the
    // handler would skip the cookie merge and show a raw 500.
    console.error("admin_sso_error " + (error instanceof Error ? error.message : String(error)));
    return seeOther(FAILURE_PATH);
  }
}

async function finish(request: Request, token: string | null, cookie: string | null): Promise<Response> {
  const result = await completeSso(
    { token, cookie, ip: clientIp(request.headers) },
    {
      verify: (t, state) => verifySsoToken(t, state),
      consumeJti,
      linkAdminUser,
      issueTicket,
      loginAttempt: prisma.loginAttempt,
      maxAttempts: MAX_ATTEMPTS,
      lockoutMinutes: LOCKOUT_MINUTES,
    },
  );
  if (!result.ok) return reject(result.reason);

  try {
    await purgeExpired();
  } catch (error) {
    console.error("admin_sso_purge_failed", (error as Error).message);
  }

  try {
    await signIn("hdctool-sso", { ticket: result.ticket, redirectTo: result.returnTo, redirect: false });
  } catch (error) {
    // The ticket was issued a moment ago; failing here means it was spent or
    // the user was deactivated in between.
    if (error instanceof AuthError) return reject("disabled_locally");
    throw error;
  }
  return seeOther(result.returnTo);
}

function reject(reason: SsoFailure): Response {
  console.warn("admin_sso_rejected reason=" + reason);
  return seeOther(FAILURE_PATH);
}

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}
