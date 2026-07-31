-- CreateEnum
CREATE TYPE "ContactTopic" AS ENUM ('technical', 'quote', 'partnership', 'order', 'other');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('new', 'inProgress', 'answered', 'closed');

-- DropIndex
DROP INDEX "brands_nameEl_trgm_idx";

-- DropIndex
DROP INDEX "categories_nameEl_trgm_idx";

-- DropIndex
DROP INDEX "products_code1_idx";

-- DropIndex
DROP INDEX "products_code2_idx";

-- DropIndex
DROP INDEX "products_code_idx";

-- DropIndex
DROP INDEX "products_searchKey_trgm_idx";

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "topic" "ContactTopic" NOT NULL,
    "status" "ContactStatus" NOT NULL DEFAULT 'new',
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(64),
    "company" VARCHAR(255),
    "vatNumber" VARCHAR(32),
    "subject" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "orderRef" VARCHAR(32),
    "pagePath" VARCHAR(512),
    "locale" "Locale" NOT NULL DEFAULT 'el',
    "customerId" VARCHAR(64),
    "handledBy" VARCHAR(64),
    "handledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_status_createdAt_idx" ON "contact_messages"("status", "createdAt");

-- CreateIndex
CREATE INDEX "contact_messages_topic_createdAt_idx" ON "contact_messages"("topic", "createdAt");

-- CreateIndex
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");
