-- AlterTable
ALTER TABLE "products" ADD COLUMN     "variantGroup" VARCHAR(255);

-- CreateIndex
CREATE INDEX "products_isActive_variantGroup_idx" ON "products"("isActive", "variantGroup");

