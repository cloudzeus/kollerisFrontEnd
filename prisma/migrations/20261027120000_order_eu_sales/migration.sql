-- EU sales with DHL and VIES (intra-EU sales design §3).
-- Additive only: nullable columns plus two with defaults. Every existing
-- order reads billCountry = 'GR' and vatMode = 'standard', which is what it was.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billCountry" VARCHAR(2) NOT NULL DEFAULT 'GR',
ADD COLUMN     "customerType" VARCHAR(16),
ADD COLUMN     "dhlNetAmount" DECIMAL(12,2),
ADD COLUMN     "dhlProductCode" VARCHAR(16),
ADD COLUMN     "dhlQuotedAt" TIMESTAMP(3),
ADD COLUMN     "dhlVatRate" DECIMAL(5,2),
ADD COLUMN     "vatMode" VARCHAR(24) NOT NULL DEFAULT 'standard',
ADD COLUMN     "viesAddress" TEXT,
ADD COLUMN     "viesCheckedAt" TIMESTAMP(3),
ADD COLUMN     "viesConsultationNumber" VARCHAR(64),
ADD COLUMN     "viesName" VARCHAR(255),
ADD COLUMN     "viesValid" BOOLEAN;
