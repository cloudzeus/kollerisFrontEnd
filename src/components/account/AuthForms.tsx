"use client";

import { useActionState, useState } from "react";
import { CompanyVatFields } from "@/components/account/CompanyVatFields";
import { register, signIn, updateProfile, type AuthState } from "@/lib/account/actions";
import type { AccountUser } from "@/lib/account/contract";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Sign in, register and profile — three forms, one file.
 *
 * They share the field primitives and the same `AuthState` shape from the
 * actions, and splitting them across three files would mean three copies of
 * `Field`. Each is a thin client wrapper around a server action; every rule
 * they express is enforced again server-side.
 */

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <FormError message={state.error} />

      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Field
        label="Κωδικός"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <button
        type="submit"
        disabled={pending}
        className="t-btn h-13 bg-k-red py-4 text-white transition-colors hover:bg-k-red-hover disabled:opacity-60"
      >
        {pending ? "…" : upGreek("Σύνδεση")}
      </button>

      <p className="text-[12.5px] text-k-text-3">
        Δεν έχετε λογαριασμό;{" "}
        <Link href="/eggrafi" className="font-semibold text-k-ink underline underline-offset-4 hover:text-k-red">
          Εγγραφείτε
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(register, {});
  const [accountType, setAccountType] = useState<"individual" | "company">("individual");

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormError message={state.error} />

      <fieldset>
        <legend className="t-account-label mb-2.5 text-k-text-4">{upGreek("Τύπος λογαριασμού")}</legend>
        <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2">
          {(
            [
              {
                value: "individual",
                title: "Ιδιώτης",
                body: "Παραγγελίες, διευθύνσεις, εγγυήσεις και επιστροφές.",
              },
              {
                value: "company",
                title: "Εταιρεία (B2B)",
                body: "Τιμές συνεργάτη, πληρωμή επί πιστώσει, πολλοί χρήστες με ρόλους και όρια.",
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 p-4 transition-colors ${
                accountType === option.value ? "bg-k-surface-2" : "bg-white"
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value={option.value}
                checked={accountType === option.value}
                onChange={() => setAccountType(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-k-red"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-k-ink">{option.title}</span>
                <span className="mt-1 block text-[11.5px] leading-[1.5] text-k-text-3">{option.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {accountType === "company" && (
        <div className="border-l-[3px] border-k-red bg-k-surface-2 p-4">
          <p className="t-eyebrow mb-3.5 text-k-red">{upGreek("Στοιχεία εταιρείας")}</p>
          {/* Same component as checkout — the ΑΦΜ fills the rest from the ΑΑΔΕ. */}
          <CompanyVatFields required showAddress fieldErrors={state.fieldErrors} />
          <p className="mt-4 flex items-start gap-2.5 border-t border-k-line pt-3.5 text-[11.5px] leading-[1.55] text-k-text-3">
            <span aria-hidden className="mt-1 block h-1.5 w-1.5 shrink-0 bg-k-amber" />
            Οι εταιρικοί λογαριασμοί ελέγχονται πριν ενεργοποιηθούν — συνήθως σε 2
            εργάσιμες. Θα ειδοποιηθείτε με email.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Όνομα" name="firstName" required error={state.fieldErrors?.firstName} />
        <Field label="Επώνυμο" name="lastName" required error={state.fieldErrors?.lastName} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
        <Field label="Κινητό" name="phone" type="tel" autoComplete="tel" required error={state.fieldErrors?.phone} />
        <div className="sm:col-span-2">
          <Field
            label="Κωδικός"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            error={state.fieldErrors?.password}
            help="Τουλάχιστον 8 χαρακτήρες, με γράμματα και αριθμούς."
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4 shrink-0 accent-k-red" />
        <span className="text-[12.5px] leading-[1.5] text-k-text-2">
          Αποδέχομαι τους όρους χρήσης και την πολιτική απορρήτου.
          {state.fieldErrors?.terms && (
            <span className="mt-1 block text-[11px] text-k-red">{state.fieldErrors.terms}</span>
          )}
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="t-btn h-13 bg-k-red py-4 text-white transition-colors hover:bg-k-red-hover disabled:opacity-60"
      >
        {pending ? "…" : upGreek(accountType === "company" ? "Αίτηση εταιρικού λογαριασμού" : "Εγγραφή")}
      </button>

      <p className="text-[12.5px] text-k-text-3">
        Έχετε ήδη λογαριασμό;{" "}
        <Link href="/eisodos" className="font-semibold text-k-ink underline underline-offset-4 hover:text-k-red">
          Συνδεθείτε
        </Link>
      </p>
    </form>
  );
}

export function ProfileForm({ user }: { user: AccountUser }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updateProfile, {});
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (formData) => {
        setSaved(false);
        await action(formData);
        setSaved(true);
      }}
      className="flex max-w-xl flex-col gap-5"
    >
      <FormError message={state.error} />
      {saved && !state.error && (
        <p className="border-l-[3px] border-k-green bg-k-green/8 px-4 py-3 text-[12.5px] text-k-ink">
          Τα στοιχεία σας αποθηκεύτηκαν.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Όνομα" name="firstName" defaultValue={user.firstName} required />
        <Field label="Επώνυμο" name="lastName" defaultValue={user.lastName} required />
      </div>
      <Field label="Κινητό" name="phone" type="tel" defaultValue={user.phone ?? ""} required />

      {/* Email is the login identifier — changing it is a support action, not a
          form field, or a typo locks the customer out of their own account. */}
      <label className="block">
        <span className="t-account-label mb-1.5 block text-k-text-4">{upGreek("Email")}</span>
        <input
          value={user.email}
          readOnly
          className="t-input h-12 w-full border border-k-line-2 bg-k-surface-3 px-3.5 text-k-text-3 outline-none"
        />
        <span className="mt-1 block text-[11px] text-k-text-4">
          Για αλλαγή email καλέστε μας στο 210 411 1355.
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="t-btn-sm self-start bg-k-ink px-7 py-3.5 text-white transition-colors hover:bg-k-red disabled:opacity-60"
      >
        {pending ? "…" : upGreek("Αποθήκευση")}
      </button>
    </form>
  );
}

// ── Shared primitives ───────────────────────────────────────────────────────

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[13px] leading-[1.5] text-k-ink">
      {message}
    </p>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  defaultValue,
  error,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="t-account-label mb-1.5 block text-k-text-4">
        {upGreek(label)}
        {required && <span className="ml-1 text-k-red">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className={`t-input h-12 w-full border px-3.5 text-k-ink outline-none focus:border-k-ink ${
          error ? "border-k-red" : "border-k-line-2"
        }`}
      />
      {error && <span className="mt-1 block text-[11px] text-k-red">{error}</span>}
      {help && !error && <span className="mt-1 block text-[11px] text-k-text-4">{help}</span>}
    </label>
  );
}
