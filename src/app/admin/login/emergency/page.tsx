import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { upGreek } from "@/lib/greek";

export const metadata = {
  title: "Είσοδος διαχείρισης (έκτακτη)",
  robots: { index: false, follow: false },
};

/**
 * Break-glass password sign-in. Not linked from anywhere; works whatever the
 * SSO mode (the server still decides who may use a password in "only" mode).
 */
export default async function AdminEmergencyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const { redirect: redirectTo, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm font-bold tracking-widest text-white">{upGreek("Kolleris")}</p>
        <h1 className="mt-1 text-xs tracking-widest text-k-text-5">{upGreek("Διαχείριση E-shop")}</h1>
        <div className="mt-8">
          <AdminPasswordForm failPath="/admin/login/emergency" redirectTo={redirectTo} error={error} />
        </div>
      </div>
    </div>
  );
}
