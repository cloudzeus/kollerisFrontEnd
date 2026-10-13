-- Back-order requests («Κατόπιν παραγγελίας») — docs/backorder-requests.md.
-- Additive only: a new enum, nullable columns, two indexes. Every existing
-- order keeps NULL in all of them and behaves exactly as before.

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('REQUESTED', 'OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "offerExpiresAt" TIMESTAMP(3),
ADD COLUMN     "offerJson" JSONB,
ADD COLUMN     "offerRemindedAt" TIMESTAMP(3),
ADD COLUMN     "offerVersion" INTEGER,
ADD COLUMN     "parentOrderNumber" VARCHAR(32),
ADD COLUMN     "requestDecisionAt" TIMESTAMP(3),
ADD COLUMN     "requestLines" JSONB,
ADD COLUMN     "requestStatus" "RequestStatus",
ADD COLUMN     "requestToken" VARCHAR(64),
ADD COLUMN     "requestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "orders_requestToken_key" ON "orders"("requestToken");

-- CreateIndex
CREATE INDEX "orders_requestStatus_offerExpiresAt_idx" ON "orders"("requestStatus", "offerExpiresAt");
