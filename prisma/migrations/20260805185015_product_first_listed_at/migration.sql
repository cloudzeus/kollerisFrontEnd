-- AlterTable
ALTER TABLE "products" ADD COLUMN     "firstListedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "products_isActive_firstListedAt_idx" ON "products"("isActive", "firstListedAt");

-- Backfill: every product already in the shop keeps the date the arrivals page
-- was showing for it, so the history on that page does not change when the
-- column it reads does. Only rows created from here on get a real listing date.
-- `createdAt` covers the handful whose ERP date never arrived.
UPDATE "products"
   SET "firstListedAt" = COALESCE("erpInsertedAt", "createdAt")
 WHERE "firstListedAt" IS NULL;
