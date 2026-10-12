import type { FollowUps, RecheckOutcome } from "@/lib/payment/confirm-payment";

/**
 * What the admin reads after «Καταχώριση» or «Επανέλεγχος πληρωμής».
 *
 * The payment is the fact; the follow-ups are consequences that can fail on
 * their own. So a success is reported as a success, and each failed follow-up
 * becomes a warning next to it — «Η πληρωμή καταχωρίστηκε· η αποστολή στο
 * HDCtool απέτυχε: …» — never as an error that suggests the payment did not
 * happen.
 */

export type PaymentActionResult =
  | { ok: true; message: string; warnings: string[] }
  | { ok: false; error: string };

export function followUpWarnings(f: FollowUps): string[] {
  const warnings: string[] = [];
  if (!f.erpDocument.ok) {
    warnings.push(
      `Η αποστολή στο HDCtool/SoftOne απέτυχε: ${f.erpDocument.error} — ` +
        "δοκιμάστε ξανά με «Αποστολή στο SoftOne» από τη λίστα παραγγελιών.",
    );
  } else if (!f.erpSync.ok) {
    // Only worth saying when the document did not go through anyway: the
    // document push re-sends the same intake body.
    warnings.push(`Η ενημέρωση πληρωμής στο HDCtool απέτυχε: ${f.erpSync.error}`);
  }
  if (!f.receipt.ok) warnings.push(`Το email στον πελάτη δεν στάλθηκε: ${f.receipt.error}`);
  if (!f.internal.ok) warnings.push(`Το εσωτερικό email δεν στάλθηκε: ${f.internal.error}`);
  return warnings;
}

function documentLine(f: FollowUps): string {
  if (!f.erpDocument.ok) return "";
  const doc = f.erpDocument.fincode ?? (f.erpDocument.findoc != null ? String(f.erpDocument.findoc) : null);
  return doc ? ` Παραστατικό SoftOne ${doc}${f.erpDocument.alreadySent ? " (υπήρχε ήδη)" : ""}.` : "";
}

export function describeFollowUps(prefix: string, f: FollowUps): PaymentActionResult {
  const warnings = followUpWarnings(f);
  return {
    ok: true,
    message: `${prefix}${warnings.length ? "· με εκκρεμότητες." : "."}${documentLine(f)}`,
    warnings,
  };
}

const euro = (cents: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

const STATE_TEXT: Record<number, string> = {
  0: "Η εντολή πληρωμής στη Viva εκκρεμεί — δεν έχει καταγραφεί πληρωμή ακόμη.",
  1:
    "Ο κωδικός πληρωμής Viva έχει λήξει και δεν βρέθηκε ολοκληρωμένη πληρωμή. Κατάθεση μέσω " +
    "e-banking (ΔΙΑΣ) μπορεί να φτάσει και μετά τη λήξη· δοκιμάστε ξανά αργότερα.",
  2: "Η εντολή πληρωμής ακυρώθηκε στη Viva και δεν βρέθηκε ολοκληρωμένη πληρωμή.",
  3:
    "Η Viva δείχνει την εντολή πληρωμένη, αλλά δεν βρέθηκε ολοκληρωμένη συναλλαγή γι' αυτήν. " +
    "Ελέγξτε τη συναλλαγή στο portal της Viva.",
};

export function describeRecheck(outcome: RecheckOutcome): PaymentActionResult {
  switch (outcome.kind) {
    case "paid":
      return describeFollowUps(
        `Η Viva επιβεβαίωσε την πληρωμή (συναλλαγή ${outcome.transactionId}) και η παραγγελία σημειώθηκε πληρωμένη`,
        outcome.followUps,
      );
    case "already_paid":
      return { ok: true, message: "Η παραγγελία είναι ήδη πληρωμένη — δεν χρειάστηκε αλλαγή.", warnings: [] };
    case "amount_mismatch":
      return {
        ok: false,
        error:
          `Η Viva έχει πληρωμή ${euro(outcome.capturedCents)} αλλά η παραγγελία είναι ` +
          `${euro(outcome.expectedCents)}. Δεν σημειώθηκε πληρωμένη· η διαφορά γράφτηκε στο ιστορικό.`,
      };
    case "not_paid":
      return {
        ok: false,
        error:
          (outcome.stateId != null ? STATE_TEXT[outcome.stateId] : undefined) ??
          "Η Viva δεν έχει ολοκληρωμένη πληρωμή γι' αυτή την παραγγελία.",
      };
    case "no_order_code":
      return {
        ok: false,
        error:
          "Η παραγγελία δεν έχει κωδικό πληρωμής Viva, άρα η Viva δεν μπορεί να γνωρίζει την " +
          "κατάθεση. Αν τα χρήματα ήρθαν απευθείας στο IBAN, χρησιμοποιήστε «Καταχώριση πληρωμής».",
      };
    case "not_configured":
      return {
        ok: false,
        error:
          "Ο επανέλεγχος χρειάζεται Merchant ID και API key της Viva (VIVA_MERCHANT_ID, VIVA_API_KEY), " +
          "που δεν είναι ρυθμισμένα στον server.",
      };
    case "not_found":
      return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };
    case "error":
      return { ok: false, error: `Η Viva δεν απάντησε: ${outcome.error}` };
  }
}

export type SweepSummary = {
  ok: boolean;
  /** «Ελέγχθηκαν N · Ολοκληρώθηκαν X (…) · Σε αναμονή Y · Σφάλματα Z» */
  message: string;
  /** One line per thing somebody should look at. */
  details: string[];
};

export function describeSweep(
  result:
    | {
        ok: true;
        checked: number;
        paid: Array<{ orderNumber: string; warnings: string[] }>;
        stillPending: number;
        mismatches: Array<{ orderNumber: string; capturedCents: number; expectedCents: number }>;
        errors: Array<{ orderNumber: string; message: string }>;
        truncated: boolean;
      }
    | { ok: false; message: string },
): SweepSummary {
  if (!result.ok) return { ok: false, message: result.message, details: [] };

  const paid = result.paid.map((p) => p.orderNumber);
  const message =
    `Ελέγχθηκαν ${result.checked} · Ολοκληρώθηκαν ${paid.length}` +
    (paid.length ? ` (${paid.join(", ")})` : "") +
    ` · Σε αναμονή ${result.stillPending} · Σφάλματα ${result.errors.length}`;

  const details = [
    ...result.mismatches.map(
      (m) =>
        `${m.orderNumber}: η Viva έχει ${euro(m.capturedCents)} αντί για ${euro(m.expectedCents)} — δεν σημειώθηκε πληρωμένη.`,
    ),
    ...result.errors.map((e) => `${e.orderNumber}: ${e.message}`),
    ...result.paid.flatMap((p) => p.warnings.map((w) => `${p.orderNumber}: ${w}`)),
    ...(result.truncated ? ["Δεν ελέγχθηκαν όλες στον διαθέσιμο χρόνο — πατήστε ξανά για τις υπόλοιπες."] : []),
  ];
  return { ok: true, message, details };
}
