import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { upGreek } from "@/lib/greek";

export const metadata = { title: "Είσοδος διαχείρισης" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const { redirect: redirectTo, error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const target = (formData.get("redirect") as string) || "/admin";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: target,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        // Deliberately generic: never reveal whether the account exists, is
        // inactive, or is locked out — all three look identical to the caller.
        redirect(
          `/admin/login?error=1${
            target ? `&redirect=${encodeURIComponent(target)}` : ""
          }`,
        );
      }
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm font-bold tracking-widest text-white">
          {upGreek("Kolleris")}
        </p>
        <h1 className="mt-1 text-xs tracking-widest text-k-text-5">
          {upGreek("Διαχείριση E-shop")}
        </h1>

        <form action={login} className="mt-8 space-y-4">
          <input type="hidden" name="redirect" value={redirectTo ?? "/admin"} />

          <div>
            <label
              htmlFor="email"
              className="block text-xs tracking-wider text-k-text-5"
            >
              EMAIL
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1.5 w-full border border-white/20 bg-transparent px-3 py-2.5 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs tracking-wider text-k-text-5"
            >
              ΚΩΔΙΚΟΣ
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full border border-white/20 bg-transparent px-3 py-2.5 text-white outline-none focus:border-white"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-k-red">
              Λάθος στοιχεία ή ο λογαριασμός δεν είναι ενεργός. Μετά από 5
              αποτυχημένες προσπάθειες η πρόσβαση κλειδώνει για 15 λεπτά.
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-k-red px-4 py-3 text-sm font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
          >
            {upGreek("Είσοδος")}
          </button>
        </form>
      </div>
    </div>
  );
}
