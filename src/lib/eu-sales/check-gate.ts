/**
 * Whether «Έλεγχος» (or a blur) may start a VIES check now.
 *
 * Only a VIES check in flight blocks a new one. The "customer type" write that
 * typing away from a checked number fires (`setCustomerTypeAction`) must NOT:
 * it used to share one `pending` flag with the check, so an edit-then-click
 * disabled the button and the blur was dropped while that write was running —
 * the first click did nothing and the second worked.
 *
 * Pure and client-safe.
 */
export function mayStartVatCheck(input: {
  /** The number is well formed for the country. */
  formatOk: boolean;
  /** A VIES check is running (and only that). */
  checking: boolean;
  /** The number a check is already asking about, if any. */
  inFlight: string | null;
  /** The normalised number to ask about. */
  asked: string;
  /** The number the current answer is for, and that answer's status. */
  checkedFor: string | null;
  answerStatus: string | null;
}): boolean {
  if (!input.formatOk || input.checking) return false;
  if (input.inFlight === input.asked) return false;
  if (input.checkedFor === input.asked && input.answerStatus && input.answerStatus !== "unavailable") {
    return false;
  }
  return true;
}
