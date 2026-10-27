import { adminSsoConfig, ssoReady } from "@/lib/admin/sso/config";
import { startSso } from "@/lib/admin/sso/flow";

/**
 * «Σύνδεση με HDCtool» (spec §3.1): sets the state cookie and sends the
 * browser to HDCtool. POST only, from the login form's button.
 */
export async function POST(request: Request) {
  const cfg = adminSsoConfig();
  if (!ssoReady(cfg)) return new Response(null, { status: 404 });

  let redirect: string | null = null;
  try {
    const value = (await request.formData()).get("redirect");
    redirect = typeof value === "string" ? value : null;
  } catch {
    redirect = null;
  }

  const { location, cookie } = startSso(redirect, cfg);
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Set-Cookie": cookie, "Cache-Control": "no-store" },
  });
}
