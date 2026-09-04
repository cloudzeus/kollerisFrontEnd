-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "offerTitle" VARCHAR(160);

