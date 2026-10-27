-- Admin SSO via HDCtool (design §4.2, §4.3).
-- Additive only: one nullable unique column, passwordHash relaxed to NULL
-- (same type, no data touched), and one new table.

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "hdctoolUserId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "admin_sso_jti" (
    "jti" VARCHAR(191) NOT NULL,
    "userId" VARCHAR(191),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_sso_jti_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "admin_sso_jti_expiresAt_idx" ON "admin_sso_jti"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_hdctoolUserId_key" ON "admin_users"("hdctoolUserId");

