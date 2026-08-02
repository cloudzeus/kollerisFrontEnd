-- CreateEnum
CREATE TYPE "OfferWidget" AS ENUM ('strip', 'card', 'marquee', 'countdown');

-- AlterTable
ALTER TABLE "offers" ADD COLUMN "widget" "OfferWidget" NOT NULL DEFAULT 'strip';
