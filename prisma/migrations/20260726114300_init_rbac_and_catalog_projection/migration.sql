-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('el', 'en', 'it');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'EDITOR', 'OPS');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(64),
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "ipAddress" VARCHAR(64),
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "code1" VARCHAR(64) NOT NULL,
    "code2" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "searchKey" TEXT NOT NULL,
    "mtrmark" INTEGER,
    "mtrcategory" INTEGER,
    "mtrgroup" INTEGER,
    "cccSubgroup2" INTEGER,
    "priceNet" DECIMAL(12,2),
    "priceList" DECIMAL(12,2),
    "vatRate" DECIMAL(5,2),
    "qty" DECIMAL(12,2),
    "priceSyncedAt" TIMESTAMP(3),
    "width" DECIMAL(10,2),
    "length" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "weight" DECIMAL(10,3),
    "guaranteeMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "onSale" BOOLEAN NOT NULL DEFAULT false,
    "erpInsertedAt" TIMESTAMP(3),
    "erpUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isFeature" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "searchKey" TEXT NOT NULL,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "fieldKey" VARCHAR(64) NOT NULL,
    "fieldGroup" VARCHAR(32) NOT NULL,
    "label" VARCHAR(128),
    "value" TEXT NOT NULL,
    "valueNumeric" DECIMAL(14,4),
    "unit" VARCHAR(16),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_overrides" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slugOverride" VARCHAR(140),
    "badges" JSONB,
    "editorialCopy" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "hideFromEshop" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redirects" (
    "id" TEXT NOT NULL,
    "fromPath" VARCHAR(512) NOT NULL,
    "toPath" VARCHAR(512) NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL,
    "channel" VARCHAR(64) NOT NULL,
    "cursor" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" "SyncRunStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_isActive_idx" ON "admin_users"("isActive");

-- CreateIndex
CREATE INDEX "admin_audit_log_entity_entityId_idx" ON "admin_audit_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_identifier_attemptedAt_idx" ON "login_attempts"("identifier", "attemptedAt");

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_attemptedAt_idx" ON "login_attempts"("ipAddress", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_mtrl_key" ON "products"("mtrl");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_isActive_mtrcategory_mtrgroup_cccSubgroup2_idx" ON "products"("isActive", "mtrcategory", "mtrgroup", "cccSubgroup2");

-- CreateIndex
CREATE INDEX "products_isActive_mtrmark_idx" ON "products"("isActive", "mtrmark");

-- CreateIndex
CREATE INDEX "products_isActive_priceNet_idx" ON "products"("isActive", "priceNet");

-- CreateIndex
CREATE INDEX "products_isActive_inStock_idx" ON "products"("isActive", "inStock");

-- CreateIndex
CREATE INDEX "products_isActive_onSale_idx" ON "products"("isActive", "onSale");

-- CreateIndex
CREATE INDEX "products_isActive_isNew_erpInsertedAt_idx" ON "products"("isActive", "isNew", "erpInsertedAt");

-- CreateIndex
CREATE INDEX "products_erpUpdatedAt_idx" ON "products"("erpUpdatedAt");

-- CreateIndex
CREATE INDEX "product_images_productId_order_idx" ON "product_images"("productId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "product_translations_productId_locale_key" ON "product_translations"("productId", "locale");

-- CreateIndex
CREATE INDEX "product_specs_fieldKey_valueNumeric_idx" ON "product_specs"("fieldKey", "valueNumeric");

-- CreateIndex
CREATE INDEX "product_specs_fieldKey_value_idx" ON "product_specs"("fieldKey", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_specs_productId_locale_fieldKey_key" ON "product_specs"("productId", "locale", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "product_overrides_productId_key" ON "product_overrides"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_overrides_slugOverride_key" ON "product_overrides"("slugOverride");

-- CreateIndex
CREATE UNIQUE INDEX "redirects_fromPath_key" ON "redirects"("fromPath");

-- CreateIndex
CREATE UNIQUE INDEX "sync_state_channel_key" ON "sync_state"("channel");

-- CreateIndex
CREATE INDEX "sync_runs_stateId_startedAt_idx" ON "sync_runs"("stateId", "startedAt");

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "sync_state"("id") ON DELETE CASCADE ON UPDATE CASCADE;
