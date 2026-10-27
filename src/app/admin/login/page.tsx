import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { adminSsoConfig, ssoReady } from "@/lib/admin/sso/config";
import { upGreek } from "@/lib/greek";

export const metadata = { title: "Είσοδος διαχείρισης" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const { redirect: redirectTo, error } = await searchParams;

  // A half-configured environment renders as "off": staff keep the password form.
  const cfg = adminSsoConfig();
  const mode = ssoReady(cfg) ? cfg.mode : "off";
  const showSso = mode !== "off";
  const showPassword = mode !== "only";

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm font-bold tracking-widest text-white">{upGreek("Kolleris")}</p>
        <h1 className="mt-1 text-xs tracking-widest text-k-text-5">{upGreek("Διαχείριση E-shop")}</h1>

        <div className="mt-8 space-y-6">
          {showSso && (
            <div className="space-y-3">
              <form action="/api/admin/sso/start" method="post">
                <input type="hidden" name="redirect" value={redirectTo ?? "/admin"} />
                <button
                  type="submit"
                  className="w-full bg-k-red px-4 py-3 text-sm font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
                >
                  Σύνδεση με HDCtool
                </button>
              </form>
              <p className="text-xs text-k-text-5">Αν το HDCtool δεν είναι διαθέσιμο, δοκίμασε σε λίγο</p>
              {error === "sso" && (
                <p role="alert" className="text-sm text-k-red">
                  Η σύνδεση δεν ολοκληρώθηκε, ξαναδοκίμασε
                </p>
              )}
            </div>
          )}

          {showPassword && (
            <AdminPasswordForm failPath="/admin/login" redirectTo={redirectTo} error={error} />
          )}
        </div>
      </div>
    </div>
  );
}
