-- Η ημέρα παραλαβής του αποστολικού, ημερολογιακή.
-- Nullable: τα υπάρχοντα αποστολικά δεν την έχουν, και η σανίδα πέφτει πίσω
-- στο `shippedAt` γι' αυτά.
ALTER TABLE "orders" ADD COLUMN "acsPickupDate" VARCHAR(10);
