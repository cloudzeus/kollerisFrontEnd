-- SEO text written from HDCtool, keyed by page path (Greek only).
-- Additive only: one new table. No row means the page keeps its automatic text.

-- CreateTable
CREATE TABLE "seo_page_overrides" (
    "path" VARCHAR(191) NOT NULL,
    "seoTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "faq" JSONB,
    "updatedBy" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_page_overrides_pkey" PRIMARY KEY ("path")
);
