ALTER TABLE "products" ADD COLUMN "supplierAvailable" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "products_isActive_supplierAvailable_idx" ON "products"("isActive", "supplierAvailable");
