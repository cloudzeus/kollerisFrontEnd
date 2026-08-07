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
