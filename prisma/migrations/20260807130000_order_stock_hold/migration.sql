-- When the stock hold on a bank-transfer order lapses.
--
-- Recorded per order rather than computed from a constant: the window is a
-- commercial decision, and every order already placed was promised the window
-- in force when it was placed. A constant describes today's policy; this column
-- remembers what each customer was told.
--
-- Nullable and not backfilled. Orders placed before now were promised
-- «3 εργάσιμες» by a checkout that never wrote a deadline anywhere, and
-- inventing one for them now would be a guess recorded as a commitment.
ALTER TABLE "orders" ADD COLUMN "reservedUntil" TIMESTAMP(3);
CREATE INDEX "orders_reservedUntil_idx" ON "orders"("reservedUntil");
