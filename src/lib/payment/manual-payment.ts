import "server-only";
import { prisma } from "@/lib/prisma";
import { afterPaymentConfirmed, markOrderPaid, toCents, type FollowUps } from "@/lib/payment/confirm-payment";
import { requestBlocksPayment } from "@/lib/requests/model";

/**
 * «Καταχώριση πληρωμής» — the operator says the money is in the account.
 *
 * The fallback for a deposit made straight to the company IBAN, which no
 * payment provider will ever report. A deposit made with the Viva payment code
 * is NOT this case: Viva knows about it, and «Επανέλεγχος πληρωμής» asks Viva
 * and records the transaction id. This path records a person's word instead,
 * so it asks for the things a person can get wrong — the date, the exact
 * amount, an explicit confirmation — and writes who said it into the history.
 *
 * Kept free of anything but the order and the shared paid path, so the rules
 * can be tested without a session or a browser.
 */

export type ManualPaymentInput = {
  /** `YYYY-MM-DD`, the day the money was credited (Europe/Athens). */
  paidOn: string;
  /** As typed: «123,45» or «123.45». Must equal the order total to the cent. */
  amount: string;
  /** Bank reference / transaction number / free note. Optional. */
  reference?: string;
  /** «Επιβεβαίωσα ότι το ποσό έχει πιστωθεί στον λογαριασμό». */
  confirmed: boolean;
};

export type ValidatedManualPayment = {
  paidAt: Date;
  paidOn: string;
  amountCents: number;
  reference: string | null;
};

const ATHENS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Athens",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day a moment falls on in Athens, as `YYYY-MM-DD`. */
export function athensDay(date: Date): string {
  return ATHENS_DAY.format(date);
}

/**
 * «1.234,56», «1234,56», «1234.56», «1234» → cents. Null when it is not a
 * plain amount with at most two decimals.
 */
export function parseAmountToCents(raw: string): number | null {
  let s = raw.replace(/[\s€]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return toCents(Number(s));
}

const euro = (cents: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

export const REFERENCE_MAX = 200;

export function validateManualPayment(
  input: ManualPaymentInput,
  order: { createdAt: Date; totalGross: unknown },
  now: Date = new Date(),
): { ok: true; value: ValidatedManualPayment } | { ok: false; error: string } {
  if (!input.confirmed) {
    return {
      ok: false,
      error: "Επιβεβαιώστε ότι το ποσό έχει πιστωθεί στον λογαριασμό πριν την καταχώριση.",
    };
  }

  const paidOn = (input.paidOn ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(`${paidOn}T00:00:00Z`))) {
    return { ok: false, error: "Η ημερομηνία πληρωμής δεν είναι έγκυρη." };
  }
  const today = athensDay(now);
  const created = athensDay(order.createdAt);
  if (paidOn > today) {
    return { ok: false, error: "Η ημερομηνία πληρωμής δεν μπορεί να είναι μελλοντική." };
  }
  if (paidOn < created) {
    return {
      ok: false,
      error: `Η ημερομηνία πληρωμής δεν μπορεί να είναι πριν από τη δημιουργία της παραγγελίας (${created}).`,
    };
  }

  const amountCents = parseAmountToCents(input.amount ?? "");
  if (amountCents == null) {
    return { ok: false, error: "Το ποσό δεν είναι έγκυρο. Γράψτε το π.χ. 123,45." };
  }
  const expectedCents = toCents(Number(order.totalGross));
  if (amountCents !== expectedCents) {
    return {
      ok: false,
      error:
        `Το ποσό που πιστώθηκε (${euro(amountCents)}) διαφέρει από το σύνολο της παραγγελίας ` +
        `(${euro(expectedCents)}). Η πληρωμή δεν καταχωρίστηκε — ελέγξτε την κατάθεση ή ` +
        "επικοινωνήστε με τον πελάτη για τη διαφορά.",
    };
  }

  const reference = (input.reference ?? "").trim().replace(/\s+/g, " ");
  if (reference.length > REFERENCE_MAX) {
    return { ok: false, error: `Η αναφορά/σημείωση ξεπερνά τους ${REFERENCE_MAX} χαρακτήρες.` };
  }

  /*
   * Today → now. An earlier day → midday Athens (09:00Z is 11:00 or 12:00
   * there), never before the order existed. The day is what the operator
   * knows; inventing a time of day more precise than that would be fiction.
   */
  let paidAt = paidOn === today ? now : new Date(`${paidOn}T09:00:00Z`);
  if (paidAt < order.createdAt) paidAt = order.createdAt;

  return { ok: true, value: { paidAt, paidOn, amountCents, reference: reference || null } };
}

const METHOD_NOTE: Record<string, string> = {
  bank: "τραπεζική κατάθεση",
  card: "κάρτα",
  iris: "IRIS",
  credit: "επί πιστώσει",
};

export type ManualPaymentResult =
  | { ok: true; alreadyPaid: true }
  | { ok: true; alreadyPaid: false; followUps: FollowUps }
  | { ok: false; error: string };

export async function recordManualPayment(
  orderNumber: string,
  input: ManualPaymentInput,
  actor: string,
  now: Date = new Date(),
): Promise<ManualPaymentResult> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      totalGross: true,
      createdAt: true,
      requestStatus: true,
    },
  });
  if (!order) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };

  // Friendly no-op: a second click, or a webhook that arrived meanwhile.
  if (order.paymentStatus === "PAID") return { ok: true, alreadyPaid: true };

  if (order.paymentStatus === "REFUNDED") {
    return { ok: false, error: "Η πληρωμή της παραγγελίας έχει επιστραφεί — δεν καταχωρίζεται νέα." };
  }

  if (order.status === "CANCELLED") {
    return { ok: false, error: "Η παραγγελία είναι ακυρωμένη — δεν καταχωρίζεται πληρωμή." };
  }

  /* A back-order request becomes payable only once the customer accepts an offer. */
  if (requestBlocksPayment(order.requestStatus)) {
    return {
      ok: false,
      error: "Αίτημα κατόπιν παραγγελίας χωρίς αποδεκτή πρόταση — δεν καταχωρίζεται πληρωμή.",
    };
  }

  const checked = validateManualPayment(input, order, now);
  if (!checked.ok) return checked;
  const { paidAt, paidOn, amountCents, reference } = checked.value;

  const method = METHOD_NOTE[order.paymentMethod] ?? order.paymentMethod;
  const note =
    `Χειροκίνητη καταχώριση πληρωμής (${method}) · ${euro(amountCents)} · πίστωση ${paidOn}` +
    (reference ? ` · ref ${reference}` : "");

  const result = await markOrderPaid({
    order,
    amount: amountCents / 100,
    paidAt,
    actor,
    note,
  });
  if (result.kind === "already_paid") return { ok: true, alreadyPaid: true };
  if (result.kind === "amount_mismatch") {
    // Unreachable after validation; kept so a future change cannot fall through.
    return { ok: false, error: "Το ποσό δεν ταιριάζει με το σύνολο της παραγγελίας." };
  }

  const followUps = await afterPaymentConfirmed(order.orderNumber, "[manual-payment]");
  return { ok: true, alreadyPaid: false, followUps };
}
