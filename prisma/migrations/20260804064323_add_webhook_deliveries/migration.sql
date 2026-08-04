-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" VARCHAR(64) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "seq" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_deliveries_source_receivedAt_idx" ON "webhook_deliveries"("source", "receivedAt");
