-- CreateEnum
CREATE TYPE "ErpType" AS ENUM ('CATEGORY', 'GROUP', 'SUBGROUP');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "hdcId" TEXT NOT NULL,
    "erpCode" VARCHAR(32) NOT NULL,
    "erpType" "ErpType" NOT NULL,
    "parentId" TEXT,
    "slug" VARCHAR(140) NOT NULL,
    "nameEl" VARCHAR(255) NOT NULL,
    "nameEn" VARCHAR(255) NOT NULL,
    "nameIt" VARCHAR(255) NOT NULL,
    "mainImage" TEXT,
    "heroImage" TEXT,
    "iconImage" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "childCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "hdcId" TEXT NOT NULL,
    "mtrmark" INTEGER,
    "slug" VARCHAR(140) NOT NULL,
    "nameEl" VARCHAR(255) NOT NULL,
    "nameEn" VARCHAR(255) NOT NULL,
    "nameIt" VARCHAR(255) NOT NULL,
    "logo" TEXT,
    "image" TEXT,
    "isEshop" BOOLEAN NOT NULL DEFAULT false,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "inStockCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_hdcId_key" ON "categories"("hdcId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_erpType_order_idx" ON "categories"("erpType", "order");

-- CreateIndex
CREATE INDEX "categories_parentId_order_idx" ON "categories"("parentId", "order");

-- CreateIndex
CREATE INDEX "categories_erpType_productCount_idx" ON "categories"("erpType", "productCount");

-- CreateIndex
CREATE UNIQUE INDEX "brands_hdcId_key" ON "brands"("hdcId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_isEshop_productCount_idx" ON "brands"("isEshop", "productCount");

-- CreateIndex
CREATE INDEX "brands_mtrmark_idx" ON "brands"("mtrmark");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
