/*
  Warnings:

  - You are about to drop the `promo_tiles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "promo_tiles";

-- CreateTable
CREATE TABLE "zone_widgets" (
    "id" TEXT NOT NULL,
    "zone" VARCHAR(64) NOT NULL,
    "type" VARCHAR(48) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "props" JSONB NOT NULL,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zone_widgets_zone_order_idx" ON "zone_widgets"("zone", "order");
