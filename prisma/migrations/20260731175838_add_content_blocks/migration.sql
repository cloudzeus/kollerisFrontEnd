-- CreateTable
CREATE TABLE "content_blocks" (
    "key" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("key","locale")
);

-- CreateIndex
CREATE INDEX "content_blocks_locale_idx" ON "content_blocks"("locale");
