-- CreateTable
CREATE TABLE "product_colors" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sizes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" VARCHAR(64) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "family" VARCHAR(120),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_colors_productId_order_idx" ON "product_colors"("productId", "order");

-- CreateIndex
CREATE INDEX "product_colors_name_idx" ON "product_colors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_colors_productId_externalId_key" ON "product_colors"("productId", "externalId");

-- CreateIndex
CREATE INDEX "product_sizes_productId_order_idx" ON "product_sizes"("productId", "order");

-- CreateIndex
CREATE INDEX "product_sizes_family_label_idx" ON "product_sizes"("family", "label");

-- CreateIndex
CREATE UNIQUE INDEX "product_sizes_productId_externalId_key" ON "product_sizes"("productId", "externalId");

-- AddForeignKey
ALTER TABLE "product_colors" ADD CONSTRAINT "product_colors_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

