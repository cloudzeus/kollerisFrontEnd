/**
 * How long an unpaid bank-transfer order holds its stock.
 *
 * One number, in one place, used by everything that either enforces the hold or
 * mentions it. It used to be three: the checkout said «3 εργάσιμες», the deposit
 * email repeated it, and the Viva payment code was issued with a seven-day
 * timeout — three answers to one question, and the only one the software
 * enforced was the wrong one.
 */
export const STOCK_HOLD_HOURS = 3;

/**
 * How long the Viva payment code of a bank transfer stays valid.
 *
 * NOT the stock hold. The two were one number, and that number was three
 * hours: HDC-20261028-0001 was placed at 21:03, its code died at 00:03, and
 * the customer's transfer was executed the next evening — a SEPA credit
 * between Greek banks routinely takes a working day. The money arrived at a
 * code that no longer existed, Viva could not match it, and the order sat
 * «Αναμένεται πληρωμή» with nobody told.
 *
 * The hold says how long we promise the STOCK; this says how long we can still
 * RECOGNISE the money. A late payment for goods we no longer hold is a
 * conversation with the customer, not a deposit lost in a ledger.
 */
export const BANK_PAYMENT_CODE_DAYS = 7;

/** When a hold starting now lapses. */
export function holdExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + STOCK_HOLD_HOURS * 60 * 60 * 1000);
}

/**
 * How many hours THIS order was held for.
 *
 * Measured from the order rather than read off the constant, and that is the
 * whole reason `reservedUntil` is a column. The window is a commercial decision
 * that will change; when it does, an order placed under the old one must keep
 * saying what its customer was actually promised. A constant in the copy would
 * silently rewrite history for every order already in the database.
 *
 * Rounded to the nearest hour, because the stamp is taken a few milliseconds
 * after `createdAt` and «3 ώρες» is the promise, not 2.9997.
 */
export function holdHours(createdAt: Date, reservedUntil: Date): number {
  const hours = (reservedUntil.getTime() - createdAt.getTime()) / 3_600_000;
  return Math.max(1, Math.round(hours));
}
