/*
  Warnings:

  - The primary key for the `banner_placements` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `draft` on the `banner_placements` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `banner_placements` table. All the data in the column will be lost.
  - You are about to drop the column `published` on the `banner_placements` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAt` on the `banner_placements` table. All the data in the column will be lost.
  - You are about to drop the column `publishedBy` on the `banner_placements` table. All the data in the column will be lost.
  - You are about to drop the column `templateId` on the `banner_placements` table. All the data in the column will be lost.
  - Added the required column `bannerId` to the `banner_placements` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "banner_placements" DROP CONSTRAINT "banner_placements_templateId_fkey";

-- DropIndex
DROP INDEX "banner_placements_templateId_idx";

-- DropIndex
DROP INDEX "banner_placements_zone_key";

-- AlterTable
ALTER TABLE "banner_placements" DROP CONSTRAINT "banner_placements_pkey",
DROP COLUMN "draft",
DROP COLUMN "id",
DROP COLUMN "published",
DROP COLUMN "publishedAt",
DROP COLUMN "publishedBy",
DROP COLUMN "templateId",
ADD COLUMN     "bannerId" TEXT NOT NULL,
ADD CONSTRAINT "banner_placements_pkey" PRIMARY KEY ("zone");

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "templateId" TEXT NOT NULL,
    "published" JSONB,
    "draft" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" VARCHAR(120),
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_templateId_idx" ON "banners"("templateId");

-- CreateIndex
CREATE INDEX "banner_placements_bannerId_idx" ON "banner_placements"("bannerId");

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "grid_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_placements" ADD CONSTRAINT "banner_placements_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
