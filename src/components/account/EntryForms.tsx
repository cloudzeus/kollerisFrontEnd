"use client";

import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import {
  acceptInvitation,
  requestAccountLink,
  requestReset,
  submitNewPassword,
} from "@/lib/account/actions";

/**
 * The four forms that begin or end in a mailbox.
 *
 * Grouped in one file because they are one idea in four costumes: prove you
 * hold an address, then be let in. Splitting them across four files would put
 * the same input, the same button and the same "we may or may not have sent
 * something" message in four places and let them drift.
 *
 * Every message is written so it reads the same whether or not the address is
 * known. That is not politeness — a form that distinguishes is a form that
 * answers "does this person shop here" for anyone who asks.
 */

const INPUT =
  "t-input w-full border border-k-line-2 px-3.5 py-3 text-k-ink outline-none focus:border-k-ink";
const LABEL = "t-account-label mb-1.5 block text-k-text-4";
const BUTTON =
  "t-btn w-full bg-k-ink py-[15px] text-center text-white transition-colors hover:bg-k-red disabled:opacity-50";

function Notice({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return (
    <p
      className={`mb-4 border-l-[3px] px-4 py-3 text-[13px] leading-[1.55] ${
        tone === "ok"
          ? "border-k-green bg-k-surface-2 text-k-text-2"
          : "border-k-red bg-k-surface-2 text-k-text-2"
      }`}
    >
      {children}
    </p>
  );
}

/** «Έχω ήδη παραγγείλει» — email plus an order number, and a link goes out. */
export function ClaimAccountForm() {
  const [state, action, pending] = useActionState(requestAccountLink, {});

  if (state.sent) {
    return (
      <Notice tone="ok">
        Αν τα στοιχεία είναι σωστά, ο σύνδεσμος εγγραφής βρίσκεται ήδη στο email σας.
        Ισχύει για 72 ώρες.
      </Notice>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice tone="bad">{state.error}</Notice>}

      <label className="block">
        <span className={LABEL}>EMAIL ΠΑΡΑΓΓΕΛΙΑΣ</span>
        <input type="email" name="email" required autoComplete="email" className={INPUT} />
      </label>

      <label className="block">
        <span className={LABEL}>ΚΩΔΙΚΟΣ ΠΑΡΑΓΓΕΛΙΑΣ</span>
        <input
          type="text"
          name="orderNumber"
          required
          placeholder="KOL-20260806-0002"
          className={`${INPUT} numeral`}
        />
        <span className="mt-1.5 block text-[12px] leading-[1.5] text-k-text-3">
          Θα τον βρείτε στο email της παραγγελίας σας.
        </span>
      </label>

      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "ΑΠΟΣΤΟΛΗ…" : "ΑΠΟΣΤΟΛΗ ΣΥΝΔΕΣΜΟΥ"}
      </button>
    </form>
  );
}

/** «Ξέχασα τον κωδικό μου». */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestReset, {});

  if (state.sent) {
    return (
      <Notice tone="ok">
        Αν υπάρχει λογαριασμός με αυτό το email, ο σύνδεσμος επαναφοράς στάλθηκε.
        Ισχύει για 2 ώρες.
      </Notice>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <label className="block">
        <span className={LABEL}>EMAIL</span>
        <input type="email" name="email" required autoComplete="email" className={INPUT} />
      </label>
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "ΑΠΟΣΤΟΛΗ…" : "ΑΠΟΣΤΟΛΗ ΣΥΝΔΕΣΜΟΥ"}
      </button>
    </form>
  );
}

/** Set a new password from a reset link. */
export function NewPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(submitNewPassword, {});

  if (state.done) {
    return (
      <div>
        <Notice tone="ok">
          Ο κωδικός σας άλλαξε. Οι υπόλοιπες συνδέσεις σας τερματίστηκαν.
        </Notice>
        <Link href="/eisodos" className={BUTTON.replace("w-full", "inline-block px-8")}>
          ΣΥΝΔΕΣΗ
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <Notice tone="bad">{state.error}</Notice>}

      <label className="block">
        <span className={LABEL}>ΝΕΟΣ ΚΩΔΙΚΟΣ</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT}
        />
      </label>

      <label className="block">
        <span className={LABEL}>ΕΠΑΝΑΛΗΨΗ</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT}
        />
        {state.fieldErrors?.confirm && (
          <span className="mt-1.5 block text-[12px] text-k-red">{state.fieldErrors.confirm}</span>
        )}
      </label>

      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "ΑΠΟΘΗΚΕΥΣΗ…" : "ΑΠΟΘΗΚΕΥΣΗ"}
      </button>
    </form>
  );
}

/** Accept a registration invitation: choose a password, and you are in. */
export function AcceptInviteForm({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(acceptInvitation, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <Notice tone="bad">{state.error}</Notice>}

      <div className="border border-k-line bg-k-surface-2 px-4 py-3 text-[13px] text-k-text-2">
        {name && <div className="text-k-ink">{name}</div>}
        <div className="numeral">{email}</div>
      </div>

      <label className="block">
        <span className={LABEL}>ΚΩΔΙΚΟΣ</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT}
        />
        {state.fieldErrors?.password && (
          <span className="mt-1.5 block text-[12px] text-k-red">{state.fieldErrors.password}</span>
        )}
      </label>

      <label className="block">
        <span className={LABEL}>ΕΠΑΝΑΛΗΨΗ</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT}
        />
        {state.fieldErrors?.confirm && (
          <span className="mt-1.5 block text-[12px] text-k-red">{state.fieldErrors.confirm}</span>
        )}
      </label>

      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "ΔΗΜΙΟΥΡΓΙΑ…" : "ΔΗΜΙΟΥΡΓΙΑ ΛΟΓΑΡΙΑΣΜΟΥ"}
      </button>
    </form>
  );
}
