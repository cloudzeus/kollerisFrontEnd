import { redirect } from "next/navigation";
import { authState, signOut } from "@/auth";

/**
 * Ends a session the database no longer honours — the user was deactivated,
 * deleted, or had their password reset after signing in.
 *
 * Signs out only when the session really is revoked, so a link to this URL
 * cannot be used to log a working operator out.
 */
export async function GET() {
  if ((await authState()) !== "revoked") redirect("/admin");
  await signOut({ redirectTo: "/admin/login?error=revoked" });
}
