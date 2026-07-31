-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'ON_DELIVERY');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" VARCHAR(32) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "customerId" TEXT,
    "guestToken" VARCHAR(64) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(64) NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "shipLine1" VARCHAR(255) NOT NULL,
    "shipLine2" VARCHAR(255),
    "shipCity" VARCHAR(120) NOT NULL,
    "shipPostcode" VARCHAR(16) NOT NULL,
    "shipRegion" VARCHAR(120),
    "shipCountry" VARCHAR(2) NOT NULL DEFAULT 'GR',
    "wantsInvoice" BOOLEAN NOT NULL DEFAULT false,
    "companyName" VARCHAR(255),
    "vatNumber" VARCHAR(32),
    "taxOffice" VARCHAR(120),
    "companyTrade" VARCHAR(255),
    "billLine1" VARCHAR(255),
    "billCity" VARCHAR(120),
    "billPostcode" VARCHAR(16),
    "shippingMethod" VARCHAR(32) NOT NULL,
    "paymentMethod" VARCHAR(32) NOT NULL,
    "notes" TEXT,
    "subtotalNet" DECIMAL(12,2) NOT NULL,
    "subtotalGross" DECIMAL(12,2) NOT NULL,
    "shippingNet" DECIMAL(12,2) NOT NULL,
    "shippingGross" DECIMAL(12,2) NOT NULL,
    "paymentFeeNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentFeeGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "totalGross" DECIMAL(12,2) NOT NULL,
    "savingsGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingQuote" JSONB,
    "vivaOrderCode" VARCHAR(64),
    "vivaTransactionId" VARCHAR(64),
    "paidAt" TIMESTAMP(3),
    "acsVoucherNo" VARCHAR(64),
    "shippedAt" TIMESTAMP(3),
    "erpFindoc" INTEGER,
    "erpPushedAt" TIMESTAMP(3),
    "erpError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" VARCHAR(64),
    "mtrl" INTEGER,
    "sku" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "brand" VARCHAR(255),
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitNet" DECIMAL(12,2) NOT NULL,
    "unitGross" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "lineNet" DECIMAL(12,2) NOT NULL,
    "lineGross" DECIMAL(12,2) NOT NULL,
    "weightKg" DECIMAL(10,3),

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "actor" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_guestToken_key" ON "orders"("guestToken");

-- CreateIndex
CREATE UNIQUE INDEX "orders_vivaOrderCode_key" ON "orders"("vivaOrderCode");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_email_idx" ON "orders"("email");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "order_lines_orderId_idx" ON "order_lines"("orderId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "order_status_history"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
