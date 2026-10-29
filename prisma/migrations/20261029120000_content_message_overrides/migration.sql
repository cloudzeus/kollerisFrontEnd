-- Editable overrides for next-intl message strings (content manager, Option 1).
-- Additive only: one new table. A row shadows messages/<locale>.json for one
-- dotted path; absence means the compiled catalogue value stands.

-- CreateTable
CREATE TABLE "message_overrides" (
    "locale" VARCHAR(5) NOT NULL,
    "path" VARCHAR(191) NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_overrides_pkey" PRIMARY KEY ("locale", "path")
);

-- CreateIndex
CREATE INDEX "message_overrides_locale_idx" ON "message_overrides"("locale");
