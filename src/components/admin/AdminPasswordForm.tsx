import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { upGreek } from "@/lib/greek";

/**
 * The email + password form, shared by the sign-in page (when SSO is off or
 * "both") and the hidden emergency page. `failPath` is where a failed attempt
 * lands, so the emergency page never bounces to the public sign-in page.
 */
export function AdminPasswordForm({
  failPath,
  redirectTo,
  error,
}: {
  failPath: string;
  redirectTo?: string;
  error?: string;
}) {
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
        redirect(`${failPath}?error=1${target ? `&redirect=${encodeURIComponent(target)}` : ""}`);
      }
      throw err;
    }
  }

  return (
    <form action={login} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo ?? "/admin"} />

      <div>
        <label htmlFor="email" className="block text-xs tracking-wider text-k-text-5">
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
        <label htmlFor="password" className="block text-xs tracking-wider text-k-text-5">
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

      {error === "revoked" ? (
        <p role="alert" className="text-sm text-k-red">
          Η συνεδρία σας έληξε επειδή άλλαξε ο κωδικός ή η πρόσβαση του λογαριασμού. Συνδεθείτε ξανά.
        </p>
      ) : error === "sso" ? null : error ? (
        <p role="alert" className="text-sm text-k-red">
          Λάθος στοιχεία ή ο λογαριασμός δεν είναι ενεργός. Μετά από 5 αποτυχημένες προσπάθειες η
          πρόσβαση κλειδώνει για 15 λεπτά.
        </p>
      ) : null}

      <button
        type="submit"
        className="w-full bg-k-red px-4 py-3 text-sm font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
      >
        {upGreek("Είσοδος")}
      </button>
    </form>
  );
}
