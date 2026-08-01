-- CreateTable
CREATE TABLE "grid_templates" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "columns" INTEGER NOT NULL DEFAULT 12,
    "rows" INTEGER NOT NULL DEFAULT 6,
    "cells" JSONB NOT NULL,
    "aspect" VARCHAR(12),
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grid_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_placements" (
    "id" TEXT NOT NULL,
    "zone" VARCHAR(64) NOT NULL,
    "templateId" TEXT NOT NULL,
    "published" JSONB,
    "draft" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" VARCHAR(120),
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banner_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "badge" VARCHAR(40),
    "href" VARCHAR(255) NOT NULL,
    "image" TEXT,
    "imageWide" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banner_placements_zone_key" ON "banner_placements"("zone");

-- CreateIndex
CREATE INDEX "banner_placements_templateId_idx" ON "banner_placements"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "offers_slug_key" ON "offers"("slug");

-- CreateIndex
CREATE INDEX "offers_isActive_endsAt_idx" ON "offers"("isActive", "endsAt");

-- AddForeignKey
ALTER TABLE "banner_placements" ADD CONSTRAINT "banner_placements_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "grid_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
