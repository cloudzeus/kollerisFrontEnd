-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('individual', 'company');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('pending', 'active', 'suspended', 'rejected');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('owner', 'buyer', 'viewer');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(64),
    "accountType" "AccountType" NOT NULL DEFAULT 'individual',
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "companyId" TEXT,
    "role" "CompanyRole",
    "spendLimit" DECIMAL(12,2),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "afm" VARCHAR(32) NOT NULL,
    "doy" VARCHAR(120),
    "profession" VARCHAR(255),
    "phone" VARCHAR(64),
    "billAddress" VARCHAR(255),
    "billCity" VARCHAR(120),
    "billPostcode" VARCHAR(16),
    "erpTrdr" INTEGER,
    "status" "AccountStatus" NOT NULL DEFAULT 'pending',
    "partnerFactor" DECIMAL(4,3),
    "creditLimit" DECIMAL(12,2),
    "creditUsed" DECIMAL(12,2),
    "approvedBy" VARCHAR(64),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invites" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "role" "CompanyRole" NOT NULL DEFAULT 'buyer',
    "spendLimit" DECIMAL(12,2),
    "companyId" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedBy" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_companyId_role_idx" ON "customers"("companyId", "role");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "companies_afm_key" ON "companies"("afm");

-- CreateIndex
CREATE INDEX "companies_status_createdAt_idx" ON "companies"("status", "createdAt");

-- CreateIndex
CREATE INDEX "companies_erpTrdr_idx" ON "companies"("erpTrdr");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_key" ON "customer_sessions"("token");

-- CreateIndex
CREATE INDEX "customer_sessions_customerId_idx" ON "customer_sessions"("customerId");

-- CreateIndex
CREATE INDEX "customer_sessions_expiresAt_idx" ON "customer_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invites_token_key" ON "customer_invites"("token");

-- CreateIndex
CREATE INDEX "customer_invites_expiresAt_idx" ON "customer_invites"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invites_companyId_email_key" ON "customer_invites"("companyId", "email");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invites" ADD CONSTRAINT "customer_invites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
