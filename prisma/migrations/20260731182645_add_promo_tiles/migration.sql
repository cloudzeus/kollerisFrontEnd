-- CreateTable
CREATE TABLE "promo_tiles" (
    "position" INTEGER NOT NULL,
    "eyebrow" VARCHAR(40) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(160) NOT NULL,
    "href" VARCHAR(255) NOT NULL,
    "imageUrl" TEXT,
    "imageProductId" VARCHAR(64),
    "dark" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_tiles_pkey" PRIMARY KEY ("position")
);
