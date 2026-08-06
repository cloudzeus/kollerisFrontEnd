"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { accountStore } from "@/lib/account/account-store";
import {
  clearCustomerSession,
  getCustomerToken,
  getViewer,
  setCustomerSession,
} from "@/lib/account/session";
import { lookupVat } from "@/lib/account/vat-lookup";
import { isValidAfm, normaliseAfm, type VatLookupResult } from "@/lib/account/vat";

/**
 * Account server actions.
 *
 * The ΑΦΜ lookup is an action rather than a route handler on purpose: it is
 * only ever called from a form, it needs no caching, and keeping the HDCtool
 * bearer behind a server action means there is no public endpoint on this app
 * that will happily enumerate the AADE registry for anyone who finds it.
 */

const afmSchema = z.object({ afm: z.string().min(1).max(32) });

export async function lookupCompanyByVat(input: unknown): Promise<VatLookupResult> {
  const parsed = afmSchema.safeParse(input);
  if (!parsed.success) return { found: false, reason: "invalid" };
  return lookupVat(parsed.data.afm);
}

// ── Sign in / sign up ───────────────────────────────────────────────────────

export type AuthState = { error?: string; fieldErrors?: Record<string, string> };

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
  redirectTo: z.string().max(512).optional(),
});

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: "Λάθος email ή κωδικός.",
  locked_out: "Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε 15 λεπτά.",
  pending_approval:
    "Ο εταιρικός λογαριασμός σας δεν έχει εγκριθεί ακόμη. Ενεργοποιείται σε 2 εργάσιμες.",
  suspended: "Ο λογαριασμός σας έχει ανασταλεί. Καλέστε μας στο 210 411 1355.",
};

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: { email: "Συμπληρώστε email και κωδικό" } };
  }

  let result;
  try {
    result = await accountStore.login({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    });
  } catch (error) {
    return { error: backendMessage(error) };
  }

  if (!result.ok) return { error: LOGIN_ERRORS[result.error] ?? "Η σύνδεση απέτυχε." };

  await setCustomerSession(result.token);
  // Outside the try — `redirect` works by throwing.
  redirect(safeRedirect(parsed.data.redirectTo));
}

/**
 * `redirectTo` comes from the query string, so it is attacker-controlled. Only
 * same-site paths are honoured; anything else lands on the account page.
 */
function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/logariasmos";
  return target;
}

const PASSWORD = z
  .string()
  .min(8, "Τουλάχιστον 8 χαρακτήρες")
  .max(256)
  .refine((v) => /[A-Za-zΑ-Ωα-ω]/.test(v) && /\d/.test(v), "Χρειάζεται γράμματα και αριθμούς");

const baseRegister = {
  email: z.email().max(320),
  password: PASSWORD,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(64),
  terms: z.union([z.literal("on"), z.literal("")]).optional(),
};

const registerSchema = z.discriminatedUnion("accountType", [
  z.object({ accountType: z.literal("individual"), ...baseRegister }),
  z.object({
    accountType: z.literal("company"),
    ...baseRegister,
    vatNumber: z.string().trim().min(1).max(32),
    companyName: z.string().trim().min(2).max(255),
    taxOffice: z.string().trim().max(120).optional().or(z.literal("")),
    companyTrade: z.string().trim().max(255).optional().or(z.literal("")),
    billLine1: z.string().trim().max(255).optional().or(z.literal("")),
    billCity: z.string().trim().max(120).optional().or(z.literal("")),
    billPostcode: z.string().trim().max(16).optional().or(z.literal("")),
    erpTrdr: z.coerce.number().int().positive().optional().or(z.literal("")),
  }),
]);

const REGISTER_ERRORS: Record<string, string> = {
  email_taken: "Υπάρχει ήδη λογαριασμός με αυτό το email.",
  afm_taken: "Υπάρχει ήδη εταιρικός λογαριασμός με αυτό το ΑΦΜ. Ζητήστε πρόσκληση από τον διαχειριστή σας.",
  weak_password: "Ο κωδικός είναι πολύ αδύναμος.",
  invalid_afm: "Το ΑΦΜ δεν είναι έγκυρο.",
};

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData);
  const parsed = registerSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, error: "Ελέγξτε τα σημειωμένα πεδία." };
  }
  if (parsed.data.terms !== "on") {
    return { fieldErrors: { terms: "Πρέπει να αποδεχτείτε τους όρους" } };
  }

  const input = parsed.data;
  const common = {
    email: input.email.toLowerCase(),
    password: input.password,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  };

  let result;
  try {
    if (input.accountType === "individual") {
      result = await accountStore.register({ accountType: "individual", ...common });
    } else {
      const afm = normaliseAfm(input.vatNumber);
      // Checked here as well as in HDCtool: an invalid ΑΦΜ should cost a form
      // error, not a round-trip and a generic failure.
      if (!isValidAfm(afm)) {
        return { fieldErrors: { vatNumber: "Το ΑΦΜ δεν είναι έγκυρο (9 ψηφία)" } };
      }
      result = await accountStore.register({
        accountType: "company",
        ...common,
        afm,
        companyName: input.companyName,
        doy: input.taxOffice || null,
        profession: input.companyTrade || null,
        billAddress: input.billLine1 || null,
        billCity: input.billCity || null,
        billPostcode: input.billPostcode || null,
        trdr: typeof input.erpTrdr === "number" ? input.erpTrdr : null,
      });
    }
  } catch (error) {
    return { error: backendMessage(error) };
  }

  if (!result.ok) {
    const message = REGISTER_ERRORS[result.error] ?? "Η εγγραφή απέτυχε.";
    const field = result.error === "email_taken" ? "email" : result.error === "afm_taken" ? "vatNumber" : null;
    return field ? { fieldErrors: { [field]: message }, error: message } : { error: message };
  }

  // A company registration must NOT sign in — it waits for approval.
  if (result.token) {
    await setCustomerSession(result.token);
    redirect("/logariasmos");
  }
  redirect("/eggrafi/anamoni");
}

export async function signOut() {
  const token = await getCustomerToken();
  if (token) {
    // Best effort: the local cookie must go regardless of what HDCtool says.
    await accountStore.logout(token).catch(() => {});
  }
  await clearCustomerSession();
  redirect("/");
}

// ── Profile ─────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(64),
});

export async function updateProfile(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const token = await getCustomerToken();
  if (!token) return { error: "Η συνεδρία έληξε. Συνδεθείτε ξανά." };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ελέγξτε τα στοιχεία σας." };

  try {
    await accountStore.updateProfile(token, parsed.data);
  } catch (error) {
    return { error: backendMessage(error) };
  }

  revalidatePath("/logariasmos");
  revalidatePath("/b2b");
  return { error: undefined };
}

// ── Company members (B2B, owners only) ──────────────────────────────────────

const inviteSchema = z.object({
  email: z.email().max(320),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  role: z.enum(["owner", "buyer", "viewer"]),
  spendLimit: z.coerce.number().min(0).max(1_000_000).optional().or(z.literal("")),
});

export async function inviteMember(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ελέγξτε τα στοιχεία της πρόσκλησης." };

  try {
    const result = await accountStore.inviteMember(guard.token, {
      email: parsed.data.email.toLowerCase(),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role,
      spendLimit: typeof parsed.data.spendLimit === "number" ? parsed.data.spendLimit : null,
    });
    if (!result.ok) {
      return {
        error:
          result.error === "email_taken"
            ? "Υπάρχει ήδη χρήστης με αυτό το email."
            : "Δεν έχετε δικαίωμα πρόσκλησης χρηστών.",
      };
    }
  } catch (error) {
    return { error: backendMessage(error) };
  }

  revalidatePath("/b2b/xristes");
  return {};
}

const memberUpdateSchema = z.object({
  memberId: z.string().min(1).max(64),
  role: z.enum(["owner", "buyer", "viewer"]).optional(),
  spendLimit: z.coerce.number().min(0).max(1_000_000).optional().or(z.literal("")),
  status: z.enum(["active", "suspended"]).optional(),
});

const MEMBER_ERRORS: Record<string, string> = {
  not_found: "Ο χρήστης δεν βρέθηκε.",
  not_allowed: "Δεν έχετε δικαίωμα για αυτή την αλλαγή.",
  last_owner: "Πρέπει να μείνει τουλάχιστον ένας διαχειριστής στην εταιρεία.",
};

export async function updateMember(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const parsed = memberUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Μη έγκυρη αλλαγή." };

  try {
    const result = await accountStore.updateMember(guard.token, {
      memberId: parsed.data.memberId,
      role: parsed.data.role,
      spendLimit: typeof parsed.data.spendLimit === "number" ? parsed.data.spendLimit : undefined,
      status: parsed.data.status,
    });
    if (!result.ok) return { error: MEMBER_ERRORS[result.error ?? ""] ?? "Η αλλαγή απέτυχε." };
  } catch (error) {
    return { error: backendMessage(error) };
  }

  revalidatePath("/b2b/xristes");
  return {};
}

export async function removeMember(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) return { error: "Μη έγκυρος χρήστης." };

  try {
    const result = await accountStore.removeMember(guard.token, memberId);
    if (!result.ok) return { error: MEMBER_ERRORS[result.error ?? ""] ?? "Η αφαίρεση απέτυχε." };
  } catch (error) {
    return { error: backendMessage(error) };
  }

  revalidatePath("/b2b/xristes");
  return {};
}

/**
 * Every member mutation re-checks the role SERVER-side.
 *
 * The B2B users screen only renders these controls for owners, but a hidden
 * button is not a permission — this is where it is actually enforced.
 */
type OwnerGuard = { ok: true; token: string } | { ok: false; state: AuthState };

async function requireOwner(): Promise<OwnerGuard> {
  const [token, viewer] = await Promise.all([getCustomerToken(), getViewer()]);
  if (!token || !viewer.user) {
    return { ok: false, state: { error: "Η συνεδρία έληξε. Συνδεθείτε ξανά." } };
  }
  if (!viewer.can("manageUsers")) {
    return { ok: false, state: { error: "Δεν έχετε δικαίωμα διαχείρισης χρηστών." } };
  }
  return { ok: true, token };
}

function backendMessage(error: unknown): string {
  // Never surfaced verbatim: the message reaches a login form, and a database
  // error string is an information leak there.
  console.error("[account]", error);
  return "Κάτι πήγε στραβά. Δοκιμάστε ξανά σε λίγο.";
}

// ─── Entry points that start in a mailbox ───────────────────────────────────

/**
 * The three ways somebody gets back into an account they cannot sign into.
 *
 * All four actions below share one shape: they take a form, they return a
 * message, and they never let the answer reveal whether an address is known.
 * That last part is the reason they live here rather than being called from a
 * page — a server action can decide what to say; a client that queried a
 * lookup endpoint could not.
 */

/** «Έχω παραγγείλει και θέλω λογαριασμό» — email plus an order number. */
export async function requestAccountLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState & { sent?: boolean }> {
  const email = String(formData.get("email") ?? "");
  const orderNumber = String(formData.get("orderNumber") ?? "");

  const { requestRegistrationLink } = await import("@/lib/account/registration-invite");
  const result = await requestRegistrationLink({ email, orderNumber });

  if (!result.ok) return { error: result.error };
  /*
   * `sent` is returned whether or not anything matched. The page says "if the
   * details are right, the link is on its way", which is true in both cases
   * and useless to somebody probing for addresses.
   */
  return { sent: true };
}

/** «Ξέχασα τον κωδικό μου». */
export async function requestReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState & { sent?: boolean }> {
  const { requestPasswordReset } = await import("@/lib/account/password-reset");
  const result = await requestPasswordReset(String(formData.get("email") ?? ""));
  if (!result.ok) return { error: result.error };
  return { sent: true };
}

/** Set a new password from a reset link, then send them to sign in. */
export async function submitNewPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState & { done?: boolean }> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) {
    return { fieldErrors: { confirm: "Οι κωδικοί δεν ταιριάζουν." } };
  }

  const { setNewPassword } = await import("@/lib/account/password-reset");
  const result = await setNewPassword(token, password);
  if (!result.ok) return { error: result.error };
  return { done: true };
}

/**
 * Accept a registration invitation: create the account and sign them in.
 *
 * The session is issued here rather than sending them to the login form. They
 * have just proved they hold the mailbox and chosen a password; asking them to
 * type it again immediately is a step that exists only because it was easier
 * to build.
 */
export async function acceptInvitation(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { fieldErrors: { password: "Τουλάχιστον 8 χαρακτήρες." } };
  }
  if (password !== confirm) {
    return { fieldErrors: { confirm: "Οι κωδικοί δεν ταιριάζουν." } };
  }

  const { resolveInvite, completeInvite } = await import("@/lib/account/registration-invite");
  const invite = await resolveInvite(token);
  if (!invite) {
    return { error: "Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί." };
  }

  const result = await accountStore.register({
    email: invite.email,
    password,
    firstName: invite.firstName || "—",
    lastName: invite.lastName || "—",
    phone: invite.phone || "",
    accountType: "individual",
  } as Parameters<typeof accountStore.register>[0]);

  if (!result.ok) {
    return {
      error:
        result.error === "email_taken"
          ? "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε."
          : "Η εγγραφή δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
    };
  }

  const adopted = await completeInvite(token, result.user.id, invite.email);
  console.log(`[invite] ${invite.email} registered, adopted ${adopted.adopted} order(s)`);

  /*
   * `register` returns a null token for a company awaiting approval. This path
   * only ever creates `individual` accounts, so a null here would mean the
   * contract changed under us — send them to sign in rather than pretend.
   */
  if (result.token) await setCustomerSession(result.token);
  redirect(result.token ? "/logariasmos" : "/eisodos");
}
